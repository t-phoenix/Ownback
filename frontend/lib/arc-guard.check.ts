// Self-check for arc-guard. Run: npx tsx lib/arc-guard.check.ts
import assert from "node:assert/strict";
import { isArcBuyCalls } from "./arc-guard";

const pad = (h: string) => h.replace(/^0x/, "").padStart(64, "0");
const n = (v: bigint) => pad(v.toString(16));
const VAULT = "0x" + "ab".repeat(20), USDC = "0x3600000000000000000000000000000000000000";
const link = { to: VAULT, value: "0", data: "0xf182211c" + pad("11".repeat(32)) };
const approve = (spender: string, amt: bigint) => ({ to: USDC, value: "0", data: "0x095ea7b3" + pad(spender) + n(amt) });
const deposit = (amt: bigint) => ({ to: VAULT, value: "0", data: "0xb6b55f25" + n(amt) });
const bridge = (amt: bigint, domain = 5n, to = VAULT) => ({ to, value: "0", data: "0x2c05e3ab" + n(amt) + n(domain) + n(0n) });

assert.equal(isArcBuyCalls([link, approve(VAULT, 2_000_000n), deposit(2_000_000n), bridge(2_380_000n)]), true);
assert.equal(isArcBuyCalls([bridge(400_000n)]), true);
assert.equal(isArcBuyCalls([approve("0x" + "cd".repeat(20), 2_000_000n), deposit(2_000_000n), bridge(2_000_000n)]), false, "approve to someone else");
assert.equal(isArcBuyCalls([approve(VAULT, 9_000_000n), deposit(2_000_000n), bridge(2_000_000n)]), false, "approve more than deposit");
assert.equal(isArcBuyCalls([bridge(1n, 0n)]), false, "not Solana");
assert.equal(isArcBuyCalls([deposit(1n), bridge(1n, 5n, "0x" + "ef".repeat(20))]), false, "two vaults");
assert.equal(isArcBuyCalls([bridge(1n), deposit(1n)]), false, "bridge not last");
assert.equal(isArcBuyCalls([{ to: USDC, value: "0", data: "0xa9059cbb" + pad(VAULT) + n(1n) }]), false, "transfer");
console.log("arc-guard ok");
