export type Tone = "green" | "mint" | "gold" | "clay" | "sage" | "silver" | "sky";

const named: Record<string, string> = {
  "idx:sp500": "S&P 500", "idx:nasdaq100": "Nasdaq 100", "idx:tbills": "T-Bills",
  "mat:gold": "Gold", "mat:silver": "Silver", "crypto:btc": "Bitcoin", "crypto:eth": "Ether", usdc: "USDC",
};

/** The API sometimes sends the asset id as the name ("co:apple"); show a human name instead. */
export function assetName(id: string, name?: string): string {
  if (name && name !== id) return name;
  if (named[id]) return named[id];
  const bare = id.includes(":") ? id.split(":")[1] : id;
  return bare.split(/[-_]/).map(w => (w.length <= 4 && w === w.toLowerCase() && /\d/.test(w) ? w.toUpperCase() : w.charAt(0).toUpperCase() + w.slice(1))).join(" ");
}

const tones: Tone[] = ["green", "mint", "clay", "sage", "sky", "gold", "silver"];
/** Stable colour per asset or shop name. Materials keep their natural colour. */
export function toneFor(key: string): Tone {
  if (key === "mat:gold") return "gold";
  if (key === "mat:silver") return "silver";
  let h = 0; for (const ch of key) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  return tones[h % 5];
}
