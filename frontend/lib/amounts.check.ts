// Self-check for amounts. Run: npx tsx lib/amounts.check.ts
import assert from "node:assert/strict";
import { parseDollars, roundNice, spread, stepFor, sumOf } from "./amounts";

const ids = ["a", "b", "c"];
const w = { a: 3343n, b: 318n, c: 239n };
const none = new Set<string>();

// Sums exactly, keeps proportions.
for (const t of [0n, 1n, 7n, 4775n, 100_000_00n, 123_456_789_01n]) assert.equal(sumOf(spread(ids, w, t, none, {})), t);
assert.deepEqual(spread(ids, w, 3900n, none, {}), { a: 3343n, b: 318n, c: 239n });

// Locked rows hold; the rest moves.
const locked = new Set(["a"]);
const s = spread(ids, w, 5000n, locked, { a: 4000n });
assert.equal(s.a, 4000n); assert.equal(sumOf(s), 5000n);
// Locked sum over the target: unlocked rows go to 0, never negative.
assert.deepEqual(spread(ids, w, 100n, locked, { a: 4000n }), { a: 4000n, b: 0n, c: 0n });
// Zero weights fall back to even.
assert.deepEqual(spread(["x", "y"], {}, 101n, none, {}), { x: 51n, y: 50n });

assert.equal(roundNice(53055n), 50000n);
assert.equal(roundNice(4775n), 5000n);
assert.equal(roundNice(804n), 800n);
assert.equal(roundNice(99n), 99n);
assert.equal(stepFor(1000n), 1n);
assert.equal(stepFor(106110n), 100n);

assert.equal(parseDollars("$1,234.5"), 123450n);
assert.equal(parseDollars(""), 0n);
assert.equal(parseDollars("0.07"), 7n);
assert.equal(parseDollars("1.234"), null);
assert.equal(parseDollars("abc"), null);
assert.equal(parseDollars("-3"), null);
console.log("amounts ok");
