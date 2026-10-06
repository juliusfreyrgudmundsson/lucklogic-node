// End-to-end against a real API with a sandbox key. Not part of `npm test`:
//   LUCKLOGIC_LIVE=1 LUCKLOGIC_API_KEY=sk_test_… LUCKLOGIC_BASE_URL=http://localhost:3000 npm run test:live
// The API must run its worker (code generation, webhook delivery) and reach its object storage.
import { createServer } from 'node:http';
import type { AddressInfo } from 'node:net';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { LuckLogic, type WebhookEvent, isLuckLogicError, verifyWebhook } from '../../src/index.js';

const luck = new LuckLogic({ timeoutMs: 15_000 });
const DAY = 86_400_000;
let campaignId = '';
let codes: string[] = [];

describe.skipIf(luck.mode !== 'sandbox')('live sandbox round trip', () => {
  beforeAll(async () => {
    const campaign = await luck.campaigns.create({
      name: `SDK live test ${new Date().toISOString()}`,
      starts_at: new Date(Date.now() - 60_000).toISOString(),
      ends_at: new Date(Date.now() + 30 * DAY).toISOString(),
      timezone: 'Europe/London',
      prize_tiers: [
        { tier: 'main', name: 'PlayStation 5', quantity: 1, distribution: 'late_stage' },
        { tier: 'shirt', name: 'T-shirt', quantity: 20, distribution: 'even' },
      ],
    });
    campaignId = campaign.id;
    expect(campaign.status).toBe('draft');

    const accepted = await luck.codes.generate(campaignId, { volume: 5 });
    const job = await luck.jobs.waitUntilReady(accepted.job_id, { intervalMs: 500, timeoutMs: 60_000 });
    const csv = await (await fetch(job.download_url as string)).text();
    const [header, ...rows] = csv.trim().split(/\r?\n/);
    const col = Math.max(0, header.split(',').indexOf('code'));
    codes = rows.map((r) => r.split(',')[col]);
    expect(codes).toHaveLength(5);

    expect((await luck.campaigns.activate(campaignId)).status).toBe('active');
  }, 90_000);

  afterAll(async () => {
    if (campaignId) await luck.campaigns.complete(campaignId).catch(() => undefined);
  });

  it('simulates without touching the campaign', async () => {
    const sim = await luck.campaigns.simulate(campaignId, { entries: 10_000, pattern: 'steady', runs: 3 });
    expect(sim.summary.prizes).toBe(21);
    expect(sim.tiers.map((t) => t.tier)).toEqual(['main', 'shirt']);
  });

  it('redeems a forced win, replays the same idempotency key, and refuses a reused code', async () => {
    await luck.sandbox.forceWin(campaignId, 'main');
    const params = { campaign_id: campaignId, code: codes[0], participant_id: 'sdk_live_1' };
    const won = await luck.redemptions.create(params, { idempotencyKey: `sdk-live-${campaignId}` });
    expect(won.outcome).toBe('win');
    expect(won.prize?.tier).toBe('main');

    const replay = await luck.redemptions.create(params, { idempotencyKey: `sdk-live-${campaignId}` });
    expect(replay.id).toBe(won.id);

    const err = await luck.redemptions.create(params).catch((e: unknown) => e);
    expect(isLuckLogicError(err, 'CODE_ALREADY_REDEEMED')).toBe(true);

    const claim = await luck.claims.retrieve(won.claim_token as string);
    expect(claim.status).toBeTruthy();
    expect((await luck.claims.events(won.claim_token as string)).data.length).toBeGreaterThan(0);
  });

  it('reports unknown codes with a typed error', async () => {
    const err = await luck.redemptions
      .create({ campaign_id: campaignId, code: 'ACDEFGHJKLMN', participant_id: 'sdk_live_2' })
      .catch((e: unknown) => e);
    expect(isLuckLogicError(err, 'CODE_NOT_FOUND')).toBe(true);
  });

  it('pages through redemptions and reads stats', async () => {
    for (const [i, code] of codes.slice(1, 4).entries()) {
      await luck.redemptions.create({ campaign_id: campaignId, code, participant_id: `sdk_live_p${i}` });
    }
    const seen: string[] = [];
    for await (const r of luck.redemptions.iterate({ campaign_id: campaignId, limit: 2 })) seen.push(r.id);
    expect(seen).toHaveLength(4);
    expect(new Set(seen).size).toBe(4);
    const stats = await luck.campaigns.stats(campaignId);
    expect(JSON.stringify(stats)).toContain('4');
  });

  it('receives a signed test webhook and verifies it', async () => {
    let resolveEvent: (e: WebhookEvent) => void = () => undefined;
    const received = new Promise<WebhookEvent>((r) => (resolveEvent = r));
    let secret = '';
    const server = createServer((req, res) => {
      const chunks: Buffer[] = [];
      req.on('data', (c: Buffer) => chunks.push(c));
      req.on('end', () => {
        verifyWebhook({
          payload: Buffer.concat(chunks),
          signature: req.headers['x-lucklogic-signature'] as string,
          secret,
        })
          .then((event) => {
            res.writeHead(200).end();
            resolveEvent(event);
          })
          .catch(() => res.writeHead(400).end());
      });
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    try {
      const { port } = server.address() as AddressInfo;
      const hook = await luck.webhooks.create({ url: `http://localhost:${port}/hook`, description: 'sdk live test' });
      secret = hook.secret;
      try {
        await luck.webhooks.test(hook.id);
        const event = await Promise.race([
          received,
          new Promise<never>((_, reject) => setTimeout(() => reject(new Error('no delivery in 20 s')), 20_000)),
        ]);
        expect(event).toMatchObject({ event: 'webhook.test', data: { webhook_id: hook.id } });
      } finally {
        await luck.webhooks.delete(hook.id);
      }
    } finally {
      server.close();
    }
  }, 30_000);
});
