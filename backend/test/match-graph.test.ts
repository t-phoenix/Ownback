import { describe, expect, it } from 'vitest';
import { filterKnown, lookupProductGraph } from '../src/lib/match/graph.js';

describe('product graph', () => {
  it('maps iPhone to Apple supply + materials', () => {
    const row = lookupProductGraph('iPhone 16 Pro', 'Apple');
    expect(row?.category).toBe('hardware_phone');
    expect(row?.behind.map((b) => b.assetId)).toEqual(
      expect.arrayContaining(['co:tsmc', 'co:qualcomm', 'co:corning']),
    );
    expect(row?.materials.map((m) => m.assetId)).toEqual(
      expect.arrayContaining(['mat:gold', 'mat:silver']),
    );
  });

  it('maps Dove soap without inventing materials', () => {
    const row = lookupProductGraph('Dove body wash', null);
    expect(row?.category).toBe('cpg_personal_care');
    expect(row?.materials).toEqual([]);
  });

  it('filterKnown drops unknown asset ids', () => {
    expect(filterKnown([{ assetId: 'co:not-a-real-company-xyz', why: 'nope' }])).toEqual([]);
    expect(filterKnown([{ assetId: 'co:apple', why: 'Made it.' }]).length).toBe(1);
  });
});
