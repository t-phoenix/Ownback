# 09 · Submission pack

Due Sat 7 Nov 09:00 IST. Draft from 03:00, freeze at 07:00, submit by 08:30.

## What each prize needs

### Arc: Best DeFi / Onchain Finance App Built End to End in Arc Studio

| ✓ | Item | Where |
|---|---|---|
| ☐ | Project started in Arc Studio; **Studio project URL** in the submission | README + form |
| ☐ | Studio shown in the video | Video 2:35 |
| ☐ | Working frontend and backend (live URL) | README |
| ☐ | Architecture diagram | `docs/architecture.svg` (export from the architecture doc) |
| ☐ | Bounty stated: DeFi / Onchain Finance (backup: Advanced Stablecoin Logic) | Form |
| ☐ | Partner stack: Arc Studio + vault, native USDC, CCTP V2 (TokenMessenger + Iris), Privy (Google smart wallet + Solana). Circle Console wallets/Gas Station/Gateway only if verification worked | README "Partner tech" |
| ☐ | Vault address on Arc mainnet, verified | README |
| ☐ | GitHub repo | Form |

### 0G: Build with 0G Private Computer

| ✓ | Item | Where |
|---|---|---|
| ☐ | 0G inference in the main flow, with request IDs visible (Reading, Confirm, proof trail) | App + video 0:25 |
| ☐ | The "what breaks without 0G" sentence | README |
| ☐ | Models used and why (table from [backend/ai-spec.md](../backend/ai-spec.md)) | README |
| ☐ | Video under 3 minutes | Video |
| ☐ | Bonus: sign in with a 0G account and show the credit balance going down (localhost:3000 only) | Separate clip, if built |

The sentence: *"Without 0G, Ownback can't read a receipt or an invoice, or tell which companies are behind a product, so no purchase ever becomes a share and no buy has a verifiable reason."*

### Arkiv: Build on Arkiv (from scratch)

| ✓ | Item | Where |
|---|---|---|
| ☐ | Writes with `@arkiv-network/sdk` (1.0.1) to the current testnet (Rabdi) | `lib/arkiv/` |
| ☐ | Features users see read from Arkiv (Confirm, Fix the match, proof trail) | App |
| ☐ | README: writer wallet addresses (registry + keeper) and **one runnable query** | README |
| ☐ | `/arkiv/schema.md`: from [database/arkiv-schema.md](../database/arkiv-schema.md) | Repo |
| ☐ | `/arkiv/friction.md`: what was hard (log already started in [database/arkiv-schema.md](../database/arkiv-schema.md#friction-log-start-now-judges-read-arkivfrictionmd)) | Repo |
| ☐ | `/arkiv/reach.md`: who else can use the public registry and how | Repo |
| ☐ | `/arkiv/why-arkiv.md`: public, queryable, expiring records vs a private DB | Repo |
| ☐ | `/arkiv/how-you-use-arkiv.md`: entities, writes, queries, expiry | Repo |
| ☐ | Enter one Arkiv prize only (not also the Mirror track) | Form |

### ETHGlobal general

| ✓ | Item |
|---|---|
| ☐ | Public repo, open-source license (MIT) |
| ☐ | AI-use disclosure: which tools wrote which parts; prompt files in `backend/prompts/` |
| ☐ | Video 2–4 min, real voice, 720p or better |
| ☐ | Short description, long description, how it's made, tech tags |
| ☐ | Team members listed |

## README outline (repo root at submission)

1. **Ownback: Own what you buy.** One-line pitch + 20-second GIF.
2. **Try it**: live URL, demo video, and test Google account instructions (or seed phrase import).
3. **How it works**: 5 steps with a screenshot each.
4. **Architecture**: diagram + the parts table from [02](02-system-overview.md).
5. **Partner tech**: Arc (Studio, vault, USDC) + CCTP V2 + Privy wallets; 0G (models, private mode, request IDs, the sentence); Arkiv (entities, writer addresses, a runnable query).
6. **Contracts**: vault address, explorer link, Arc Studio URL, the 7 invariants.
7. **Security and privacy**: the 5 promises from [06](06-security.md).
8. **Run locally**: `pnpm i`, `.env.example`, `pnpm dev`, `forge test`.
9. **What's next**: card/UPI on-ramp, zkEmail proofs, brand rewards, live filing-reading.
10. **AI-use disclosure** and license.

## Video script

Use the stage script in [07 § Demo script](07-testing-and-demo.md#demo-script-under-3-minutes). Add a 10-second title card at the start (name, tagline, three partner logos) and keep the total under 3:00 for 0G.

## Final checklist (Sat 07:00–08:30)

| ✓ | Check |
|---|---|
| ☐ | Live URL loads on a fresh phone in incognito |
| ☐ | README links all open (Studio, vault, Arkiv query, video) |
| ☐ | No secrets in the repo (`gitleaks detect`) |
| ☐ | Repo public; license present |
| ☐ | Video uploaded, public or unlisted, sound checked |
| ☐ | Form: three partner prizes selected, the Arc bounty named |
| ☐ | Submitted before 09:00; screenshot of the confirmation saved |
