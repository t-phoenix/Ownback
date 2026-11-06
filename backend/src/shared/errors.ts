/** Error codes from backend/api-contract.md. Temporary until packages/shared (docs/03 O1). */

export const ErrorCodes = [
  'UNAUTHENTICATED',
  'AUTH_INVALID',
  'NONCE_USED',
  'GEO_BLOCKED',
  'VALIDATION',
  'NOT_FOUND',
  'RATE_LIMITED',
  'UPLOAD_TOO_LARGE',
  'UNSUPPORTED_MEDIA',
  'READ_FAILED',
  'NOTHING_TO_BUY',
  'INSUFFICIENT_FREE',
  'LIMIT_REACHED',
  'TX_REVERTED',
  'TX_NOT_FOUND',
  'CHALLENGE_FAILED',
  'DEPOSIT_NOT_READY',
  'CHAIN_UNSUPPORTED',
  'NO_SOLANA_RECIPIENT',
  'NO_READY_JARS',
  'QUOTE_EXPIRED',
  'PRICE_MOVED',
  'FEES_TOO_HIGH',
  'BAD_SIGNATURE',
  'APPROVAL_EXPIRED',
  'KEEPER_DISABLED',
  'GMAIL_DISABLED',
  'GMAIL_REVOKED',
  'FEATURE_OFF',
  'UPSTREAM',
  'INTERNAL',
] as const;
export type ErrorCode = (typeof ErrorCodes)[number];

export const ERROR_HTTP: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  AUTH_INVALID: 401,
  NONCE_USED: 409,
  GEO_BLOCKED: 451,
  VALIDATION: 400,
  NOT_FOUND: 404,
  RATE_LIMITED: 429,
  UPLOAD_TOO_LARGE: 413,
  UNSUPPORTED_MEDIA: 415,
  READ_FAILED: 422,
  NOTHING_TO_BUY: 409,
  INSUFFICIENT_FREE: 409,
  LIMIT_REACHED: 409,
  TX_REVERTED: 409,
  TX_NOT_FOUND: 409,
  CHALLENGE_FAILED: 409,
  DEPOSIT_NOT_READY: 409,
  CHAIN_UNSUPPORTED: 400,
  NO_SOLANA_RECIPIENT: 409,
  NO_READY_JARS: 409,
  QUOTE_EXPIRED: 409,
  PRICE_MOVED: 409,
  FEES_TOO_HIGH: 409,
  BAD_SIGNATURE: 400,
  APPROVAL_EXPIRED: 409,
  KEEPER_DISABLED: 503,
  GMAIL_DISABLED: 503,
  GMAIL_REVOKED: 409,
  FEATURE_OFF: 404,
  UPSTREAM: 502,
  INTERNAL: 500,
};

export const ERROR_RETRYABLE: Record<ErrorCode, boolean> = {
  UNAUTHENTICATED: false,
  AUTH_INVALID: false,
  NONCE_USED: false,
  GEO_BLOCKED: false,
  VALIDATION: false,
  NOT_FOUND: false,
  RATE_LIMITED: true,
  UPLOAD_TOO_LARGE: false,
  UNSUPPORTED_MEDIA: false,
  READ_FAILED: false,
  NOTHING_TO_BUY: false,
  INSUFFICIENT_FREE: false,
  LIMIT_REACHED: false,
  TX_REVERTED: true,
  TX_NOT_FOUND: true,
  CHALLENGE_FAILED: true,
  DEPOSIT_NOT_READY: true,
  CHAIN_UNSUPPORTED: false,
  NO_SOLANA_RECIPIENT: false,
  NO_READY_JARS: false,
  QUOTE_EXPIRED: true,
  PRICE_MOVED: false,
  FEES_TOO_HIGH: false,
  BAD_SIGNATURE: false,
  APPROVAL_EXPIRED: false,
  KEEPER_DISABLED: true,
  GMAIL_DISABLED: false,
  GMAIL_REVOKED: false,
  FEATURE_OFF: false,
  UPSTREAM: true,
  INTERNAL: true,
};

/** Vault custom error name → API code (api-contract.md). No OverAssetCap (Q1). */
export function mapVaultError(name: string): ErrorCode {
  switch (name) {
    case 'OverMonthlyCap':
      return 'LIMIT_REACHED';
    case 'InsufficientFree':
      return 'INSUFFICIENT_FREE';
    case 'IsPaused':
      return 'KEEPER_DISABLED';
    case 'PurchaseUsed':
      return 'INTERNAL'; // caller treats as success + re-read
    default:
      return 'TX_REVERTED';
  }
}

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    readonly details?: Record<string, unknown>,
  ) {
    super(code);
    this.name = 'ApiError';
  }

  get http() {
    return ERROR_HTTP[this.code];
  }

  get retryable() {
    return ERROR_RETRYABLE[this.code];
  }

  body() {
    return {
      error: {
        code: this.code,
        retryable: this.retryable,
        ...(this.details ? { details: this.details } : {}),
      },
    };
  }
}
