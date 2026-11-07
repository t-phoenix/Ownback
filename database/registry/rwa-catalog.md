# RWA tradable catalog (issuer dumps)

Pulled **2026-11-07** from issuer / chain APIs. These rows are **research candidates**, not Ownback `verified=✓` mints. Promote only via the three-source gate ([asset-discovery.md](asset-discovery.md)).

## Where it is stored (production)

| Layer | What | Path / system |
|---|---|---|
| **Discovery catalog** (long list) | Companies + token rows for AI match / Fix-the-match | `database/registry/catalog-companies.json`, `catalog-tokens.json`, `catalog-meta.json` — **backend loads from disk** (`lib/registry/catalog.ts`) |
| **Issuer dumps** (raw) | CSV refreshes | `database/registry/raw/*.csv` |
| **Verified buyable** | Three-source ✓ mints only | `database/registry/assets-curated.json` **and** Arkiv `ownback.asset.v1` (writer-owned) |
| **Candidates** | Propose / verify / promote queue | `database/registry/candidates.json` |
| **Not on Arkiv** | Unverified xStocks/Ondo/Hyperliquid rows | Stay in JSON until promote — Arkiv is for trusted public buyable + supply-chain proofs, not a 2k-row dump |

Rebuild structured JSON: `npx tsx scripts/build-rwa-catalog.ts`  
API: `GET /api/catalog`, `/api/catalog/companies`, `/api/catalog/tokens`, `/api/assets` (buyable only).

## Counts

| Source | What | Count | File |
|---|---|---|---|
| **xStocks** (Backed) | Solana SPL mints (`*x`) | **1,435** | [raw/xstocks-solana.csv](raw/xstocks-solana.csv) |
| **Ondo Stocks / GM** | Official CSV rows with Solana mint (`*on` + USDon + 7 portfolios) | **458** | [raw/ondo-solana.csv](raw/ondo-solana.csv) · full multi-chain [raw/ondo-gm-tokens.csv](raw/ondo-gm-tokens.csv) |
| **Hyperliquid HIP-3** | Equity / commodity / index **perps** (USDC margin) across builder DEXes | **324** | [raw/hyperliquid-hip3-all.csv](raw/hyperliquid-hip3-all.csv) |
| └ trade.xyz (`xyz`) | Largest HIP-3 book | **143** | [raw/hyperliquid-xyz-markets.csv](raw/hyperliquid-xyz-markets.csv) |

Ondo CSV type mix (Solana): Stock 333 · ETF 117 · Portfolio 7 · Currency (USDon) 1.

## How to get USDC exposure (swap / venue partners)

### xStocks on Solana
- **Secondary (Ownback MVP path):** Jupiter aggregator — `USDC` (`EPjF…Dt1v`) → mint.
- **Issuer site:** https://xstocks.com/products (full product JSON in page `__NEXT_DATA__`).
- Also listed across EVM chains in the same product `addresses` object (Eth, Arb, BSC, …) — Solana column is what we export.

### Ondo on Solana
- **Primary (issuer):** mint / redeem via Ondo Global Markets using **USDon**  
  Solana USDon: `ZPFtoCe7WWqG4N3ZFRccS8T9SMBeHsd1Vmgv2i7ondo`  
  Platform atomically converts USDC ↔ USDon on subscribe/redeem (docs: Available Assets / Investing).
