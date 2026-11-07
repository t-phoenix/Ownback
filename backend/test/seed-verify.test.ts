import { generateKeyPairSync, sign } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import { privateKeyToAccount, generatePrivateKey } from 'viem/accounts';
import { verifySeedSignIn, verifySolanaMessage } from '../src/lib/seed-verify.js';

const B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
function b58(bytes: Uint8Array) {
  let n = BigInt('0x' + (Buffer.from(bytes).toString('hex') || '0'));
  let s = '';
  while (n > 0n) { s = B58[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b !== 0) break; s = '1' + s; }
  return s;
}
function solKeys() {
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  const raw = publicKey.export({ format: 'der', type: 'spki' }).subarray(12);
  return { address: b58(raw), signMsg: (m: string) => b58(sign(null, Buffer.from(m), privateKey)) };
}

describe('seed sign-in verification', () => {
  const message = 'Ownback sign-in\nnonce:abc123';
  it('accepts real EVM + Solana signatures over the nonce message', async () => {
    const evm = privateKeyToAccount(generatePrivateKey());
    const sol = solKeys();
    const ok = await verifySeedSignIn({ evmAddress: evm.address, solAddress: sol.address, message, evmSignature: await evm.signMessage({ message }), solSignature: sol.signMsg(message) });
    expect(ok).toBe(true);
  });
  it('rejects a signature over a different nonce, and junk', async () => {
    const evm = privateKeyToAccount(generatePrivateKey());
    const sol = solKeys();
    const ok = await verifySeedSignIn({ evmAddress: evm.address, solAddress: sol.address, message, evmSignature: await evm.signMessage({ message: 'other' }), solSignature: sol.signMsg(message) });
    expect(ok).toBe(false);
    expect(verifySolanaMessage(sol.address, message, 'not-a-signature')).toBe(false);
  });
});
