/**
 * Arc buy smoke: approveBuy (S20) → keeper execute (CCTP domain 5).
 * Assumes setSolanaRecipient already set (USDC ATA derived from Privy solAddress — not an RWA ATA).
 * Uses real Arc RPC (forge can't sim USDC precompile).
 *
 *   cd backend && npx tsx ../scripts/smoke/arc-buy.ts
 */
import {
  createWalletClient,
  createPublicClient,
  http,
  encodeFunctionData,
  keccak256,
  encodeAbiParameters,
  parseAbi,
  stringToHex,
  type Hex,
  type Address,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { defineChain } from 'viem';

const arc = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_ARC!] } },
});

const VAULT = process.env.VAULT_ADDRESS as Address;
const USER_PK = process.env.TEST_USER_PRIVATE_KEY as Hex;
const KEEPER_PK = process.env.KEEPER_PRIVATE_KEY as Hex;
const AMOUNT = BigInt(process.env.SMOKE_USD6 ?? '300000');
// Solidity keccak256("co:apple") == cast keccak "co:apple"
const APPLE_SOL = keccak256(stringToHex('co:apple')) as Hex;

const abi = parseAbi([
  'function approveBuy((address user,(bytes32 asset,uint256 amount,uint32 domain,uint256 maxPriceUsd6)[] items,uint256 maxFeeUsd6,uint256 nonce,uint64 deadline) a)',
  'function execute(bytes32 batchId,uint32 domain,( (address user,(bytes32 asset,uint256 amount,uint32 domain,uint256 maxPriceUsd6)[] items,uint256 maxFeeUsd6,uint256 nonce,uint64 deadline) approval,bytes signature,uint256[] itemIndex,uint256[] amounts )[] orders)',
  'function jar(address,bytes32) view returns (uint256)',
  'function hashApproval((address user,(bytes32 asset,uint256 amount,uint32 domain,uint256 maxPriceUsd6)[] items,uint256 maxFeeUsd6,uint256 nonce,uint64 deadline)) view returns (bytes32)',
]);

async function main() {
  const asset = APPLE_SOL;
  console.log('APPLE', asset);

  const user = privateKeyToAccount(USER_PK);
  const keeper = privateKeyToAccount(KEEPER_PK);
  const pub = createPublicClient({ chain: arc, transport: http() });
  const userClient = createWalletClient({ account: user, chain: arc, transport: http() });
  const keeperClient = createWalletClient({ account: keeper, chain: arc, transport: http() });

  const jar = await pub.readContract({ address: VAULT, abi, functionName: 'jar', args: [user.address, asset] });
  console.log('jar', jar.toString(), 'want', AMOUNT.toString());
  if (jar < AMOUNT) throw new Error('jar too small');

  const beforeUser = await pub.getBalance({ address: user.address });
  const beforeKeeper = await pub.getBalance({ address: keeper.address });

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const nonce = BigInt(keccak256(encodeAbiParameters([{ type: 'string' }, { type: 'uint256' }], ['smoke-buy', deadline])));
  const approval = {
    user: user.address,
    items: [{ asset, amount: AMOUNT, domain: 5, maxPriceUsd6: 400_000_000n }],
    maxFeeUsd6: (AMOUNT * 500n) / 10_000n,
    nonce,
    deadline,
  };

  const approveData = encodeFunctionData({ abi, functionName: 'approveBuy', args: [approval] });
  const approveHash = await userClient.sendTransaction({ to: VAULT, data: approveData });
  const approveReceipt = await pub.waitForTransactionReceipt({ hash: approveHash });
  const afterUser = await pub.getBalance({ address: user.address });
  console.log(JSON.stringify({
    step: 'approveBuy',
    tx: approveHash,
    status: approveReceipt.status,
    gasUsed: approveReceipt.gasUsed.toString(),
    effectiveGasPrice: approveReceipt.effectiveGasPrice?.toString(),
    gasCostNativeWei: (approveReceipt.gasUsed * (approveReceipt.effectiveGasPrice ?? 0n)).toString(),
    userNativeDeltaWei: (beforeUser - afterUser).toString(),
  }));

  const approvalHash = await pub.readContract({ address: VAULT, abi, functionName: 'hashApproval', args: [approval] });
  console.log('approvalHash', approvalHash);

  const batchId = keccak256(
    encodeAbiParameters(
      [{ type: 'string' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint64' }],
      ['smoke-batch', user.address, AMOUNT, deadline],
    ),
  );
  const orders = [
    {
      approval,
      signature: '0x' as Hex,
      itemIndex: [0n],
      amounts: [AMOUNT],
    },
  ];
  const execData = encodeFunctionData({
    abi,
    functionName: 'execute',
    args: [batchId, 5, orders],
  });
  const beforeK2 = await pub.getBalance({ address: keeper.address });
  const execHash = await keeperClient.sendTransaction({ to: VAULT, data: execData });
  const execReceipt = await pub.waitForTransactionReceipt({ hash: execHash });
  const afterKeeper = await pub.getBalance({ address: keeper.address });
  console.log(JSON.stringify({
    step: 'execute',
    tx: execHash,
    batchId,
    status: execReceipt.status,
    gasUsed: execReceipt.gasUsed.toString(),
    effectiveGasPrice: execReceipt.effectiveGasPrice?.toString(),
    gasCostNativeWei: (execReceipt.gasUsed * (execReceipt.effectiveGasPrice ?? 0n)).toString(),
    keeperNativeDeltaWei: (beforeK2 - afterKeeper).toString(),
    jarAfter: (await pub.readContract({ address: VAULT, abi, functionName: 'jar', args: [user.address, asset] })).toString(),
  }));

  if (execReceipt.status !== 'success') throw new Error('execute failed');
  console.log('ARC_TX', execHash);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