- **Secondary:** Jupiter / **1inch** on Solana (Ondo + 1inch announcement); deeper books vary by ticker.
- **API (needs `x-api-key`):** `https://api.gm.ondo.finance` — addresses, metadata, attestations ([docs](https://docs.ondo.finance/api-reference/overview.md)).
- **Partners called out by Ondo:** Bitget, Trust Wallet, OKX, HTX, 1inch, CoW Protocol, Ledger, BitGo, CoinGecko, Morpho, Gauntlet, Alpaca, Nest Exchange (Binance ADGM MTF) — eligibility still Reg S / non-US for many products.
- Bridge columns also exist for **HyperEVM** and **Robinhood Chain** in the CSV (not Solana spot).

### Hyperliquid (HIP-3) — not the same product
- These are **perpetual futures** on equity / commodity prices, settled in **USDC**. You do **not** receive an SPL/ERC20 share token.
- Deployers (`POST /info` `perpDexs`): `xyz` (trade.xyz), `io`, `para`, `flx`, `vntl`, `hyna`, `km`/`mkts`, `cash`, …
- Trade via Hyperliquid + the builder DEX UI (e.g. trade.xyz). Collateral = USDC on Hyperliquid.
- **Ownback implication:** useful as a **price / venue quote** surface later; jar “buy tokenized share into wallet” still needs xStocks/Ondo (or similar) spot mints, not HIP-3 perps.

## Commodities & commodity ETFs (subset)

Heuristic name/ticker filter — full extracts:

- [raw/commodities-xstocks-solana.csv](raw/commodities-xstocks-solana.csv) — **65** rows (includes energy equities + metal/oil ETFs)
- [raw/commodities-ondo-solana.csv](raw/commodities-ondo-solana.csv) — **40** rows

### Direct commodity / metals / oil trackers (high-signal)

**xStocks Solana**

| Symbol | Name | Mint |
|---|---|---|
| GLDx | Gold xStock | `Xsv9hRk1z5ystj9MhnA7Lq4vjSsLwzL2nxrwmwtD3re` |
| SLVx | iShares Silver Trust xStock | `XsxAd6okt8y1RRK6gNg7iJaqiWNiq5Md5EDf3ZrF2dm` |
| USOx | United States Oil Fund xStock | `XsXJBom7kFSxA6hc2ArzUwe6o6zyRU1AdHTfvev1HkG` |
| PALLx | abrdn Physical Palladium Shares xStock | `XsTTtPA5V19YwHKDv4xeVXNM6kdsQNJvg3MyWkRUckt` |
| PPLTx | abrdn Physical Platinum Shares xStock | `Xst6eFD4YT6sz9RLMysN9SyvaZWtraSdVJQGu5ZkAme` |
| COPXx | Global X Copper Miners xStock | `XsybfiKkD4UmjkAGT2uR8X2sq9AWFtvGJM2KTffoALZ` |
| GDXx | VanEck Gold Miners xStock | `XsVRhRg9eRE9PrsoPsAt5Mifa8mfjm9R3vdw6orp54j` |
| XOPx | SPDR S&P Oil & Gas Exploration ETF xStock | `XsAk6BoV4kBXUM6WXodKyM21CN92G9jArwAzFvbh3LX` |

**Ondo Solana**

| Symbol | Underlying | Mint |
|---|---|---|
| GLDon | SPDR Gold Shares (GLD) | `hWfiw4mcxT8rnNFkk6fsCQSxoxgZ9yVhB6tyeVcondo` |
| IAUon | iShares Gold Trust (IAU) | `M77ZvkZ8zW5udRbuJCbuwSwavRa7bGAZYMTwru8ondo` |
| SLVon | iShares Silver Trust (SLV) | `iy11ytbSGcUnrjE6Lfv78TFqxKyUESfku1FugS9ondo` |
| FGDLon | Franklin Responsibly Sourced Gold (FGDL) | `CYqLHM92EhmF83iNgfN4A1j2ckjsHigRvXu7xHCondo` |
| USOon | United States Oil Fund (USO) | `rpydAzWdCy85HEmoQkH5PVxYtDYQWjmLxgHHadxondo` |
| BNOon | US Brent Oil Fund (BNO) | `BAU83kqEqhyiexfAMQhZZE5KnGogSqh17fJc44Sondo` |
| UNGon | US Natural Gas Fund (UNG) | `Es2ipHL7qXBcLmZ4N7LP9PHBHaWaTMTAkxDwGGjondo` |
| DBCon | Invesco DB Commodity Index (DBC) | `td1aY5AvYQuwGD75qNq9aPipMexraN9mQXJwqifondo` |
| PDBCon | Invesco Optimum Yield Diversified Commodity (PDBC) | `M6agiXbNgy8Xon9ngiW4ZDPbMFcNCTMkMMkshZyondo` |
| FTGCon | First Trust Global Tactical Commodity (FTGC) | `ivBnfPTyuHDNWmMSnbavckhJK6SHZW8h77nZKsEondo` |
| PALLon | abrdn Physical Palladium (PALL) | `P7hTXnKk2d2DyqWnefp5BSroE1qjjKpKxg9SxQqondo` |
| PPLTon | abrdn Physical Platinum (PPLT) | `DwRtkbsaQMGAS3oMeEGYh6M5vH4X9WECsQgqHjAondo` |
| GLTRon | abrdn Physical Precious Metals Basket (GLTR) | `CgnZbDNzBfaLyJqUtd4esKLShRp7RznQuwP4uQaondo` |
| COPXon | Global X Copper Miners (COPX) | `X7j77hTmjZJbepkXXBcsEapM8qNgdfihkFj6CZ5ondo` |

**Hyperliquid commodity-style perps (examples on `xyz`)**

`xyz:GOLD` · `xyz:SILVER` · `xyz:BRENTOIL` · `xyz:NATGAS` · `xyz:COPPER` · `xyz:CORN` · `xyz:WHEAT` · `xyz:PALLADIUM` · `xyz:PLATINUM` · `xyz:SP500` · `xyz:XYZ100`  
(Also mirrored on `flx`, `cash`, `hyna`, `km`/`mkts`, `vntl` — see [raw/hyperliquid-hip3-all.csv](raw/hyperliquid-hip3-all.csv).)

## Refresh commands

```bash
# xStocks
curl -sL https://xstocks.com/products | # parse __NEXT_DATA__.props.pageProps.products

# Ondo official CSV (from docs addresses page)
curl -sL -o database/registry/raw/ondo-gm-tokens.csv \
  'https://www.dropbox.com/scl/fi/qjfxyg748mx0dwi6up86d/EXTERNAL-Ondo-GM-Tokens-Ondo-GM-Tokens.csv?rlkey=n3no1w78wrah3umsl0nr9s77i&dl=1'

# Hyperliquid
curl -s -X POST https://api.hyperliquid.xyz/info -H 'content-type: application/json' -d '{"type":"perpDexs"}'
curl -s -X POST https://api.hyperliquid.xyz/info -H 'content-type: application/json' -d '{"type":"meta","dex":"xyz"}'
```

## Eligibility / product caveats

- Ondo Stocks: generally **non-US** / Reg S; KYC for primary mint/redeem.
- xStocks: issuer terms + jurisdiction limits apply.
- Hyperliquid equity/commodity markets: **derivatives**, 24/7, funding rates, leverage — not custody of the underlying share/bar.
