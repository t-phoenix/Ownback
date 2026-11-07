/** User-facing copy from copy-and-errors.md. The UI never shows an error code itself. */

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
};

export function errorCopy(code: string | undefined): string {
  if (code === "OFFLINE") return "You're offline · showing what we had";
  return (code && errors[code]) || "We couldn't load this. Your money isn't affected.";
}

/** Activity titles (copy-and-errors.md § Activity titles); the API sends the kind. */
export const activityTitle: Record<string, string> = {
  buy_done: "Buy done", receipt_matched: "Receipt matched", needs_review: "Needs your review", jar_ready: "Jar ready",
  fallback_used: "Not listed, used fallback", limit_warning: "80% of monthly limit used", limit_reached: "Monthly limit reached",
  fees_high: "Fees are high right now", approval_expired: "Buy approval expired", gmail_revoked: "Gmail disconnected",
  rules_changed: "Your rules changed", buy_reminder: "Jars ready", deposit_added: "Funds added", withdraw_sent: "Withdrawal sent",
  gmail_found: "New invoices in Gmail", buy_returned: "Back in its jar", buy_paused: "Buy paused", buy_partial: "Partly bought",
};

export const readErrorCopy = "We couldn't find a total or a product name. Nothing was saved.";
export const readTips = ["Flat surface, good light", "Whole receipt in the frame", "Or a screenshot of the order page"];
