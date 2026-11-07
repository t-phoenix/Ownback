/**
 * Normalize issuer dumps → structured registry JSON the backend loads.
 * Usage: npx tsx scripts/build-rwa-catalog.ts
 *
 * Storage decision:
 * - Long discovery catalog → database/registry/*.json (backend filesystem; not Arkiv)
 * - Verified buyable mints only → assets-curated.json + Arkiv ownback.asset.v1
 */
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const ROOT = resolve(process.cwd())
const RAW = resolve(ROOT, 'database/registry/raw')
const OUT = resolve(ROOT, 'database/registry')

type TokenRow = {
  id: string
  assetId: string
  issuer: 'xStocks' | 'Ondo' | 'Hyperliquid'
  symbol: string
  name: string
  underlyingTicker: string | null
  class: 'stock' | 'etf' | 'commodity' | 'index' | 'currency' | 'portfolio' | 'perp'
  chain: 'solana' | 'hyperliquid'
  mint: string | null
  market: string | null
  status: 'candidate' | 'verified'
  swap: string
  decimals: number | null
}

type CompanyRow = {
  assetId: string
  name: string
  ticker: string | null
  listed: boolean
  class: TokenRow['class']
  tokenized: boolean
  verifiedBuyable: boolean
  aliases: string[]
  tokens: { issuer: string; symbol: string; chain: string; mint: string | null; status: string }[]
}

const FRIENDLY: Record<string, { assetId: string; name: string }> = {
  AAPL: { assetId: 'co:apple', name: 'Apple' },
  TSLA: { assetId: 'co:tesla', name: 'Tesla' },
  MSFT: { assetId: 'co:microsoft', name: 'Microsoft' },
  NVDA: { assetId: 'co:nvidia', name: 'NVIDIA' },
  AMZN: { assetId: 'co:amazon', name: 'Amazon' },
  META: { assetId: 'co:meta', name: 'Meta' },
  NFLX: { assetId: 'co:netflix', name: 'Netflix' },
  COIN: { assetId: 'co:coinbase', name: 'Coinbase' },
  HOOD: { assetId: 'co:robinhood', name: 'Robinhood' },
  MCD: { assetId: 'co:mcdonalds', name: "McDonald's" },
  MRK: { assetId: 'co:merck', name: 'Merck' },
  AZN: { assetId: 'co:astrazeneca', name: 'AstraZeneca' },
  TSM: { assetId: 'co:tsmc', name: 'TSMC' },
  QCOM: { assetId: 'co:qualcomm', name: 'Qualcomm' },
  GLW: { assetId: 'co:corning', name: 'Corning' },
  NKE: { assetId: 'co:nike', name: 'Nike' },
  UL: { assetId: 'co:unilever', name: 'Unilever' },
  KO: { assetId: 'co:cocacola', name: 'Coca-Cola' },
  PEP: { assetId: 'co:pepsico', name: 'PepsiCo' },
  SPY: { assetId: 'idx:sp500', name: 'S&P 500' },
  QQQ: { assetId: 'idx:nasdaq100', name: 'Nasdaq 100' },
  GLD: { assetId: 'mat:gold', name: 'Gold' },
  IAU: { assetId: 'mat:gold', name: 'Gold' },
  SLV: { assetId: 'mat:silver', name: 'Silver' },
  USO: { assetId: 'mat:oil', name: 'Oil (USO)' },
  BNO: { assetId: 'mat:oil', name: 'Oil (Brent)' },
  UNG: { assetId: 'mat:natgas', name: 'Natural gas' },
}

function parseCsv(path: string): Record<string, string>[] {
  const text = readFileSync(path, 'utf8')
  const lines = text.split(/\r?\n/).filter(Boolean)
  if (!lines.length) return []
  const headers = splitCsvLine(lines[0]!)
  return lines.slice(1).map((line) => {
    const cols = splitCsvLine(line)
    const row: Record<string, string> = {}
    headers.forEach((h, i) => {
      row[h] = cols[i] ?? ''
    })
    return row
  })
}

function splitCsvLine(line: string): string[] {
  const out: string[] = []
  let cur = ''
  let q = false
  for (let i = 0; i < line.length; i++) {
    const c = line[i]!
    if (c === '"') {
      if (q && line[i + 1] === '"') {
        cur += '"'
        i++
      } else q = !q
      continue
    }
    if (c === ',' && !q) {
      out.push(cur)
      cur = ''
      continue
    }
    cur += c
  }
  out.push(cur)
  return out
}

