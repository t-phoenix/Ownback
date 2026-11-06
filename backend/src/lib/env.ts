export function envFlag(name: string, fallback = false): boolean {
  const v = process.env[name];
  if (v === undefined || v === '') return fallback;
  return v === '1' || v.toLowerCase() === 'true';
}

export function mockChain(): boolean {
  return envFlag('MOCK_CHAIN', true);
}

export function requireCron(authHeader: string | undefined): void {
  const secret = process.env.CRON_SECRET;
  if (!secret || authHeader !== `Bearer ${secret}`) {
    const err = new Error('UNAUTHENTICATED');
    (err as Error & { code: string }).code = 'UNAUTHENTICATED';
    throw err;
  }
}
