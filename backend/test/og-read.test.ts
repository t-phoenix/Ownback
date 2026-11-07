import { describe, expect, it } from 'vitest';
import { decimalToCents, localCentsToUsd6, rateToScaled } from '../src/lib/fx.js';
import { extractJson, normaliseRead, ReceiptRead } from '../src/lib/og/schemas.js';

describe('fx without floats', () => {
  it('parses decimals to cents', () => {
    expect(decimalToCents('79900')).toBe(7_990_000n);
    expect(decimalToCents('79900.5')).toBe(7_990_050n);
    expect(decimalToCents('0.07')).toBe(7n);
    expect(() => decimalToCents('1,000')).toThrow();
  });
  it('converts ₹79,900 at 83.66 to $955.06 in micro-USDC', () => {
    const usd6 = localCentsToUsd6(decimalToCents('79900.00'), rateToScaled('83.66'));
    expect(usd6).toBe(955_056_180n);
  });
  it('identity rate keeps dollars', () => {
    expect(localCentsToUsd6(decimalToCents('23.40'), rateToScaled('1'))).toBe(23_400_000n);
  });
});

describe('model output parsing', () => {
  it('extracts JSON from fenced prose and normalises Indian digit grouping', () => {
    const text = 'Sure!\n```json\n{"isReceipt":true,"shop":"Croma","currency":"inr","total":"1,14,900.00","items":[{"name":"MacBook Air","brand":"Apple","qty":"1","lineTotal":"1,14,900"}],"confidence":0.92}\n```';
    const r = ReceiptRead.parse(normaliseRead(extractJson(text)));
    expect(r.total).toBe('114900.00');
    expect(r.currency).toBe('INR');
    expect(r.items[0]!.qty).toBe(1);
    expect(r.isProduct).toBe(true);
  });
  it('throws when there is no JSON', () => {
    expect(() => extractJson('I cannot read this image.')).toThrow();
  });
});
