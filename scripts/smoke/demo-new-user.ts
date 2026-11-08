/**
 * Fresh demo user: setRules → setSolanaRecipient(USDC ATA) → deposit+allocate →
 * approveBuy → keeper execute → Iris → Solana receiveMessage → Jupiter → user AAPLx ATA.
 *
 *   cd backend && NODE_PATH=./node_modules npx tsx --env-file=../contracts/.env --env-file=.env ../scripts/smoke/demo-new-user.ts
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
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const arc = defineChain({
  id: 5042,
  name: 'Arc',
  nativeCurrency: { name: 'USDC', symbol: 'USDC', decimals: 18 },
  rpcUrls: { default: { http: [process.env.RPC_ARC!] } },
});

const VAULT = process.env.VAULT_ADDRESS as Address;
const USDC = '0x3600000000000000000000000000000000000000' as Address;
const USER_PK = (process.env.DEMO_USER_PRIVATE_KEY || process.env.TEST_USER_PRIVATE_KEY) as Hex;
const KEEPER_PK = process.env.KEEPER_PRIVATE_KEY as Hex;
const AMOUNT = BigInt(process.env.SMOKE_USD6 ?? '300000');
const ATA_BYTES32 = process.env.DEMO_SOL_USDC_ATA_BYTES32 as Hex;
const APPLE = keccak256(stringToHex('co:apple'));
const FALLBACK = keccak256(stringToHex('idx:sp500'));

const vaultAbi = parseAbi([
  'function setRules((uint16 rateBps,uint64 monthlyCap,bytes32 fallbackAsset))',
  'function setSolanaRecipient(bytes32 ata)',
  'function deposit(uint256 amount)',
  'function allocate(bytes32 purchaseId,bytes32[] assets,uint256[] amounts)',
  'function approveBuy((address user,(bytes32 asset,uint256 amount,uint32 domain,uint256 maxPriceUsd6)[] items,uint256 maxFeeUsd6,uint256 nonce,uint64 deadline) a)',
  'function execute(bytes32 batchId,uint32 domain,( (address user,(bytes32 asset,uint256 amount,uint32 domain,uint256 maxPriceUsd6)[] items,uint256 maxFeeUsd6,uint256 nonce,uint64 deadline) approval,bytes signature,uint256[] itemIndex,uint256[] amounts )[] orders)',
  'function jar(address,bytes32) view returns (uint256)',
  'function solanaRecipient(address) view returns (bytes32)',
]);
const erc20Abi = parseAbi([
  'function approve(address spender,uint256 amount) returns (bool)',
  'function balanceOf(address) view returns (uint256)',
]);

async function main() {
  if (!ATA_BYTES32?.startsWith('0x')) throw new Error('DEMO_SOL_USDC_ATA_BYTES32 required');
  const user = privateKeyToAccount(USER_PK);
  const keeper = privateKeyToAccount(KEEPER_PK);
  const pub = createPublicClient({ chain: arc, transport: http() });
  const userClient = createWalletClient({ account: user, chain: arc, transport: http() });
  const keeperClient = createWalletClient({ account: keeper, chain: arc, transport: http() });

  const log: Record<string, unknown>[] = [];
  const send = async (label: string, data: Hex, client = userClient) => {
    const before = await pub.getBalance({ address: client.account!.address });
    const hash = await client.sendTransaction({ to: VAULT, data });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    const after = await pub.getBalance({ address: client.account!.address });
    const row = {
      step: label,
      tx: hash,
      status: receipt.status,
      gasUsed: receipt.gasUsed.toString(),
      gasCostNativeWei: (receipt.gasUsed * (receipt.effectiveGasPrice ?? 0n)).toString(),
      nativeDeltaWei: (before - after).toString(),
    };
    log.push(row);
    console.log(JSON.stringify(row));
    if (receipt.status !== 'success') throw new Error(`${label} failed`);
    return hash;
  };

  console.log('user', user.address, 'amount', AMOUNT.toString());

  // setRules (cheap overwrite; always allowed)
  await send(
    'setRules',
    encodeFunctionData({
      abi: vaultAbi,
      functionName: 'setRules',
      args: [{ rateBps: 500, monthlyCap: 50_000_000n, fallbackAsset: FALLBACK }],
    }),
  );

  // setSolanaRecipient — first set is immediate; later calls only propose (48h). Skip if already correct.
  const onchainAta = await pub.readContract({
    address: VAULT,
    abi: vaultAbi,
    functionName: 'solanaRecipient',
    args: [user.address],
  });
  console.log('solanaRecipient', onchainAta);
  if (onchainAta === '0x0000000000000000000000000000000000000000000000000000000000000000') {
    await send(
      'setSolanaRecipient',
      encodeFunctionData({ abi: vaultAbi, functionName: 'setSolanaRecipient', args: [ATA_BYTES32] }),
    );
  } else if (onchainAta.toLowerCase() !== ATA_BYTES32.toLowerCase()) {
    throw new Error('ATA mismatch on-chain (pending change needs activateSolanaRecipient)');
  }

  // approve + deposit
  {
    const data = encodeFunctionData({
      abi: erc20Abi,
      functionName: 'approve',
      args: [VAULT, AMOUNT],
    });
    const before = await pub.getBalance({ address: user.address });
    const hash = await userClient.sendTransaction({ to: USDC, data });
    const receipt = await pub.waitForTransactionReceipt({ hash });
    const after = await pub.getBalance({ address: user.address });
    const row = {
      step: 'usdc.approve',
      tx: hash,
      status: receipt.status,
      gasUsed: receipt.gasUsed.toString(),
      gasCostNativeWei: (receipt.gasUsed * (receipt.effectiveGasPrice ?? 0n)).toString(),
      nativeDeltaWei: (before - after).toString(),
    };
    log.push(row);
    console.log(JSON.stringify(row));
  }
  await send(
    'deposit',
    encodeFunctionData({ abi: vaultAbi, functionName: 'deposit', args: [AMOUNT] }),
  );

  const purchaseId = keccak256(stringToHex(`demo-apple-${Date.now()}`));
  await send(
    'allocate',
    encodeFunctionData({
      abi: vaultAbi,
      functionName: 'allocate',
      args: [purchaseId, [APPLE], [AMOUNT]],
    }),
  );

  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  const nonce = BigInt(
    keccak256(encodeAbiParameters([{ type: 'string' }, { type: 'uint256' }], ['demo-buy', deadline])),
  );
  const approval = {
    user: user.address,
    items: [{ asset: APPLE, amount: AMOUNT, domain: 5, maxPriceUsd6: 400_000_000n }],
    maxFeeUsd6: (AMOUNT * 500n) / 10_000n,
    nonce,
    deadline,
  };
  await send(
    'approveBuy',
    encodeFunctionData({ abi: vaultAbi, functionName: 'approveBuy', args: [approval] }),
  );

  const batchId = keccak256(
    encodeAbiParameters(
      [{ type: 'string' }, { type: 'address' }, { type: 'uint256' }, { type: 'uint64' }],
      ['demo-batch', user.address, AMOUNT, deadline],
    ),
  );
  const execHash = await send(
    'execute',
    encodeFunctionData({
      abi: vaultAbi,
      functionName: 'execute',
      args: [
        batchId,
        5,
        [{ approval, signature: '0x' as Hex, itemIndex: [0n], amounts: [AMOUNT] }],
      ],
    }),
    keeperClient,
  );

  // Iris
  let message = '';
  let attestation = '';
  for (let i = 0; i < 40; i++) {
    const resp = await fetch(`https://iris-api.circle.com/v2/messages/26?transactionHash=${execHash}`);
    const body = (await resp.json()) as { messages?: { status: string; message: string; attestation: string }[] };
    const m = body.messages?.[0];
    console.log('iris', i, m?.status);
    if (m?.status === 'complete') {
      message = m.message;
      attestation = m.attestation;
      break;
    }
    await new Promise((r) => setTimeout(r, 5000));
  }
  if (!message) throw new Error('iris timeout');
  fs.writeFileSync('/tmp/cctp-message.hex', message);
  fs.writeFileSync('/tmp/cctp-attestation.hex', attestation);

  // Solana receive + Jupiter (child script; uses RELAY_SOL_KEY + DEMO sol owner)
  process.env.SMOKE_SOL_USER = process.env.DEMO_SOL_ADDRESS;
  process.env.SMOKE_SWAP_MAX = AMOUNT.toString();
  process.env.CCTP_MESSAGE = message;
  process.env.CCTP_ATTESTATION = attestation;
  // Force receive by ensuring we don't skip — child checks USDC balance

  const childEnv = {
    ...process.env,
    SMOKE_SOL_USER: process.env.DEMO_SOL_ADDRESS!,
    SMOKE_SWAP_MAX: AMOUNT.toString(),
  };
  const out = execFileSync('npx', ['tsx', path.join(__dirname, 'sol-receive-swap.ts')], {
    cwd: __dirname,
    env: childEnv,
    encoding: 'utf8',
  });
  console.log(out);
  fs.writeFileSync('/tmp/demo-new-user-log.json', JSON.stringify({ arc: log, sol: out, execHash, batchId }, null, 2));
  console.log('DONE execHash', execHash);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
