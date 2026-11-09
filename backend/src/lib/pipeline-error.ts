import { ApiError } from '../shared/errors.js';

/** Short stable string for buy_batches.error / buy_entries.error (UI maps it; never dump JSON). */
export function pipelineError(e: unknown): string {
  if (e instanceof ApiError) {
    const reason = (e.details as { reason?: string } | undefined)?.reason;
    return (reason ? `${e.code}:${reason}` : e.code).slice(0, 120);
  }
  const msg = e instanceof Error ? e.message : String(e);
  if (/overruns Uint8Array/i.test(msg)) return 'UPSTREAM:tx_too_large';
  if (/blockhash/i.test(msg)) return 'UPSTREAM:blockhash';
  return msg.replace(/\s+/g, ' ').slice(0, 120);
}
