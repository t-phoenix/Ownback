/**
 * D43 lighter gate: approve every issuer-listed Solana stock token in the catalog whose mint reads on-chain as an
 * SPL / Token-2022 mint. Tradability is checked live per buy (quote + fee cap), not here.
 * Appends mints after existing ones, so an asset's first (primary) mint never changes.
 * Usage: npx tsx scripts/promote-catalog.ts [--dry]
 */
import { readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const REG = resolve(process.cwd(), 'database/registry')
const RPC = process.env.RPC_SOLANA || 'https://api.mainnet-beta.solana.com'
const PROGRAMS = new Set(['TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA', 'TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb'])
const CLASS: Record<string, 'stock' | 'commodity' | 'index'> = { stock: 'stock', etf: 'stock', commodity: 'commodity', index: 'index' }
const RAW: Record<string, string> = { xStocks: 'raw/xstocks-solana.csv', Ondo: 'raw/ondo-solana.csv' }

type Tok = { assetId: string; issuer: string; symbol: string; name: string; class: string; chain: string; mint: string | null }
type MintRow = { chain: 'solana'; symbol: string; mint: string; decimals: number; issuer: string; venues: string[]; verified: boolean; evidence: { kind: string; url: string; note: string; checkedAt: string }[] }
type Asset = { assetId: string; name: string; class: string; mints: MintRow[] }

const read = <T>(f: string): T => JSON.parse(readFileSync(resolve(REG, f), 'utf8')) as T

async function mintInfo(mints: string[]): Promise<Map<string, { owner: string; decimals: number }>> {
  const out = new Map<string, { owner: string; decimals: number }>()
  for (let i = 0; i < mints.length; i += 100) {
    const chunk = mints.slice(i, i + 100)
    const res = await fetch(RPC, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getMultipleAccounts', params: [chunk, { encoding: 'jsonParsed' }] }),
    })
    const body = (await res.json()) as { result?: { value: ({ owner: string; data: { parsed?: { type: string; info: { decimals: number } } } } | null)[] } }
    if (!body.result) throw new Error(`rpc failed: ${JSON.stringify(body).slice(0, 200)}`)
    body.result.value.forEach((v, j) => {
      if (v && PROGRAMS.has(v.owner) && v.data.parsed?.type === 'mint') out.set(chunk[j]!, { owner: v.owner, decimals: v.data.parsed.info.decimals })
    })
  }
  return out
}

async function main() {
  const dry = process.argv.includes('--dry')
  const today = new Date().toISOString().slice(0, 10)
  const curated = read<{ updatedAt: string; assets: Asset[] }>('assets-curated.json')
  const companies = new Map(read<{ companies: { assetId: string; name: string; class: string }[] }>('catalog-companies.json').companies.map((c) => [c.assetId, c]))
  const have = new Set(curated.assets.flatMap((a) => a.mints.map((m) => m.mint)))
  const todo = read<{ tokens: Tok[] }>('catalog-tokens.json').tokens.filter(
    (t) => t.chain === 'solana' && t.mint && RAW[t.issuer] && CLASS[t.class] && !have.has(t.mint),
  )
  const info = await mintInfo(todo.map((t) => t.mint!))
  const byId = new Map(curated.assets.map((a) => [a.assetId, a]))
  const added: Record<string, number> = {}
  const skipped: string[] = []
  for (const t of todo) {
    const oc = info.get(t.mint!)
    if (!oc) { skipped.push(`${t.symbol}:not_a_mint`); continue }
    let a = byId.get(t.assetId)
    if (!a) {
      const c = companies.get(t.assetId)
      a = { assetId: t.assetId, name: c?.name ?? t.name, class: CLASS[c?.class ?? t.class] ?? 'stock', mints: [] }
      curated.assets.push(a)
      byId.set(a.assetId, a)
    }
    a.mints.push({
      chain: 'solana', symbol: t.symbol, mint: t.mint!, decimals: oc.decimals, issuer: t.issuer, venues: ['jupiter'], verified: true,
      evidence: [
        { kind: 'issuer', url: `database/registry/${RAW[t.issuer]}`, note: `issuer list mint for symbol ${t.symbol}`, checkedAt: today },
        { kind: 'onchain', url: 'solana:getMultipleAccounts', note: `decimals=${oc.decimals} owner=${oc.owner}`, checkedAt: today },
      ],
    })
    added[t.issuer] = (added[t.issuer] ?? 0) + 1
  }
  curated.assets.sort((x, y) => x.assetId.localeCompare(y.assetId))
  console.log(JSON.stringify({ candidates: todo.length, added, skipped: skipped.length, sample: skipped.slice(0, 10), assets: curated.assets.length }))
  if (!dry) {
    curated.updatedAt = today
    writeFileSync(resolve(REG, 'assets-curated.json'), `${JSON.stringify(curated, null, 2)}\n`)
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
