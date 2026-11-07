import { readFileSync, writeFileSync } from 'node:fs';
import { candidatesPath, curatedPath } from './paths.js';
import type { AssetCandidate, CandidatesFile, CuratedAsset, CuratedFile } from './types.js';

function today() {
  return new Date().toISOString().slice(0, 10);
}

export function loadCurated(): CuratedFile {
  const raw = readFileSync(curatedPath(), 'utf8');
  return JSON.parse(raw) as CuratedFile;
}

export function saveCurated(file: CuratedFile) {
  file.updatedAt = today();
  writeFileSync(curatedPath(), `${JSON.stringify(file, null, 2)}\n`);
}

export function loadCandidates(): CandidatesFile {
  const raw = readFileSync(candidatesPath(), 'utf8');
  return JSON.parse(raw) as CandidatesFile;
}

export function saveCandidates(file: CandidatesFile) {
  file.updatedAt = today();
  writeFileSync(candidatesPath(), `${JSON.stringify(file, null, 2)}\n`);
}

export function getVerifiedAsset(assetId: string): CuratedAsset | undefined {
  return loadCurated().assets.find((a) => a.assetId === assetId);
}

export function listVerifiedAssets(): CuratedAsset[] {
  return loadCurated().assets.filter((a) => a.mints.some((m) => m.verified));
}

export function upsertCandidate(c: AssetCandidate): AssetCandidate {
  const file = loadCandidates();
  const i = file.candidates.findIndex(
    (x) => x.assetId === c.assetId && x.chain === c.chain && x.mint === c.mint,
  );
  if (i >= 0) {
    const prev = file.candidates[i]!;
    if (prev.status === 'promoted') return prev;
    const merged: AssetCandidate = {
      ...prev,
      ...c,
      id: prev.id,
      createdAt: prev.createdAt,
      updatedAt: new Date().toISOString(),
      evidence: mergeEvidence(prev.evidence, c.evidence),
    };
    file.candidates[i] = merged;
    saveCandidates(file);
    return merged;
  }
  file.candidates.push(c);
  saveCandidates(file);
  return c;
}

function mergeEvidence(
  a: AssetCandidate['evidence'],
  b: AssetCandidate['evidence'],
): AssetCandidate['evidence'] {
  const byKind = new Map(a.map((e) => [e.kind, e]));
  for (const e of b) byKind.set(e.kind, e);
  return [...byKind.values()];
}

export function getCandidate(id: string): AssetCandidate | undefined {
  return loadCandidates().candidates.find((c) => c.id === id);
}

export function updateCandidate(id: string, patch: Partial<AssetCandidate>): AssetCandidate | undefined {
  const file = loadCandidates();
  const i = file.candidates.findIndex((c) => c.id === id);
  if (i < 0) return undefined;
  const next = { ...file.candidates[i]!, ...patch, updatedAt: new Date().toISOString() };
  file.candidates[i] = next;
  saveCandidates(file);
  return next;
}
