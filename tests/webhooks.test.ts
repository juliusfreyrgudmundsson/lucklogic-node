import { createHmac, randomBytes } from 'node:crypto';
import { describe, expect, it } from 'vitest';

import { LuckLogic, WebhookVerificationError, verifyWebhook } from '../src/index.js';

// Exactly what the API does: a random 32-byte key, handed out as whsec_<base64url>,
// and `t=<unix>,v1=<hex HMAC-SHA256(key, "<t>.<body>")>` in X-LuckLogic-Signature.
const key = randomBytes(32);
const secret = `whsec_${key.toString('base64url')}`;
const sign = (t: number, body: string, k = key) =>
  `t=${t},v1=${createHmac('sha256', k).update(`${t}.${body}`).digest('hex')}`;

const now = 1_790_000_000;
const body = JSON.stringify({
  event: 'prize.claimed',
  campaign_id: 'camp_1',
  timestamp: '2026-10-06T12:00:00.000Z',
  data: {
    redemption_id: 'rdm_1',
    participant_id: 'crm_1',
    prize_tier: 'main',
    prize_name: 'PlayStation 5',
    claim_token: 'clm_1',
    redeemed_at: '2026-10-06T12:00:00.000Z',
  },
});

describe('verifyWebhook', () => {
  it('accepts a genuine delivery and returns the typed event', async () => {
    const event = await verifyWebhook({ payload: body, signature: sign(now, body), secret, now });
    expect(event.event).toBe('prize.claimed');
    if (event.event === 'prize.claimed') expect(event.data.prize_tier).toBe('main');
  });

  it('accepts the body as bytes, and through the client', async () => {
    const bytes = new TextEncoder().encode(body);
    await expect(verifyWebhook({ payload: bytes, signature: sign(now, body), secret, now })).resolves.toBeTruthy();
    const luck = new LuckLogic({ apiKey: 'sk_test_x' });
    await expect(
      luck.webhooks.verify({ payload: body, signature: sign(now, body), secret, now })
    ).resolves.toBeTruthy();
  });

  it('accepts when any of several v1 signatures matches (secret rotation)', async () => {
    const good = sign(now, body).split(',')[1];
    const header = `t=${now},v1=${'00'.repeat(32)},${good}`;
    await expect(verifyWebhook({ payload: body, signature: header, secret, now })).resolves.toBeTruthy();
  });

  it.each([
    ['a tampered body', { payload: body.replace('PlayStation 5', 'Car') }],
    ['another secret', { secret: `whsec_${randomBytes(32).toString('base64url')}` }],
    ['an old timestamp', { now: now + 301 }],
    ['a missing header', { signature: undefined }],
    ['a malformed header', { signature: 'v1=abc' }],
    ['a non-hex signature', { signature: `t=${now},v1=zz` }],
    ['a secret without its prefix', { secret: key.toString('base64url') }],
  ])('rejects %s', async (_label, override) => {
    const input = { payload: body, signature: sign(now, body), secret, now, ...override };
    await expect(verifyWebhook(input)).rejects.toBeInstanceOf(WebhookVerificationError);
  });

  it('honours a custom tolerance', async () => {
    const input = { payload: body, signature: sign(now - 600, body), secret, now };
    await expect(verifyWebhook(input)).rejects.toThrow(/tolerance/);
    await expect(verifyWebhook({ ...input, toleranceSeconds: 900 })).resolves.toBeTruthy();
  });
});
