import { C } from "./money";

/** Wireframe numbers. Display strings are kept next to the cents they came from. */

export type Tone = "green" | "mint" | "gold" | "clay" | "sage" | "silver" | "sky";

export const holdings = [
  { id: "apple", name: "Apple", token: "AAPLx", value: "$62.10", valueC: C(62, 10), qty: "0.2096", tone: "green" as Tone, kind: "Company" },
  { id: "tsmc", name: "TSMC", token: "TSMx", value: "$24.82", valueC: C(24, 82), qty: "0.0874", tone: "mint" as Tone, kind: "Company" },
  { id: "gold", name: "Gold", token: "PAXG", value: "$18.34", valueC: C(18, 34), qty: "0.0061", tone: "gold" as Tone, kind: "Material" },
  { id: "qualcomm", name: "Qualcomm", token: "QCOMx", value: "$12.48", valueC: C(12, 48), qty: "0.0742", tone: "clay" as Tone, kind: "Company" },
  { id: "corning", name: "Corning", token: "GLWx", value: "$8.71", valueC: C(8, 71), qty: "0.184", tone: "sage" as Tone, kind: "Company" },
];

export const totals = {
  balance: C(234, 20),
  owned: C(126, 45),
  dollars: C(107, 75),
  free: C(64, 12),
  inJars: C(43, 63),
};

export const receipts = [
  { id: "r1", shop: "Croma", item: "iPhone 16 Pro", date: "3 Nov", local: "₹79,900", saved: "$47.75", state: "Matched" },
  { id: "r2", shop: "Nike", item: "Pegasus 41", date: "1 Nov", local: "₹11,895", saved: "$7.11", state: "Matched" },
  { id: "r3", shop: "Myntra", item: "Levi's 501", date: "29 Oct", local: "₹4,199", saved: "$2.51", state: "Matched" },
  { id: "r4", shop: "Nykaa", item: "Sunscreen SPF 50", date: "27 Oct", local: "₹649", saved: "$0.39", state: "Needs review" },
  { id: "r5", shop: "Amazon", item: "Kindle Paperwhite", date: "24 Oct", local: "₹16,999", saved: "$10.16", state: "Matched" },
  { id: "r6", shop: "Blinkit", item: "Weekly groceries", date: "22 Oct", local: "₹2,340", saved: "$1.40", state: "Needs review" },
];

/** The brands a person actually buys from, and how much of each they now own. */
export const brands = [
  { id: "apple", name: "Apple", spent: "$955.00", spentC: C(955), own: "$62.10", ownC: C(62, 10), state: "Owned", tone: "green" as Tone },
  { id: "nike", name: "Nike", spent: "$142.20", spentC: C(142, 20), own: "$7.11", ownC: C(7, 11), state: "Filling", tone: "clay" as Tone },
  { id: "amazon", name: "Amazon", spent: "$203.20", spentC: C(203, 20), own: "$10.16", ownC: C(10, 16), state: "Filling", tone: "sky" as Tone },
  { id: "levis", name: "Levi's", spent: "$50.20", spentC: C(50, 20), own: "$2.51", ownC: C(2, 51), state: "Filling", tone: "mint" as Tone },
];

export const split = [
  { name: "Apple", role: "Maker", amount: "$33.43", pct: 70, tone: "green" as Tone, ready: true },
  { name: "TSMC", role: "Chip maker", amount: "$3.18", pct: 7, tone: "mint" as Tone },
  { name: "Qualcomm", role: "Modem", amount: "$3.18", pct: 7, tone: "clay" as Tone },
  { name: "Corning", role: "Glass", amount: "$3.19", pct: 7, tone: "sage" as Tone },
  { name: "Gold", role: "Material", amount: "$2.39", pct: 5, tone: "gold" as Tone },
  { name: "Silver", role: "Material", amount: "$2.38", pct: 4, tone: "silver" as Tone },
];

/** readyMinUsd6 default is $5: a reminder threshold, not a cap. */
export const READY_MIN = C(5);

export const jars = [
  { id: "apple", name: "Apple", token: "AAPLx", amount: "$33.43", amountC: C(33, 43), tone: "green" as Tone, price: "$296.31" },
  { id: "tsmc", name: "TSMC", token: "TSMx", amount: "$6.10", amountC: C(6, 10), tone: "mint" as Tone, price: "$283.72" },
  { id: "gold", name: "Gold", token: "PAXG", amount: "$5.10", amountC: C(5, 10), tone: "gold" as Tone, price: "$2,947" },
  { id: "qualcomm", name: "Qualcomm", token: "QCOMx", amount: "$3.18", amountC: C(3, 18), tone: "clay" as Tone, fees: "$0.11", feesPct: "3.5%" },
  { id: "corning", name: "Corning", token: "GLWx", amount: "$3.19", amountC: C(3, 19), tone: "sage" as Tone, fees: "$0.11", feesPct: "3.4%" },
  { id: "silver", name: "Silver", token: "XAGx", amount: "$2.38", amountC: C(2, 38), tone: "silver" as Tone, fees: "$0.10", feesPct: "4.2%" },
];

/** Days of this week (Mon–Sun) on which a receipt was added. Drives the "receipt rhythm" strip. */
export const week = { days: ["M", "T", "W", "T", "F", "S", "S"], added: [true, false, true, true, false, false, false], today: 4 };

/** Items waiting on the user. Titles come from copy-and-errors.md § Activity titles. */
export const inbox = [
  { id: "jars", kind: "buy_reminder", title: "3 jars ready", body: "Review the prices and buy", cta: "Review", path: "/jars", amount: "$44.63" },
  { id: "review", kind: "needs_review", title: "Needs your review", body: "Nykaa receipt · 1 brand we're not sure about", cta: "Review", path: "/receipts" },
  { id: "gmail", kind: "gmail_found", title: "4 new invoices in Gmail", body: "Amazon · Myntra · Blinkit", cta: "Add them", path: "/add" },
];

export const activity = [
  { id: "a1", group: "Today", kind: "jar_ready", title: "Jar ready", body: "Gold reached $5 · tap to buy", time: "9:12", path: "/jars" },
  { id: "a2", group: "Today", kind: "receipt_matched", title: "Receipt matched", body: "Croma iPhone 16 Pro → $47.75 across 6", time: "8:40", path: "/receipts" },
  { id: "a3", group: "Yesterday", kind: "needs_review", title: "Needs your review", body: "Nykaa receipt · 1 brand we're not sure about", time: "19:03", path: "/receipts" },
  { id: "a4", group: "Yesterday", kind: "deposit_added", title: "$20.00 added", body: "From Arc", time: "11:27", path: "/holdings" },
  { id: "a5", group: "This week", kind: "buy_done", title: "Buy done", body: "Apple at $296.31, TSMC, Gold · $44.63 · fees $0.31", time: "Sun", path: "/holdings/apple" },
  { id: "a6", group: "This week", kind: "limit_warning", title: "80% of monthly limit used", body: "$40.00 of $50 · resets 1 Dec", time: "Sat", path: "/settings" },
];
