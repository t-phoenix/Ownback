/** Values from docs/04. Temporary home until packages/shared (docs/03 O1, D7). */

export const PurchaseStatuses = [
  'reading',
  'read_failed',
  'ready',
  'needs_review',
  'not_listed',
  'skipped',
  'confirming',
  'saved',
  'deleted',
] as const;
export type PurchaseStatus = (typeof PurchaseStatuses)[number];

export const DepositStatuses = [
  'seen',
  'confirming',
  'forwarding',
  'needs_approval',
  'moving',
  'added',
  'below_min',
  'wrong_token',
] as const;
export type DepositStatus = (typeof DepositStatuses)[number];

export const JarStates = [
  'filling',
  'ready',
  'approved',
  'buying',
  'returning',
  'paused',
  'fees_high',
  'no_venue',
] as const;
export type JarState = (typeof JarStates)[number];

export const BuyBatchStatuses = [
  'approved',
  'executing',
  'bridging',
  'swapping',
  'done',
  'done_partial',
  'failed',
] as const;
export type BuyBatchStatus = (typeof BuyBatchStatuses)[number];

export const BuyEntryStatuses = [
  'quoted',
  'waiting',
  'sent',
  'bought',
  'returning',
  'returned',
  'paused',
] as const;
export type BuyEntryStatus = (typeof BuyEntryStatuses)[number];

export const GmailStates = [
  'none',
  'no_access',
  'scanning',
  'found',
  'caught_up',
  'revoked',
] as const;
export type GmailState = (typeof GmailStates)[number];

export const GmailMessageStatuses = ['new', 'added', 'not_product', 'matched'] as const;
export type GmailMessageStatus = (typeof GmailMessageStatuses)[number];

export const WithdrawalStatuses = ['sending', 'sent', 'failed'] as const;
export type WithdrawalStatus = (typeof WithdrawalStatuses)[number];

export const EventKinds = [
  'deposit_added',
  'rules_changed',
  'fees_high',
  'buy_reminder',
  'approval_expired',
  'solana_recipient_changing',
  'receipt_matched',
  'needs_review',
  'jar_ready',
  'fallback_used',
  'limit_warning',
  'limit_reached',
  'buy_done',
  'buy_partial',
  'buy_returned',
  'buy_paused',
  'withdraw_sent',
  'gmail_found',
  'gmail_revoked',
  'rest_ready',
] as const;
export type EventKind = (typeof EventKinds)[number];

export const AllocationRoles = ['maker', 'supplier', 'material', 'fallback'] as const;
export type AllocationRole = (typeof AllocationRoles)[number];
