/**
 * Drizzle mirror of database/migrations/0001_init.sql (database/schema.md).
 * Keep in sync with the SQL migration; apps/web will own this when O1 lands.
 */
import {
  bigint,
  boolean,
  char,
  date,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uuid,
  customType,
} from 'drizzle-orm/pg-core';

const bytea = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return 'bytea';
  },
});

export const users = pgTable('users', {
  id: uuid('id').primaryKey(),
  authKind: text('auth_kind').notNull(),
  circleUserId: text('circle_user_id'),
  privyDid: text('privy_did'),
  email: text('email'),
  displayName: text('display_name').notNull(),
  evmAddress: text('evm_address'),
  solAddress: text('sol_address'),
  solUsdcAta: text('sol_usdc_ata'),
  referralCode: text('referral_code').notNull(),
  referredBy: uuid('referred_by'),
  country: text('country'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const sessions = pgTable('sessions', {
  id: text('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().defaultNow(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  userAgent: text('user_agent'),
});

export const authNonces = pgTable('auth_nonces', {
  nonce: text('nonce').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true }),
});

export const rules = pgTable('rules', {
  userId: uuid('user_id').primaryKey(),
  rateBps: integer('rate_bps').notNull(),
  monthlyCapUsd6: bigint('monthly_cap_usd6', { mode: 'bigint' }).notNull(),
  readyMinUsd6: bigint('ready_min_usd6', { mode: 'bigint' }).notNull(),
  fallbackAsset: text('fallback_asset').notNull(),
  splitMaker: integer('split_maker').notNull(),
  splitBehind: integer('split_behind').notNull(),
  splitMaterials: integer('split_materials').notNull(),
  buyDay: text('buy_day').notNull(),
  maxFeeBps: integer('max_fee_bps').notNull(),
  autoAdd: jsonb('auto_add').notNull(),
  onchainSyncedAt: timestamp('onchain_synced_at', { withTimezone: true }),
  onboardedAt: timestamp('onboarded_at', { withTimezone: true }),
  notifyBuyDone: boolean('notify_buy_done').notNull(),
  notifyNeedsReview: boolean('notify_needs_review').notNull(),
  notifyNearLimit: boolean('notify_near_limit').notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const purchases = pgTable('purchases', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  source: text('source').notNull(),
  status: text('status').notNull(),
  shop: text('shop'),
  place: text('place'),
  items: jsonb('items'),
  purchasedOn: date('purchased_on'),
  amountLocal: numeric('amount_local', { precision: 14, scale: 2 }),
  currency: char('currency', { length: 3 }),
  fxRate: numeric('fx_rate', { precision: 18, scale: 8 }),
  fxSource: text('fx_source'),
  fxDate: date('fx_date'),
  amountUsd6: bigint('amount_usd6', { mode: 'bigint' }),
  rateBps: integer('rate_bps'),
  investUsd6: bigint('invest_usd6', { mode: 'bigint' }),
  split: jsonb('split'),
  restUsd6: bigint('rest_usd6', { mode: 'bigint' }).notNull().default(0n),
  readError: text('read_error'),
  gmailMessageId: text('gmail_message_id'),
  confirmTx: text('confirm_tx'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull(),
});

export const allocations = pgTable('allocations', {
  id: uuid('id').primaryKey(),
  purchaseId: uuid('purchase_id').notNull(),
  assetId: text('asset_id').notNull(),
  role: text('role').notNull(),
  amountUsd6: bigint('amount_usd6', { mode: 'bigint' }).notNull(),
  selected: boolean('selected').notNull().default(true),
  why: text('why'),
  sourceUrl: text('source_url'),
  arkivKey: text('arkiv_key'),
  savedUsd6: bigint('saved_usd6', { mode: 'bigint' }).notNull().default(0n),
  boughtUsd6: bigint('bought_usd6', { mode: 'bigint' }).notNull().default(0n),
});

export const deposits = pgTable('deposits', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  chain: text('chain').notNull(),
  txHash: text('tx_hash').notNull(),
  fromAddress: text('from_address').notNull(),
  token: text('token').notNull(),
  amountUsd6: bigint('amount_usd6', { mode: 'bigint' }).notNull(),
  status: text('status').notNull(),
  confirmations: integer('confirmations').notNull(),
  slow: boolean('slow').notNull(),
  vaultTx: text('vault_tx'),
  forwardTx: text('forward_tx'),
  feesUsd6: bigint('fees_usd6', { mode: 'bigint' }).notNull(),
  seenAt: timestamp('seen_at', { withTimezone: true }).notNull(),
  addedAt: timestamp('added_at', { withTimezone: true }),
});

export const events = pgTable('events', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  kind: text('kind').notNull(),
  payload: jsonb('payload').notNull(),
  link: text('link'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const idempotencyKeys = pgTable(
  'idempotency_keys',
  {
    userId: uuid('user_id').notNull(),
    key: text('key').notNull(),
    requestHash: text('request_hash').notNull(),
    response: jsonb('response').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.key] })],
);

export const buyApprovals = pgTable('buy_approvals', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  hash: bytea('hash').notNull(),
  typedData: jsonb('typed_data').notNull(),
  signature: bytea('signature').notNull(),
  deadline: timestamp('deadline', { withTimezone: true }).notNull(),
  status: text('status').notNull(),
  maxFeeUsd6: bigint('max_fee_usd6', { mode: 'bigint' }).notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull(),
});

export const buyBatches = pgTable('buy_batches', {
  id: uuid('id').primaryKey(),
  onchainId: bytea('onchain_id'),
  trigger: text('trigger').notNull(),
  userId: uuid('user_id'),
  domain: integer('domain'),
  status: text('status').notNull(),
  totalUsd6: bigint('total_usd6', { mode: 'bigint' }).notNull(),
  arcTx: text('arc_tx'),
  cctpMessage: text('cctp_message'),
  mintTx: text('mint_tx'),
  returnTx: text('return_tx'),
  feesUsd6: bigint('fees_usd6', { mode: 'bigint' }).notNull(),
  feesCovered: boolean('fees_covered').notNull(),
  slow: boolean('slow').notNull(),
  startedAt: timestamp('started_at', { withTimezone: true }),
  finishedAt: timestamp('finished_at', { withTimezone: true }),
});

export const quotes = pgTable('quotes', {
  id: uuid('id').primaryKey(),
  userId: uuid('user_id').notNull(),
  payload: jsonb('payload').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
});
