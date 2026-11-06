import { createPublicClient, createWalletClient, ExpirationTime } from "@arkiv-network/sdk"
import { rabdi } from "@arkiv-network/sdk/chains"
import { and, eq } from "@arkiv-network/sdk/query"
import { defineSchema, str, u64 } from "@arkiv-network/sdk/schema"
import { http, type Hex } from "viem"
import { privateKeyToAccount } from "viem/accounts"

// Ownback registry schemas (names are versioned so a v2 never mixes with v1)
export const SupplierOf = defineSchema("ownback.supplier-of.v1", {
  supplier_id: str().indexed(),
  customer_id: str().indexed(),
  product:     str().indexed(),
  role:        str(),
  source_url:  str(),
  quote:       str(),
  year:        u64(),
})

export const Asset = defineSchema("ownback.asset.v1", {
  asset_id:      str().indexed(),
  chain:         str().indexed(),
  issuer:        str().indexed(),
  symbol:        str(),
  mint:          str(),
  decimals:      u64(),
  verified_from: str(),
})

const chain = rabdi({ accessKey: process.env.ARKIV_ACCESS_KEY ?? "" })
export const publicClient = createPublicClient({ chain, transport: http() })

// READ: who supplies Apple? Anyone can write entities with our schema tag, and changeOwnership can hand one to us,
// so every read requires BOTH createdBy and ownedBy = our writer.
export async function suppliersOf(customerId: string, writer: Hex) {
  const res = await publicClient
    .select({ $key: true, supplier_id: true, role: true, source_url: true, quote: true })
    .from(SupplierOf)
    .where(and(eq("customer_id", customerId)))
    .createdBy(writer)
    .ownedBy(writer)
    .limit(50)
    .fetch()
  return res.entities
}

// WRITE (registry import): needs a funded tGLM key; type-checked here, not run.
export async function writeSupplier(pk: Hex) {
  const walletClient = createWalletClient({ chain, transport: http(), account: privateKeyToAccount(pk) })
  return walletClient.createEntity(
    SupplierOf,
    { supplier_id: "co:tsmc", customer_id: "co:apple", product: "iphone",
      role: "Makes the A19 chip", source_url: "https://example.org/source", quote: "exact sentence from the source goes here", year: u64(2026n) },
    { expiration: ExpirationTime.fromDays(180) },
  )
}

if (process.argv[2] === "read") {
  const writer = (process.argv[3] ?? "0x0000000000000000000000000000000000000001") as Hex
  const t = Date.now()
  // no top-level await: root has no "type":"module", so tsx emits cjs
  void (async () => {
    const rows = await suppliersOf("co:apple", writer)
    console.log("query ok:", rows.length, "rows in", Date.now() - t, "ms")
    const any = await publicClient.select({ $key: true }).where(eq("arkiv.schema", "posts")).limit(3).fetch()
    console.log("live data query ok, sample keys:", any.entities.map((e: any) => e.$key))
  })()
}
