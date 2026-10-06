/** Error codes the API returns. Stable: match on these, never on messages. */
export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'CODE_ALREADY_REDEEMED'
  | 'PARTICIPANT_REQUIRED'
  | 'INVALID_STATE'
  | 'CLAIM_EXPIRED'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'CAMPAIGN_NOT_ACTIVE'
  | 'SANDBOX_ONLY'
  | 'CODE_NOT_FOUND'
  | 'CAMPAIGN_NOT_FOUND'
  | 'NOT_FOUND'
  | 'CAPTCHA_REQUIRED'
  | 'CONFLICT'
  | 'IDEMPOTENCY_KEY_REUSED'
  | 'REQUEST_IN_PROGRESS'
  | 'RATE_LIMIT_EXCEEDED'
  | 'API_RATE_LIMIT_EXCEEDED'
  | 'INTERNAL_SERVER_ERROR'
  | 'RETRY_LATER';

/** The API answered with an error: `{ error: { code, message, details? } }`. */
export class LuckLogicError extends Error {
  override readonly name: string = 'LuckLogicError';
  /** Known codes are typed; an unknown future code still comes through as a string. */
  readonly code: ErrorCode | (string & {});
  readonly status: number;
  readonly details: unknown;
  /** `X-Request-Id`, for support requests. */
  readonly requestId: string | null;
  /** Seconds from `Retry-After`, when the API sent one. */
  readonly retryAfter: number | null;

  constructor(init: {
    status: number;
    code: string;
    message: string;
    details?: unknown;
    requestId?: string | null;
    retryAfter?: number | null;
  }) {
    super(init.message);
    this.status = init.status;
    this.code = init.code;
    this.details = init.details;
    this.requestId = init.requestId ?? null;
    this.retryAfter = init.retryAfter ?? null;
  }
}

/** No answer from the API: DNS, refused or reset connection, or a timeout. */
export class LuckLogicConnectionError extends Error {
  override readonly name: string = 'LuckLogicConnectionError';
  readonly timedOut: boolean;

  constructor(message: string, options: { cause?: unknown; timedOut?: boolean } = {}) {
    super(message, { cause: options.cause });
    this.timedOut = options.timedOut ?? false;
  }
}

/** A webhook failed signature verification. Treat the request as forged and answer 400. */
export class WebhookVerificationError extends Error {
  override readonly name: string = 'WebhookVerificationError';
}

/** True for an API error with this code. Narrows `err` for TypeScript. */
export function isLuckLogicError(err: unknown, code?: ErrorCode): err is LuckLogicError {
  return err instanceof LuckLogicError && (code === undefined || err.code === code);
}
