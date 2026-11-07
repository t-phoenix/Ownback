import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));

/** Resolve database/registry whether cwd is backend/ or repo root. */
export function registryDir(): string {
  const candidates = [
    resolve(process.cwd(), 'database/registry'),
    resolve(process.cwd(), '../database/registry'),
    resolve(here, '../../../../database/registry'),
  ];
  for (const p of candidates) {
    if (existsSync(p)) return p;
  }
  return candidates[1]!;
}

export function curatedPath() {
  return join(registryDir(), 'assets-curated.json');
}

export function candidatesPath() {
  return join(registryDir(), 'candidates.json');
}
