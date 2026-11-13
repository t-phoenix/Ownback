// Self-check for trade-panel money helpers. Run: npx tsx lib/markets.check.ts
import assert from "node:assert/strict";
import { fmtFee, pctOfUsd6, qtyValueUsd6 } from "./markets";

assert.equal(fmtFee("0", "10000000"), "None");
assert.equal(fmtFee("2500", "10000000"), "< $0.01 · 0.02%");
assert.equal(fmtFee("60", "10000000"), "< $0.01 · < 0.01%");
assert.equal(fmtFee("80000", "33430000"), "$0.08 · 0.23%");
assert.equal(qtyValueUsd6("0.0008", "355750000"), "284600");
assert.equal(qtyValueUsd6("1", "355750000"), "355750000");
assert.equal(qtyValueUsd6(".5", "2000000"), "1000000");
assert.equal(qtyValueUsd6("abc", "1"), null);
assert.equal(pctOfUsd6("5930000", 25), "1480000"); // $1.4825 → $1.48
assert.equal(pctOfUsd6("5930000", 100), "5930000");
console.log("markets ok");
