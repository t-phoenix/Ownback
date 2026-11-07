/**
 * On-chain decimals check for a mint.
 * Usage: npx tsx --env-file=backend/.env scripts/verify-asset-mint.ts solana <mint>
 */
async function main() {
  const chain = process.argv[2] ?? 'solana'
  const mint = process.argv[3]
  if (!mint) {
    console.error('usage: verify-asset-mint.ts <solana|ethereum|base|arbitrum> <mint>')
    process.exit(1)
  }

  if (chain === 'solana') {
    const rpc = process.env.RPC_SOLANA || 'https://api.mainnet-beta.solana.com'
    const res = await fetch(rpc, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getTokenSupply', params: [mint] }),
    })
    const body = await res.json()
    const dec = body?.result?.value?.decimals
    if (typeof dec !== 'number') {
      console.error('mint_not_found', body)
      process.exit(2)
    }
    console.log(JSON.stringify({ chain, mint, decimals: dec, supply: body.result.value }, null, 2))
    return
  }

  const rpc =
    chain === 'base'
      ? process.env.RPC_BASE
      : chain === 'arbitrum'
        ? process.env.RPC_ARBITRUM
        : process.env.RPC_ETHEREUM || 'https://ethereum.publicnode.com'
  const res = await fetch(rpc!, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to: mint, data: '0x313ce567' }, 'latest'],
    }),
  })
  const body = await res.json()
  if (!body.result || body.result === '0x') {
    console.error('mint_not_found', body)
    process.exit(2)
  }
  console.log(JSON.stringify({ chain, mint, decimals: Number(BigInt(body.result)) }, null, 2))
}

void main()
