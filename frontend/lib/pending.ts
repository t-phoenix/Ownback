/**
 * Hand-off from Add (or a desktop drop / paste) to Reading. Lives in memory only:
 * the file goes straight to the API and is never written to storage (docs/06).
 */
export type PendingRead =
  | { kind: "image"; file: Blob; name: string }
  | { kind: "audio"; file: Blob; name: string }
  | { kind: "typed"; text: { product: string; amount: string; currency: string; maker?: string; model?: string; shop?: string; date?: string } }
  /** Already created (edited details, or a reload while reading): just poll it. */
  | { kind: "resume"; id: string };

let pending: PendingRead | null = null;
export const setPending = (p: PendingRead) => { pending = p; };
export const takePending = () => { const p = pending; pending = null; return p; };

/** Last read input + its error, so Couldn't read can offer "Try again" for retryable errors. */
let last: { input: PendingRead; readError?: string } | null = null;
export const setLastRead = (input: PendingRead, readError?: string) => { last = { input, readError }; };
export const lastRead = () => last;
