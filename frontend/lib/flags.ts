/** UI feature flags. Markets (D34) is on in development and off in production until NEXT_PUBLIC_MARKETS=1. */

/**
 * Tester switch for the mainnet smoke (docs/12 §14): `?markets=1` shows Markets in this browser only,
 * `?markets=0` hides it again. The server still refuses every Markets route unless MARKETS_ENABLED=1.
 */
function testerOn(): boolean {
  if (typeof window === "undefined") return false;
  try {
    const q = new URLSearchParams(window.location.search).get("markets");
    if (q === "1") localStorage.setItem("ob:markets", "1");
    if (q === "0") localStorage.removeItem("ob:markets");
    return localStorage.getItem("ob:markets") === "1";
  } catch { return false; }
}

export const marketsOn = process.env.NEXT_PUBLIC_MARKETS === "1"
  || (process.env.NEXT_PUBLIC_MARKETS !== "0" && process.env.NODE_ENV !== "production")
  || testerOn();
