/** UI feature flags. Markets (D34) is on in development and off in production until NEXT_PUBLIC_MARKETS=1. */
export const marketsOn = process.env.NEXT_PUBLIC_MARKETS === "1"
  || (process.env.NEXT_PUBLIC_MARKETS !== "0" && process.env.NODE_ENV !== "production");
