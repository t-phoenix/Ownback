/**
 * Hand-off from Add (or a desktop drop / paste) to Reading. Lives in memory only:
 * the file goes straight to the API and is never written to storage (docs/06).
 */
export type PendingRead =
  | { kind: "image"; file: Blob; name: string }
  | { kind: "audio"; file: Blob; name: string }
  | { kind: "typed"; text: { product: string; amount: string; currency: string; maker?: string } };

let pending: PendingRead | null = null;
export const setPending = (p: PendingRead) => { pending = p; };
export const takePending = () => { const p = pending; pending = null; return p; };
