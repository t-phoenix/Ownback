import { randomBytes, randomUUID } from 'node:crypto';

/** UUID v7 when available; otherwise randomUUID with shortcut note. */
export function newId(): string {
  const c = randomUUID as unknown as { (opts?: { version?: number }): string };
  try {
    // Node 22+ supports version option for v7
    return c({ version: 7 });
  } catch {
    // shortcut: v4 until Node always exposes v7, migrate when engines pin Node 22+
    return randomUUID();
  }
}

export function sessionId(): string {
  return randomBytes(32).toString('base64url');
}

export function shareId(): string {
  return randomBytes(16).toString('base64url');
}

export function referralCode(displayName: string): string {
  const base = displayName.replace(/[^A-Za-z]/g, '').slice(0, 4).toUpperCase() || 'USER';
  const n = randomBytes(2).readUInt16BE(0) % 100;
  return `${base}${n.toString().padStart(2, '0')}`;
}
