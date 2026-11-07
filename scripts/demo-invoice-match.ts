/**
 * Prod-path demo: typed invoice → 0G read + find_maker → Confirm-shaped JSON.
 * Usage: npx tsx --env-file=backend/.env scripts/demo-invoice-match.ts
 */
import { getSql } from '../backend/src/db/client.ts'
import { readPurchase } from '../backend/src/lib/og/read.ts'
import { catalogMeta, getCatalogCompany } from '../backend/src/lib/registry/catalog.ts'
import { newId } from '../backend/src/lib/ids.ts'
import { getAsset, verifiedMint } from '../backend/src/shared/assets.ts'
import { toUsd6 } from '../backend/src/shared/money.ts'

async function main() {
  const meta = catalogMeta()
  console.log('=== storage ===')
  console.log(JSON.stringify(meta, null, 2))

  const sql = getSql()
  const email = 'demo-invoice@ownback.local'
  let user = await sql<{ id: string }[]>`SELECT id FROM users WHERE email = ${email} LIMIT 1`
  let userId = user[0]?.id
  if (!userId) {
    userId = newId()
    await sql`
      INSERT INTO users (id, auth_kind, email, display_name, referral_code, created_at)
      VALUES (${userId}::uuid, 'privy', ${email}, 'Demo', ${'DEMO' + userId.slice(0, 4)}, now())
    `
    await sql`
      INSERT INTO rules (user_id, rate_bps, monthly_cap_usd6, ready_min_usd6, fallback_asset,
        split_maker, split_behind, split_materials, buy_day, max_fee_bps, auto_add, updated_at)
      VALUES (${userId}::uuid, 500, 50000000, 5000000, 'idx:sp500', 70, 20, 10, 'sun', 500,
        '{"ethereum":{"on":false},"base":{"on":false},"arbitrum":{"on":false}}'::jsonb, now())
    `
  }

  const rules = await sql<{ rate_bps: number; fallback_asset: string; split_maker: number; split_behind: number; split_materials: number }[]>`
    SELECT rate_bps, fallback_asset, split_maker, split_behind, split_materials FROM rules WHERE user_id = ${userId}::uuid
  `
  const r = rules[0]!
  const purchaseId = newId()
  await sql`
    INSERT INTO purchases (id, user_id, source, status, created_at, updated_at)
    VALUES (${purchaseId}::uuid, ${userId}::uuid, 'typed', 'reading', now(), now())
  `

  const invoiceText =
    'Croma invoice: Apple iPhone 17 Pro 256GB, total 95500.00 INR, purchased in Mumbai. Brand Apple.'

  console.log('=== running 0G read + match ===')
  console.log('invoice:', invoiceText)
  const outcome = await readPurchase(purchaseId, userId, r, {
    kind: 'text',
    text: invoiceText,
    makerHint: 'Apple',
  })
  console.log('outcome:', outcome)

  const p = (
    await sql<Record<string, unknown>[]>`SELECT * FROM purchases WHERE id = ${purchaseId}::uuid`
  )[0]!
  const allocs = await sql<
    { asset_id: string; role: string; amount_usd6: bigint; selected: boolean; why: string | null }[]
  >`SELECT asset_id, role, amount_usd6, selected, why FROM allocations WHERE purchase_id = ${purchaseId}::uuid`
  const og = await sql<{ job: string; og_request_id: string | null; ok: boolean; latency_ms: number | null }[]>`
    SELECT job, og_request_id, ok, latency_ms FROM ai_runs WHERE purchase_id = ${purchaseId}::uuid ORDER BY created_at
  `

  const frontendConfirm = {
    id: p.id,
    status: p.status,
    receipt: {
      shop: p.shop,
      place: p.place,
      date: p.purchased_on,
      items: p.items,
      local: { amount: String(p.amount_local), currency: p.currency },
      fxRate: String(p.fx_rate),
      amountUsd6: toUsd6((p.amount_usd6 as bigint) ?? 0n),
    },
    investUsd6: p.invest_usd6 != null ? toUsd6(p.invest_usd6 as bigint) : null,
    rateBps: p.rate_bps,
    split: p.split,
    allocations: allocs.map((a) => {
      const cat = getCatalogCompany(a.asset_id)
      const mint = verifiedMint(a.asset_id, 'solana')
      return {
        assetId: a.asset_id,
        name: getAsset(a.asset_id)?.name ?? cat?.name ?? a.asset_id,
        role: a.role,
        tokenized: Boolean(mint || cat?.tokenized),
        verifiedBuyable: Boolean(mint),
        token: mint?.symbol ?? cat?.tokens[0]?.symbol,
        chain: mint ? 'solana' : cat?.tokens[0]?.chain,
        venue: mint ? 'jupiter' : undefined,
        mint: mint?.mint,
        amountUsd6: toUsd6(a.amount_usd6),
        selected: a.selected,
        why: a.why,
      }
    }),
    ogRuns: og,
  }

  console.log('=== frontend Confirm payload ===')
  console.log(JSON.stringify(frontendConfirm, null, 2))
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
