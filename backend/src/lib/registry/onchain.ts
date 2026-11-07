/** Live mint checks. Never invent decimals. */

export async function solanaTokenDecimals(mint: string, rpc = process.env.RPC_SOLANA): Promise<number> {
  const url = rpc || 'https://api.mainnet-beta.solana.com';
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'getTokenSupply',
      params: [mint],
    }),
  });
  if (!res.ok) throw new Error(`solana_rpc_http_${res.status}`);
  const body = (await res.json()) as {
    result?: { value?: { decimals?: number } };
    error?: { message?: string };
  };
  if (body.error) throw new Error(body.error.message || 'solana_rpc_error');
  const dec = body.result?.value?.decimals;
  if (typeof dec !== 'number') throw new Error('mint_not_found');
  return dec;
}

export async function ethereumTokenDecimals(
  address: string,
  rpc = process.env.RPC_ETHEREUM,
): Promise<number> {
  const url = rpc || 'https://ethereum.publicnode.com';
  // decimals() = 0x313ce567
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to: address, data: '0x313ce567' }, 'latest'],
    }),
  });
  if (!res.ok) throw new Error(`eth_rpc_http_${res.status}`);
  const body = (await res.json()) as { result?: string; error?: { message?: string } };
  if (body.error) throw new Error(body.error.message || 'eth_rpc_error');
  if (!body.result || body.result === '0x') throw new Error('mint_not_found');
  return Number(BigInt(body.result));
}

export async function readOnchainDecimals(
  chain: 'solana' | 'ethereum' | 'base' | 'arbitrum',
  mint: string,
): Promise<number> {
  if (chain === 'solana') return solanaTokenDecimals(mint);
  const rpc =
    chain === 'base' ? process.env.RPC_BASE : chain === 'arbitrum' ? process.env.RPC_ARBITRUM : process.env.RPC_ETHEREUM;
  return ethereumTokenDecimals(mint, rpc);
}
