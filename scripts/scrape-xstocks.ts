/**
 * Pull xStocks featured products into database/registry/candidates.json (issuer evidence only).
 * Usage: npx tsx --env-file=backend/.env scripts/scrape-xstocks.ts
 * Then verify + promote via API or import-registry after three sources land.
 */
import { scrapeXstocksFeatured } from '../backend/src/lib/registry/scrape-xstocks.ts'

async function main() {
  const { proposed, skipped } = await scrapeXstocksFeatured()
  console.log(
    JSON.stringify(
      {
        proposed: proposed.map((c) => ({ id: c.id, assetId: c.assetId, symbol: c.symbol, mint: c.mint })),
        skipped,
      },
      null,
      2,
    ),
  )
}

void main()
