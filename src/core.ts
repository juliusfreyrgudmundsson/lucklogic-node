import { LuckLogicConnectionError, LuckLogicError } from './errors.js';
import { VERSION } from './version.js';

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

export type TransportOptions = {
  apiKey: string;
  baseUrl: string;
  timeoutMs: number;
  maxRetries: number;
  fetch: typeof fetch;
};

export type RequestOptions = {
  query?: Record<string, string | number | boolean | undefined | null>;
  body?: unknown;
  /**
   * Makes a POST safe to retry: the API replays the stored answer for a repeated key.
   * Only `POST /v1/redemptions` honours it.
   */
  idempotencyKey?: string;
  /** Overrides the client's timeout for this call. */
  timeoutMs?: number;
  /** Overrides the client's retry count for this call. */
  maxRetries?: number;
  signal?: AbortSignal;
};

/** Methods whose repetition cannot change the outcome. */
const IDEMPOTENT = new Set<HttpMethod>(['GET', 'PUT', 'DELETE']);
/** Ceiling on how long a Retry-After may make us wait inside one call. */
const MAX_RETRY_AFTER_MS = 10_000;

const sleep = (ms: number, signal?: AbortSignal) =>
  new Promise<void>((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const t = setTimeout(resolve, ms);
    signal?.addEventListener(
      'abort',
      () => {
        clearTimeout(t);
        reject(signal.reason);
      },
      { once: true }
    );
  });

function retryAfterSeconds(res: Response): number | null {
  const raw = res.headers.get('retry-after');
  if (!raw) return null;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, seconds);
  const date = Date.parse(raw);
  return Number.isNaN(date) ? null : Math.max(0, (date - Date.now()) / 1000);
}

/** Exponential backoff with full jitter: 0.5s, 1s, 2s… capped at 8s. */
function backoffMs(attempt: number): number {
  return Math.random() * Math.min(8000, 500 * 2 ** attempt);
}

export class Transport {
  constructor(private readonly options: TransportOptions) {}

  /**
   * One API call, with retries only where repeating it cannot do anything twice:
   * - API_RATE_LIMIT_EXCEEDED: the key's throttle refused the request before any work, so always retried.
   * - REQUEST_IN_PROGRESS: the same idempotency key is still being processed; wait and ask again.
   * - Connection errors, timeouts and 500/502/503/504: retried for GET/PUT/DELETE, and for a POST
   *   that carries an idempotency key. Other writes surface the error, because the API may have acted.
   * RATE_LIMIT_EXCEEDED (a participant's entry limit) is an answer, not a fault, and is never retried.
   */
  async request<T>(method: HttpMethod, path: string, opts: RequestOptions = {}): Promise<T> {
    const url = new URL(path, this.options.baseUrl);
    for (const [k, v] of Object.entries(opts.query ?? {})) {
      if (v !== undefined && v !== null && v !== '') url.searchParams.set(k, String(v));
    }
    const headers: Record<string, string> = {
      authorization: `Bearer ${this.options.apiKey}`,
      accept: 'application/json',
      'user-agent': `lucklogic-node/${VERSION}`,
    };
    if (opts.body !== undefined) headers['content-type'] = 'application/json';
    if (opts.idempotencyKey) headers['idempotency-key'] = opts.idempotencyKey;
    const body = opts.body !== undefined ? JSON.stringify(opts.body) : undefined;
    const safeToRepeat = IDEMPOTENT.has(method) || Boolean(opts.idempotencyKey);
    const maxRetries = opts.maxRetries ?? this.options.maxRetries;
    const timeoutMs = opts.timeoutMs ?? this.options.timeoutMs;

    for (let attempt = 0; ; attempt++) {
      const canRetry = attempt < maxRetries;
      const timeout = AbortSignal.timeout(timeoutMs);
      const signal = opts.signal ? AbortSignal.any([opts.signal, timeout]) : timeout;

      let res: Response;
      try {
        res = await this.options.fetch(url, { method, headers, body, signal });
      } catch (err) {
        if (opts.signal?.aborted) throw opts.signal.reason;
        const timedOut = timeout.aborted;
        if (canRetry && safeToRepeat) {
          await sleep(backoffMs(attempt), opts.signal);
          continue;
        }
        throw new LuckLogicConnectionError(
          timedOut
            ? `${method} ${url.pathname} timed out after ${timeoutMs} ms`
            : `${method} ${url.pathname} failed: ${(err as Error).message}`,
          { cause: err, timedOut }
        );
      }

      if (res.ok) {
        if (res.status === 204) return undefined as T;
        const text = await res.text();
        return (text ? JSON.parse(text) : undefined) as T;
      }

      const error = await toError(res);
      const retryable =
        error.code === 'API_RATE_LIMIT_EXCEEDED' ||
        error.code === 'REQUEST_IN_PROGRESS' ||
        (safeToRepeat && [500, 502, 503, 504].includes(res.status));
      if (!canRetry || !retryable) throw error;
      const waitMs = error.retryAfter !== null ? error.retryAfter * 1000 : backoffMs(attempt);
      if (waitMs > MAX_RETRY_AFTER_MS) throw error;
      await sleep(waitMs, opts.signal);
    }
  }
}

async function toError(res: Response): Promise<LuckLogicError> {
  const requestId = res.headers.get('x-request-id');
  const retryAfter = retryAfterSeconds(res);
  type Envelope = { error?: { code?: string; message?: string; details?: unknown } };
  let parsed: Envelope | null = null;
  try {
    parsed = (await res.json()) as Envelope;
  } catch {
    // A proxy or the platform answered, not the API.
  }
  const e = parsed?.error;
  return new LuckLogicError({
    status: res.status,
    code: e?.code ?? (res.status >= 500 ? 'INTERNAL_SERVER_ERROR' : `HTTP_${res.status}`),
    message: e?.message ?? `The API answered ${res.status} ${res.statusText}`.trim(),
    details: e?.details,
    requestId,
    retryAfter,
  });
}
