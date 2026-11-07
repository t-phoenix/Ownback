import { createPublicKey, verify } from 'node:crypto';
import { verifyMessage } from 'viem';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

export function base58Decode(s: string): Uint8Array {
  let n = 0n;
  for (const ch of s) {
    const i = B58.indexOf(ch);
    if (i < 0) throw new Error('bad_base58');
    n = n * 58n + BigInt(i);
  }
  const bytes: number[] = [];
  while (n > 0n) { bytes.unshift(Number(n % 256n)); n /= 256n; }
  for (const ch of s) { if (ch !== '1') break; bytes.unshift(0); }
  return Uint8Array.from(bytes);
}

const ED25519_SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');

/** Solana ed25519 signature over the UTF-8 message. Signature may be base58 (wallet default) or base64. */
export function verifySolanaMessage(address: string, message: string, signature: string): boolean {
  try {
    const pub = base58Decode(address);
    if (pub.length !== 32) return false;
    let sig: Uint8Array;
    try { sig = base58Decode(signature); } catch { sig = new Uint8Array(); }
    if (sig.length !== 64) sig = Uint8Array.from(Buffer.from(signature, 'base64'));
    if (sig.length !== 64) return false;
    const key = createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, Buffer.from(pub)]), format: 'der', type: 'spki' });
    return verify(null, Buffer.from(message, 'utf8'), key, Buffer.from(sig));
  } catch {
    return false;
  }
}

/** Both keys from the seed must sign the server's nonce message. */
export async function verifySeedSignIn(opts: { evmAddress: `0x${string}`; solAddress: string; message: string; evmSignature: string; solSignature: string }): Promise<boolean> {
  let evmOk = false;
  try {
    evmOk = await verifyMessage({ address: opts.evmAddress, message: opts.message, signature: opts.evmSignature as `0x${string}` });
  } catch { evmOk = false; }
  return evmOk && verifySolanaMessage(opts.solAddress, opts.message, opts.solSignature);
}
