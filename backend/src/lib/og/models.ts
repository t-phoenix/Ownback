/**
 * 0G Router models for Ownback (S10 / ETHGlobal Mumbai 0G bounty).
 *
 * All primary jobs use trust_mode=private (TeeML). Standard Aliyun/ByteDance
 * models are faster but not private — keep them out of the receipt path.
 */

export type OgJob =
  | 'read_receipt'
  | 'read_invoice'
  | 'parse_spoken'
  | 'find_maker'
  | 'brand_embed'
  | 'extract_suppliers'
  | 'understand'
  | 'jury'
  | 'judge'
  | 'transcribe';

export type OgModelConfig = {
  id: string;
  /** Pin with X-0G-Provider-Address; omit to let Router pick among private peers */
  provider: `0x${string}`;
  endpoint: 'chat' | 'embeddings' | 'audio';
  /** Default max_tokens for chat (reasoning models need headroom before content) */
  maxTokens?: number;
  /**
   * Extra request-body fields. The vision model is a reasoning model: with thinking on it spends
   * the whole token budget reasoning (36 s, no JSON). Thinking off returns clean JSON in ~5 s (7 Nov live test).
   */
  extraBody?: Record<string, unknown>;
};

/** Live private TeeML endpoints verified 7 Nov 2026 */
export const OG_MODELS = {
  /**
   * Receipt / screenshot OCR — 0G-native multimodal TeeML.
   * Bounty lists 0gm-1.0; only healthy private image→text model today.
   */
  vision: {
    id: '0GM-1.0-35B-A3B',
    provider: '0xf4FB8d2bD856e672b5f9848b0eD235A20079B250',
    endpoint: 'chat',
    maxTokens: 1024,
    extraBody: { chat_template_kwargs: { enable_thinking: false } },
  },
  /**
   * Text LLM — invoices, spoken/typed parse, find_maker, offline extract.
   * Private TeeML; cleaner final `content` than 0GM-SIA in smoke tests.
   */
  llm: {
    id: 'glm-5.3',
    provider: '0xD179F4526064846dE9a9E9D93683AF75CB72E503',
    endpoint: 'chat',
    maxTokens: 1024,
    /** GLM's switch (chat_template_kwargs is ignored here): 4.9 s vs 7.1 s, same answer (7 Nov live test). */
    extraBody: { thinking: { type: 'disabled' } },
  },
  /**
   * 0G-native text model (SIA variant of 0GM). Third independent juror (D30).
   * Thinking on returns the plan in `content`; enable_thinking=false returns clean JSON in ~4 s (9 Nov live test).
   */
  sia: {
    id: '0GM-1.0-35B-A3B-SIA',
    provider: '0x15aDd680050Ecd0B25eb7d480e7BB1f48594Eabe',
    endpoint: 'chat',
    maxTokens: 1024,
    extraBody: { chat_template_kwargs: { enable_thinking: false } },
  },
  /** Fix-the-match brand embeddings */
  embed: {
    id: 'qwen3-embedding-0.6b',
    provider: '0x158468A43ae7FEfDB53aDF0d6081d1959AaB1333',
    endpoint: 'embeddings',
  },
  /** Voice purchases */
  whisper: {
    id: 'openai/whisper-large-v3',
    provider: '0xE63C4F83abFbDFCaB884247EaC21f59e2e8d502e',
    endpoint: 'audio',
  },
} as const satisfies Record<string, OgModelConfig>;

export function configForJob(job: OgJob): OgModelConfig {
  switch (job) {
    case 'read_receipt':
      return OG_MODELS.vision;
    case 'read_invoice':
    case 'parse_spoken':
    case 'find_maker':
    case 'extract_suppliers':
    case 'jury':
      return OG_MODELS.llm;
    // glm-5.3 reasons inside `content` (15–40 s, needs ~4k tokens); 0GM with thinking off answers in ~5 s (9 Nov live test).
    case 'understand':
    case 'judge':
      return OG_MODELS.vision;
    case 'brand_embed':
      return OG_MODELS.embed;
    case 'transcribe':
      return OG_MODELS.whisper;
    default:
      return OG_MODELS.llm;
  }
}

/**
 * Jurors (D30): every healthy private TeeML chat model on the Router, pinned here
 * (GET router-api.0g.ai/v1/providers, 9 Nov 2026: exactly these three are private + healthy).
 */
export const JURY_MODELS: OgModelConfig[] = [OG_MODELS.llm, OG_MODELS.sia, OG_MODELS.vision];

let healthCache: { at: number; healthy: Set<string> } | null = null;

/** Pinned jurors the Router reports healthy right now (10 min cache). If the list can't be read, trust the pins. */
export async function healthyJuryModels(fetchImpl: typeof fetch = fetch): Promise<OgModelConfig[]> {
  if (!healthCache || Date.now() - healthCache.at > 600_000) {
    try {
      const res = await fetchImpl('https://router-api.0g.ai/v1/providers', { signal: AbortSignal.timeout(5_000) });
      const body = (await res.json()) as { data?: { address: string; is_healthy?: boolean; trust_mode?: string }[] };
      const healthy = new Set(
        (body.data ?? []).filter((p) => p.is_healthy && p.trust_mode === 'private').map((p) => p.address.toLowerCase()),
      );
      healthCache = { at: Date.now(), healthy };
    } catch {
      return JURY_MODELS;
    }
  }
  const h = healthCache.healthy;
  return JURY_MODELS.filter((m) => h.has(m.provider.toLowerCase()));
}

/** @deprecated use configForJob(job).id */
export function modelForJob(job: OgJob): string {
  return configForJob(job).id;
}
