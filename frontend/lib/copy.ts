/** User-facing copy from copy-and-errors.md. The UI never shows an error code itself. */
import { fmtUsd6 } from "./money";

const errors: Record<string, string> = {
  AUTH_INVALID: "That didn't work. Try signing in again.",
  GEO_BLOCKED: "Ownback isn't available in the US. The shares we buy aren't offered to US persons.",
  RATE_LIMITED: "Slow down a moment, then try again.",
  UPLOAD_TOO_LARGE: "That file is too big. Try a screenshot instead.",
  UNSUPPORTED_MEDIA: "We can read photos, screenshots and voice notes.",
  READ_FAILED: "We couldn't find a total or a product name. Nothing was saved.",
  TX_REVERTED: "Nothing was moved. Try again.",
  CHALLENGE_FAILED: "Nothing was moved. Try again.",
  BAD_SIGNATURE: "That approval didn't go through. Review the prices again.",
  APPROVAL_EXPIRED: "That approval didn't go through. Review the prices again.",
  KEEPER_DISABLED: "Buys are paused while we check something. Your money is safe and you can withdraw any time.",
  NO_READY_JARS: "No jar is ready yet. You can still buy a smaller jar with Buy now anyway.",
  CHAIN_UNSUPPORTED: "We don't support that chain. Use Arc, Solana, Base, Ethereum or Arbitrum.",
  NONCE_USED: "That sign-in link was already used. Try again.",
  NO_SOLANA_RECIPIENT: "Set up your Solana wallet first.",
  INSUFFICIENT_FREE: "Not enough USDC for this amount. Add funds or buy a smaller amount.",
  TX_NOT_FOUND: "Still confirming. Try again in a moment.",
  QUOTE_EXPIRED: "Prices moved. We fetched fresh quotes; review and buy again.",
  NOTHING_TO_BUY: "Nothing here can be bought on-chain yet.",
  VALIDATION: "Check the amount and try again. The smallest buy is $0.10.",
  UPSTREAM: "The swap route didn't build. Try again in a moment.",
  DEPOSIT_NOT_READY: "That buy isn't ready to swap yet. Wait a moment and try again.",
};

export function errorCopy(code: string | undefined, details?: { freeUsd6?: string; shortUsd6?: string; leftUsd6?: string }): string {
  if (code === "OFFLINE") return "You're offline · showing what we had";
  if (code === "INSUFFICIENT_FREE" && details?.freeUsd6 && details?.shortUsd6) {
    return `You have ${fmtUsd6(details.freeUsd6)} free. Add ${fmtUsd6(details.shortUsd6)} or save ${fmtUsd6(details.freeUsd6)} now and the rest later.`;
  }
  if (code === "LIMIT_REACHED" && details?.leftUsd6) {
    return `You've hit this month's limit. You can still save ${fmtUsd6(details.leftUsd6)} now.`;
  }
  return (code && errors[code]) || "We couldn't load this. Your money isn't affected.";
}

/** Activity titles (copy-and-errors.md § Activity titles); the API sends the kind. */
export const activityTitle: Record<string, string> = {
  buy_done: "Buy done", sell_done: "Sold for USDC", receipt_matched: "Receipt matched", needs_review: "Needs your review", jar_ready: "Jar ready",
  fallback_used: "Not listed, used fallback", limit_warning: "80% of monthly limit used", limit_reached: "Monthly limit reached",
  fees_high: "Fees are high right now", approval_expired: "Buy approval expired", gmail_revoked: "Gmail disconnected",
  rules_changed: "Your rules changed", buy_reminder: "Jars ready", deposit_added: "Funds added", withdraw_sent: "Withdrawal sent",
  gmail_found: "New invoices in Gmail", buy_returned: "Back in its jar", buy_paused: "Buy paused", buy_partial: "Partly bought",
};

export const readErrorCopy = "We couldn't find a total or a product name. Nothing was saved.";
/** Purchase.readError → what Couldn't read says. Retryable ones offer "Try again". */
export const readErrorText: Record<string, { text: string; retry: boolean }> = {
  not_a_receipt: { text: "This doesn't look like a receipt or order screen. Nothing was saved.", retry: false },
  og_unavailable: { text: "The private AI on 0G didn't answer. Nothing was saved. Try again in a moment.", retry: true },
  timeout: { text: "Reading took too long. Nothing was saved. Try again.", retry: true },
  no_total: { text: readErrorCopy, retry: false },
  no_product: { text: readErrorCopy, retry: false },
};
export const readTips = ["Flat surface, good light", "Whole receipt in the frame", "Or a screenshot of the order page"];
