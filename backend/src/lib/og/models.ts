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
      return OG_MODELS.llm;
    case 'brand_embed':
      return OG_MODELS.embed;
    case 'transcribe':
      return OG_MODELS.whisper;
    default:
      return OG_MODELS.llm;
  }
}

/** @deprecated use configForJob(job).id */
export function modelForJob(job: OgJob): string {
  return configForJob(job).id;
}
