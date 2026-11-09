/**
 * Client-side check before signing Arc buy calls without Privy's popup (A5: the PWA decodes before the user signs).
 * Allows only the D29 buy calls: setSolanaRecipient? → approve? → deposit? → withdrawCrossChain(amount, 5, fee),
 * all to one vault, with USDC approved only to that vault and only for the deposited amount.
 */
type Call = { to: string; data: string; value: string };

const ARC_USDC = "0x3600000000000000000000000000000000000000";
const SOLANA_DOMAIN = 5n;
const SEL = { link: "0xf182211c", approve: "0x095ea7b3", deposit: "0xb6b55f25", bridge: "0x2c05e3ab" } as const;

/** 32-byte ABI word `i` after the selector, as a bigint. */
const word = (data: string, i: number) => BigInt(`0x${data.slice(10 + i * 64, 74 + i * 64) || "0"}`);

export function isArcBuyCalls(calls: Call[]): boolean {
  if (!calls.length) return false;
  let vault: string | null = null;
  let approved: { spender: string; amount: bigint } | null = null;
  let deposited: bigint | null = null;
  for (const [i, c] of calls.entries()) {
    const to = c.to.toLowerCase(), sel = c.data.slice(0, 10).toLowerCase();
    if (c.value !== "0" || !/^0x[0-9a-f]*$/i.test(c.data)) return false;
    if (sel === SEL.approve) {
      if (to !== ARC_USDC || c.data.length !== 138) return false;
      approved = { spender: `0x${c.data.slice(34, 74)}`.toLowerCase(), amount: word(c.data, 1) };
      continue;
    }
    if (vault && to !== vault) return false;
    vault = to;
    if (sel === SEL.link) { if (c.data.length !== 74) return false; }
    else if (sel === SEL.deposit) { if (c.data.length !== 74) return false; deposited = word(c.data, 0); }
    else if (sel === SEL.bridge) {
      // Must be the last call, and must go to Solana.
      if (i !== calls.length - 1 || c.data.length !== 202 || word(c.data, 1) !== SOLANA_DOMAIN) return false;
    } else return false;
  }
  if (calls[calls.length - 1].data.slice(0, 10).toLowerCase() !== SEL.bridge) return false;
  // An approve must go to this vault, for exactly what is deposited.
  if (approved && (approved.spender !== vault || approved.amount !== deposited)) return false;
  return true;
}
// shortcut: setSolanaRecipient's ATA isn't re-derived here (vault timelocks changes; server derives it, D28); add an ATA check if the server is ever untrusted for first-time links.
