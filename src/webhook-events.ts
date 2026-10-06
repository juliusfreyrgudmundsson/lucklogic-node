import { WebhookVerificationError } from './errors.js';
import type { ClaimStatus } from './types.js';

/** A code won: sent once per winning redemption. */
export type PrizeClaimedEvent = {
  event: 'prize.claimed';
  campaign_id: string;
  timestamp: string;
  data: {
    redemption_id: string;
    participant_id: string;
    prize_tier: string;
    prize_name: string;
    claim_token: string;
    redeemed_at: string;
  };
};

/** A prize claim changed status. */
export type ClaimUpdatedEvent = {
  event: 'claim.updated';
  campaign_id: string;
  timestamp: string;
  data: {
    claim_token: string;
    redemption_id: string;
    from: ClaimStatus;
    to: ClaimStatus;
    action: 'auto_approved' | 'approved' | 'rejected' | 'fulfilled' | 'collected' | 'expired' | 'reopened';
    location_id: string | null;
    /** `system` for automatic moves such as expiry; `public` for the hosted prize page. */
    actor_kind: 'user' | 'api_key' | 'system' | 'public';
  };
};

/** Sent by `webhooks.test()` so you can check your receiver. */
export type WebhookTestEvent = {
  event: 'webhook.test';
  timestamp: string;
  data: { webhook_id: string };
};

export type WebhookEvent = PrizeClaimedEvent | ClaimUpdatedEvent | WebhookTestEvent;

export type VerifyWebhookInput = {
  /** The raw request body, exactly as received. Parsing and re-serialising it breaks the signature. */
  payload: string | Uint8Array | ArrayBuffer;
  /** The `X-LuckLogic-Signature` header: `t=<unix seconds>,v1=<hex>`. */
  signature: string | null | undefined;
  /** The endpoint's `whsec_…` secret, shown once when it was created. */
  secret: string;
  /** Reject deliveries signed longer ago than this, against replays. Default 300. */
  toleranceSeconds?: number;
  /** For tests: the current time in unix seconds. */
  now?: number;
};

const encoder = new TextEncoder();

function fromBase64Url(s: string): Uint8Array<ArrayBuffer> {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/') + '='.repeat((4 - (s.length % 4)) % 4);
  const bin = atob(b64);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function fromHex(hex: string): Uint8Array<ArrayBuffer> | null {
  if (!/^(?:[0-9a-f]{2})+$/i.test(hex)) return null;
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

function toBytes(payload: VerifyWebhookInput['payload']): Uint8Array {
  if (typeof payload === 'string') return encoder.encode(payload);
  return payload instanceof Uint8Array ? payload : new Uint8Array(payload);
}

/**
 * Check a webhook's signature and return the parsed event. Throws
 * WebhookVerificationError when the signature is missing, wrong or too old.
 * Uses Web Crypto, so it runs on Node 20+, Deno, Bun and edge runtimes.
 */
export async function verifyWebhook(input: VerifyWebhookInput): Promise<WebhookEvent> {
  const { signature, secret, toleranceSeconds = 300 } = input;
  if (!signature) throw new WebhookVerificationError('Missing X-LuckLogic-Signature header');
  if (!secret?.startsWith('whsec_')) throw new WebhookVerificationError('The secret must be the whsec_… value');

  const parts = new Map<string, string[]>();
  for (const item of signature.split(',')) {
    const i = item.indexOf('=');
    if (i <= 0) continue;
    const k = item.slice(0, i).trim();
    parts.set(k, [...(parts.get(k) ?? []), item.slice(i + 1).trim()]);
  }
  const t = Number(parts.get('t')?.[0]);
  const candidates = parts.get('v1') ?? [];
  if (!Number.isInteger(t) || candidates.length === 0) {
    throw new WebhookVerificationError('Malformed X-LuckLogic-Signature header');
  }
  const now = input.now ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - t) > toleranceSeconds) {
    throw new WebhookVerificationError('Webhook timestamp is outside the tolerance; possible replay');
  }

  const body = toBytes(input.payload);
  const key = await crypto.subtle.importKey(
    'raw',
    fromBase64Url(secret.slice('whsec_'.length)),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['verify']
  );
  const prefix = encoder.encode(`${t}.`);
  const signed = new Uint8Array(prefix.length + body.length);
  signed.set(prefix);
  signed.set(body, prefix.length);

  let valid = false;
  for (const hex of candidates) {
    const sig = fromHex(hex);
    // subtle.verify compares in constant time.
    if (sig && (await crypto.subtle.verify('HMAC', key, sig, signed))) valid = true;
  }
  if (!valid) throw new WebhookVerificationError('Webhook signature does not match');

  try {
    return JSON.parse(new TextDecoder().decode(body)) as WebhookEvent;
  } catch {
    throw new WebhookVerificationError('Webhook body is not JSON');
  }
}
