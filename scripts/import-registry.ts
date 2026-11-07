/**
 * Import verified rows from database/registry/assets-curated.json to Arkiv ownback.asset.v1.
 * Usage: npx tsx --env-file=backend/.env scripts/import-registry.ts
 * Requires ARKIV_ACCESS_KEY + ARKIV_WRITER_KEY (+ tGLM on writer).
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { writeAssetToArkiv } from '../backend/src/lib/arkiv/write-asset.ts'

type Curated = {
  assets: Array<{
    assetId: string
    mints: Array<{
      chain: string
      symbol: string
      mint: string
      decimals: number
      issuer: string
      verified: boolean
      evidence: unknown
    }>
  }>
}

async function main() {
  const path = resolve(process.cwd(), 'database/registry/assets-curated.json')
  const file = JSON.parse(readFileSync(path, 'utf8')) as Curated
  const results = []
  for (const a of file.assets) {
    for (const m of a.mints) {
      if (!m.verified) continue
      if (String(m.mint).includes('☐')) {
        console.error('refusing placeholder mint', a.assetId, m.chain)
        process.exit(2)
      }
      const kinds = Array.isArray(m.evidence)
        ? [...new Set((m.evidence as { kind: string }[]).map((e) => e.kind))].sort().join('+')
        : 'curated'
      const r = await writeAssetToArkiv({
        assetId: a.assetId,
        chain: m.chain,
        issuer: m.issuer,
        symbol: m.symbol,
        mint: m.mint,
        decimals: m.decimals,
        verifiedFrom: `${m.issuer}:${kinds}`.slice(0, 120),
      })
      results.push({ assetId: a.assetId, chain: m.chain, mint: m.mint, ...r })
    }
  }
  console.log(JSON.stringify(results, null, 2))
}

void main()
