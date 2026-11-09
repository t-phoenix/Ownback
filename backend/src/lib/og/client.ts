import { configForJob, type OgJob, type OgModelConfig } from './models.js';

const BASE = 'https://router-api.0g.ai/v1';

export type OgChatResult = {
  content: string;
  requestId: string | null;
  model: string;
  provider: string;
  latencyMs: number;
  raw: unknown;
};

function apiKey(): string {
  const k = process.env.OG_API_KEY;
  if (!k) throw new Error('OG_API_KEY missing');
  return k;
}

function trustMode(): 'private' | 'standard' | 'verified' {
  const v = (process.env.OG_TRUST_MODE || 'private').toLowerCase();
  if (v === 'standard' || v === 'verified') return v;
  return 'private';
}

export function ogHeaders(opts: {
  provider: string;
  trust?: 'private' | 'standard' | 'verified';
}): Record<string, string> {
  return {
    Authorization: `Bearer ${apiKey()}`,
    'Content-Type': 'application/json',
    'X-0G-Provider-Trust-Mode': opts.trust ?? trustMode(),
    'X-0G-Provider-Address': opts.provider,
    // pinned address already disables cross-provider fallback
    'X-0G-Provider-Allow-Fallbacks': 'false',
  };
}

function requestIdFrom(res: Response, raw: unknown): string | null {
  const body = raw as { id?: string; x_0g_trace?: { request_id?: string } };
  return (
    body.x_0g_trace?.request_id ||
    res.headers.get('x-request-id') ||
    res.headers.get('zg-res-key') ||
    body.id ||
    null
  );
}

function messageContent(raw: unknown): string {
  const msg = (raw as { choices?: { message?: { content?: string; reasoning_content?: string } }[] })
    .choices?.[0]?.message;
  const content = (msg?.content ?? '').trim();
  if (content) return content;
  // shortcut: some TeeML models only fill reasoning when truncated; prefer content
  return (msg?.reasoning_content ?? '').trim();
}

/** Read failures the user can retry (og_unavailable / timeout) vs everything else. */
export function ogErrorKind(e: unknown): 'timeout' | 'og_unavailable' {
  const name = (e as { name?: string })?.name;
  return name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'og_unavailable';
}

export async function ogChat(opts: {
  job: OgJob;
  /** Override the job's model (jurors run on different models). */
  model?: OgModelConfig;
  messages: unknown[];
  responseFormat?: { type: 'json_object' };
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<OgChatResult> {
  const cfg = opts.model ?? configForJob(opts.job);
  if (cfg.endpoint !== 'chat') throw new Error(`ogChat: job ${opts.job} is ${cfg.endpoint}`);
  const t0 = Date.now();
  const res = await fetch(`${BASE}/chat/completions`, {
    method: 'POST',
    headers: ogHeaders({ provider: cfg.provider }),
    body: JSON.stringify({
      model: cfg.id,
      messages: opts.messages,
      max_tokens: opts.maxTokens ?? cfg.maxTokens ?? 1024,
      ...(cfg.extraBody ?? {}),
      ...(opts.responseFormat ? { response_format: opts.responseFormat } : {}),
    }),
    // GLM private parse often lands 12–20s; 10s default aborted typed receipts (demo 7 Nov).
    signal: AbortSignal.timeout(opts.timeoutMs ?? 45_000),
  });
  const raw = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(`0G chat ${res.status}: ${JSON.stringify(raw).slice(0, 400)}`);
    (err as Error & { status: number; body: unknown }).status = res.status;
    (err as Error & { status: number; body: unknown }).body = raw;
    throw err;
  }
  return {
    content: messageContent(raw),
    requestId: requestIdFrom(res, raw),
    model: cfg.id,
    provider: cfg.provider,
    latencyMs: Date.now() - t0,
    raw,
  };
}