function slugTicker(t: string): string {
  return t.toLowerCase().replace(/[^a-z0-9]+/g, '')
}

function mapAsset(ticker: string | null, symbol: string, name: string): { assetId: string; name: string; class: TokenRow['class'] } {
  const t = (ticker || '').toUpperCase()
  if (FRIENDLY[t]) return { ...FRIENDLY[t], class: FRIENDLY[t].assetId.startsWith('mat:') || FRIENDLY[t].assetId.startsWith('idx:') ? (FRIENDLY[t].assetId.startsWith('idx:') ? 'index' : 'commodity') : 'stock' }
  const sym = symbol.toUpperCase()
  if (sym === 'GLDX' || sym.startsWith('GLD')) return { assetId: 'mat:gold', name: 'Gold', class: 'commodity' }
  if (sym === 'SLVX' || sym.startsWith('SLV')) return { assetId: 'mat:silver', name: 'Silver', class: 'commodity' }
  if (sym === 'USOX' || sym === 'USOON' || sym === 'BNOON') return { assetId: 'mat:oil', name: 'Oil', class: 'commodity' }
  if (t) return { assetId: `co:${slugTicker(t)}`, name: name.replace(/\s*\(.*\)\s*$/, '').replace(/\s+xStock$/i, '').trim() || t, class: 'stock' }
  return { assetId: `co:${slugTicker(symbol)}`, name, class: 'stock' }
}

function tokenId(issuer: string, chain: string, mintOrMarket: string) {
  return createHash('sha256').update(`${issuer}:${chain}:${mintOrMarket}`).digest('hex').slice(0, 16)
}

function loadCuratedVerified(): Set<string> {
  try {
    const curated = JSON.parse(readFileSync(resolve(OUT, 'assets-curated.json'), 'utf8')) as {
      assets: { assetId: string; mints: { chain: string; mint: string; verified: boolean }[] }[]
    }
    const s = new Set<string>()
    for (const a of curated.assets) {
      for (const m of a.mints) {
        if (m.verified) s.add(`${a.assetId}:${m.chain}:${m.mint}`)
      }
    }
    return s
  } catch {
    return new Set()
  }
}

