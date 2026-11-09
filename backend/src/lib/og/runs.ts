import { getSql } from '../../db/client.js';
import { newId } from '../ids.js';
import { ogChat, type OgChatResult } from './client.js';
import { configForJob, type OgJob, type OgModelConfig } from './models.js';
import { extractJson } from './schemas.js';

/** One ai_runs row per 0G call (ai-spec.md). Never the input. purchaseId null = script / eval run, not logged. */
export async function logRun(
  purchaseId: string | null,
  job: OgJob,
  promptVersion: string,
  r: { ok: boolean; model?: string; requestId?: string | null; latencyMs?: number },
) {
  if (!purchaseId) return;
  try {
    await getSql()`
      INSERT INTO ai_runs (id, purchase_id, job, model, prompt_version, og_request_id, latency_ms, ok, created_at)
      VALUES (${newId()}::uuid, ${purchaseId}::uuid, ${job}, ${r.model ?? configForJob(job).id}, ${promptVersion},
              ${r.requestId ?? null}, ${r.latencyMs ?? null}, ${r.ok}, now())
    `;
  } catch {
    /* telemetry must not fail a read */
  }
}

/**
 * Chat → JSON → zod-ish parse. Logs ok=false when the call fails *or* the reply isn't valid JSON for `parse`.
 * Returns the parsed value and the 0G request ID.
 */
export async function chatJson<T>(opts: {
  purchaseId: string | null;
  job: OgJob;
  promptVersion: string;
  messages: unknown[];
  parse: (raw: unknown) => T;
  model?: OgModelConfig;
  json?: boolean;
  maxTokens?: number;
  timeoutMs?: number;
}): Promise<{ value: T; res: OgChatResult }> {
  const t0 = Date.now();
  let res: OgChatResult | undefined;
  try {
    res = await ogChat({
      job: opts.job, model: opts.model, messages: opts.messages, maxTokens: opts.maxTokens, timeoutMs: opts.timeoutMs,
      ...(opts.json ? { responseFormat: { type: 'json_object' as const } } : {}),
    });
    const value = opts.parse(extractJson(res.content));
    await logRun(opts.purchaseId, opts.job, opts.promptVersion, { ...res, ok: true });
    return { value, res };
  } catch (e) {
    await logRun(opts.purchaseId, opts.job, opts.promptVersion, {
      ok: false,
      model: res?.model ?? opts.model?.id,
      requestId: res?.requestId,
      latencyMs: Date.now() - t0,
    });
    if (res) (e as Error & { badJson?: boolean }).badJson = true;
    throw e;
  }
}
