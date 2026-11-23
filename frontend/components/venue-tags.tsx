/**
 * D46: who tokenized an asset, where it trades and on which chain. Three kinds, three colours (text always says
 * what it is, so colour is never the only signal). Add an issuer, venue or chain here when it goes live.
 */
export type TagKind = "tokenizer" | "venue" | "chain";
export type TagDef = { key: string; label: string; kind: TagKind; note: string; live: boolean };

export const TOKENIZERS: TagDef[] = [
  { key: "xStocks", label: "xStocks", kind: "tokenizer", note: "Tokenized by Backed (xStocks)", live: true },
  { key: "Ondo", label: "Ondo", kind: "tokenizer", note: "Tokenized by Ondo Global Markets", live: true },
  { key: "Robinhood", label: "Robinhood", kind: "tokenizer", note: "Robinhood stock tokens", live: false },
];
export const VENUES: TagDef[] = [
  { key: "jupiter", label: "Jupiter", kind: "venue", note: "Trading venue · aggregator (routes across Solana DEXs)", live: true },
  { key: "hyperliquid", label: "Hyperliquid", kind: "venue", note: "Trading venue · DEX (perps)", live: false },
];
/** D47: Solana exchanges a token's pools sit on (pool index keys). Jupiter routes across all of them. */
export const EXCHANGES: TagDef[] = [
  ["raydium", "Raydium"], ["orca", "Orca"], ["meteora", "Meteora"], ["pumpswap", "PumpSwap"], ["pancakeswap", "PancakeSwap"],
  ["fluxbeam", "FluxBeam"], ["phoenix", "Phoenix"], ["saros", "Saros"], ["stabble", "Stabble"],
].map(([key, label]) => ({ key, label, kind: "venue" as const, note: "Exchange · DEX on Solana", live: true }));
export const CHAINS: TagDef[] = [
  { key: "solana", label: "Solana", kind: "chain", note: "Chain", live: true },
];

export const KIND_LABEL: Record<TagKind, string> = { tokenizer: "Tokenizer", venue: "Trading venue", chain: "Chain" };

const find = (list: TagDef[], key?: string) => list.find(t => t.key.toLowerCase() === (key ?? "").toLowerCase());

export function Tag({ kind, label, note }: { kind: TagKind; label: string; note?: string }) {
  return <span className={`vtag vtag-${kind}`} title={note ?? KIND_LABEL[kind]}><span className="sr-only">{KIND_LABEL[kind]}: </span>{label}</span>;
}

export const IssuerTag = ({ issuer }: { issuer?: string }) => issuer ? <Tag kind="tokenizer" label={find(TOKENIZERS, issuer)?.label ?? issuer} note={find(TOKENIZERS, issuer)?.note} /> : null;
export const VenueTag = ({ venue }: { venue?: string }) => { const t = find(VENUES, venue) ?? find(EXCHANGES, venue); return venue ? <Tag kind="venue" label={t?.label ?? venue} note={t?.note} /> : null; };
export const ChainTag = ({ chain }: { chain?: string }) => chain ? <Tag kind="chain" label={find(CHAINS, chain)?.label ?? chain} note={find(CHAINS, chain)?.note} /> : null;

/** Issuer · venue · chain, in that order. */
export function RouteTags({ issuer, venue, chain }: { issuer?: string; venue?: string; chain?: string }) {
  return <span className="vtags"><IssuerTag issuer={issuer} /><VenueTag venue={venue} /><ChainTag chain={chain} /></span>;
}

/** The colour key, for pages that show tags. */
export function TagLegend() {
  return <p className="vtag-legend fineprint">{(["tokenizer", "venue", "chain"] as TagKind[]).map(k => <span key={k}><i className={`vtag-dot vtag-${k}`} aria-hidden="true" />{KIND_LABEL[k]}</span>)}</p>;
}