function main() {
  const verified = loadCuratedVerified()
  const tokens: TokenRow[] = []

  for (const r of parseCsv(resolve(RAW, 'xstocks-solana.csv'))) {
    const symbol = r.symbol
    const mint = r.mint
    if (!symbol || !mint) continue
    const underlying = symbol.replace(/x$/i, '').toUpperCase()
    const mapped = mapAsset(underlying, symbol, r.name || symbol)
    const key = `${mapped.assetId}:solana:${mint}`
    tokens.push({
      id: tokenId('xStocks', 'solana', mint),
      assetId: mapped.assetId,
      issuer: 'xStocks',
      symbol,
      name: r.name || symbol,
      underlyingTicker: underlying,
      class: mapped.class === 'stock' && /ETF|Trust|Fund|Shares/i.test(r.name || '') ? 'etf' : mapped.class,
      chain: 'solana',
      mint,
      market: null,
      status: verified.has(key) ? 'verified' : 'candidate',
      swap: 'jupiter_usdc',
      decimals: null,
    })
  }

  for (const r of parseCsv(resolve(RAW, 'ondo-solana.csv'))) {
    const symbol = r.symbol
    const mint = r.mint
    if (!symbol || !mint) continue
    if (symbol === 'USDon') {
      tokens.push({
        id: tokenId('Ondo', 'solana', mint),
        assetId: 'cash:usdon',
        issuer: 'Ondo',
        symbol,
        name: r.name || 'USDon',
        underlyingTicker: null,
        class: 'currency',
        chain: 'solana',
        mint,
        market: null,
        status: 'candidate',
        swap: 'ondo_usdon_psm',
        decimals: null,
      })
      continue
    }
    const ticker = (r.stock_ticker || '').toUpperCase() || null
    const mapped = mapAsset(ticker, symbol, r.name || symbol)
    let cls: TokenRow['class'] = mapped.class
    if ((r.type || '').toLowerCase() === 'etf') cls = 'etf'
    if ((r.type || '').toLowerCase() === 'portfolio') cls = 'portfolio'
    if (mapped.assetId.startsWith('mat:')) cls = 'commodity'
    if (mapped.assetId.startsWith('idx:')) cls = 'index'
    const key = `${mapped.assetId}:solana:${mint}`
    tokens.push({
      id: tokenId('Ondo', 'solana', mint),
      assetId: mapped.assetId,
      issuer: 'Ondo',
      symbol,
      name: r.name || symbol,
      underlyingTicker: ticker,
      class: cls,
      chain: 'solana',
      mint,
      market: null,
      status: verified.has(key) ? 'verified' : 'candidate',
      swap: 'ondo_primary_usdon_or_jupiter',
      decimals: null,
    })
  }

  for (const r of parseCsv(resolve(RAW, 'hyperliquid-hip3-all.csv'))) {
    const market = r.market
    if (!market) continue
    const bare = market.includes(':') ? market.split(':').slice(1).join(':') : market
    tokens.push({
      id: tokenId('Hyperliquid', 'hyperliquid', market),
      assetId: `hl:${(r.dex || 'xyz').toLowerCase()}:${bare.toLowerCase()}`,
      issuer: 'Hyperliquid',
      symbol: bare,
      name: market,
      underlyingTicker: bare,
      class: 'perp',
      chain: 'hyperliquid',
      mint: null,
      market,
      status: 'candidate',
      swap: 'hyperliquid_usdc_perp',
      decimals: null,
    })
  }

  // Companies = non-perp, non-currency, grouped by assetId
  const byAsset = new Map<string, CompanyRow>()
  for (const t of tokens) {
    if (t.class === 'perp' || t.class === 'currency') continue
    let c = byAsset.get(t.assetId)
    if (!c) {
      c = {
        assetId: t.assetId,
        name: FRIENDLY[t.underlyingTicker || '']?.name || t.name.replace(/\s*\(Ondo Tokenized\).*$/i, '').replace(/\s+xStock$/i, '').trim(),
        ticker: t.underlyingTicker,
        listed: true,
        class: t.class,
        tokenized: false,
        verifiedBuyable: false,
        aliases: [],
        tokens: [],
      }
      byAsset.set(t.assetId, c)
    }
    c.tokenized = true
    if (t.status === 'verified') c.verifiedBuyable = true
    c.tokens.push({
      issuer: t.issuer,
      symbol: t.symbol,
      chain: t.chain,
      mint: t.mint,
      status: t.status,
    })
    if (t.underlyingTicker && !c.aliases.includes(t.underlyingTicker)) c.aliases.push(t.underlyingTicker)
    if (t.symbol && !c.aliases.includes(t.symbol)) c.aliases.push(t.symbol)
  }

  // Ensure wireframe companies exist even if missing from dump
  for (const [ticker, f] of Object.entries(FRIENDLY)) {
    if (!byAsset.has(f.assetId)) {
      byAsset.set(f.assetId, {
        assetId: f.assetId,
        name: f.name,
        ticker,
        listed: true,
        class: f.assetId.startsWith('mat:') ? 'commodity' : f.assetId.startsWith('idx:') ? 'index' : 'stock',
        tokenized: false,
        verifiedBuyable: false,
        aliases: [ticker],
        tokens: [],
      })
    }
  }

  const companies = [...byAsset.values()].sort((a, b) => a.assetId.localeCompare(b.assetId))
  const meta = {
    updatedAt: new Date().toISOString().slice(0, 10),
    storage: {
      discoveryCatalog: 'database/registry/catalog-{tokens,companies}.json (backend loads from disk)',
      verifiedBuyable: 'database/registry/assets-curated.json + Arkiv ownback.asset.v1',
      notInArkiv: 'Candidate / Hyperliquid perp rows stay off Arkiv until three-source promote',
    },
    counts: {
      tokens: tokens.length,
      companies: companies.length,
      verifiedTokens: tokens.filter((t) => t.status === 'verified').length,
      xstocks: tokens.filter((t) => t.issuer === 'xStocks').length,
      ondo: tokens.filter((t) => t.issuer === 'Ondo').length,
      hyperliquid: tokens.filter((t) => t.issuer === 'Hyperliquid').length,
    },
  }

  writeFileSync(resolve(OUT, 'catalog-meta.json'), `${JSON.stringify(meta, null, 2)}\n`)
  writeFileSync(resolve(OUT, 'catalog-tokens.json'), `${JSON.stringify({ updatedAt: meta.updatedAt, tokens }, null, 2)}\n`)
  writeFileSync(resolve(OUT, 'catalog-companies.json'), `${JSON.stringify({ updatedAt: meta.updatedAt, companies }, null, 2)}\n`)
  console.log(JSON.stringify(meta.counts, null, 2))
}

main()
