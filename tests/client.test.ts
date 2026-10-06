import { describe, expect, expectTypeOf, it } from 'vitest';

import {
  LuckLogic,
  LuckLogicConnectionError,
  LuckLogicError,
  type Redemption,
  type ResponseOf,
  isLuckLogicError,
} from '../src/index.js';

type Call = { url: URL; init: RequestInit; headers: Record<string, string> };
type Reply = Response | Error | ((call: Call) => Response | Promise<Response>);

/** A fetch that answers from a script and records every call. */
function fakeFetch(...replies: Reply[]) {
  const calls: Call[] = [];
  const fn = async (input: URL | RequestInfo, init: RequestInit = {}) => {
    const call = { url: new URL(String(input)), init, headers: init.headers as Record<string, string> };
    calls.push(call);
    const reply = replies.shift();
    if (!reply) throw new Error('fakeFetch: no reply scripted');
    if (reply instanceof Error) throw reply;
    return typeof reply === 'function' ? reply(call) : reply;
  };
  return { fetch: fn as typeof fetch, calls };
}

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json', ...headers } });
const apiError = (status: number, code: string, headers: Record<string, string> = {}) =>
  json(status, { error: { code, message: `${code} happened` } }, headers);

const redemption: Redemption = {
  id: 'rdm_1',
  campaign_id: 'camp_1',
  outcome: 'win',
  prize: { tier: 'main', name: 'PlayStation 5' },
  claim_token: 'clm_1',
  participant_id: 'crm_1',
  redeemed_at: '2026-10-06T12:00:00.000Z',
} as Redemption;

function client(...replies: Reply[]) {
  const f = fakeFetch(...replies);
  const luck = new LuckLogic({ apiKey: 'sk_test_abc', baseUrl: 'https://api.test/', fetch: f.fetch, maxRetries: 2 });
  return { luck, calls: f.calls };
}

describe('construction', () => {
  it('needs a secret key and knows its mode', () => {
    expect(() => new LuckLogic({ apiKey: '' })).toThrow(/no API key/);
    expect(() => new LuckLogic({ apiKey: 'pk_live_x' })).toThrow(/publishable keys/);
    expect(() => new LuckLogic({ apiKey: 'nope' })).toThrow(/sk_test_ or sk_live_/);
    expect(new LuckLogic({ apiKey: 'sk_test_x' }).mode).toBe('sandbox');
    expect(new LuckLogic({ apiKey: 'sk_live_x' }).mode).toBe('production');
  });
});

describe('requests', () => {
  it('sends the key, a user agent, JSON and an idempotency key on redemptions', async () => {
    const { luck, calls } = client(json(201, redemption));
    const r = await luck.redemptions.create({ campaign_id: 'camp_1', code: 'KM7X9-P2QWR', participant_id: 'crm_1' });
    expect(r.outcome).toBe('win');
    const [c] = calls;
    expect(c.url.href).toBe('https://api.test/v1/redemptions');
    expect(c.init.method).toBe('POST');
    expect(c.headers.authorization).toBe('Bearer sk_test_abc');
    expect(c.headers['user-agent']).toMatch(/^lucklogic-node\//);
    expect(c.headers['idempotency-key']).toMatch(/^[0-9a-f-]{36}$/);
    expect(JSON.parse(String(c.init.body))).toEqual({
      campaign_id: 'camp_1',
      code: 'KM7X9-P2QWR',
      participant_id: 'crm_1',
    });
  });

  it('uses a caller-supplied idempotency key', async () => {
    const { luck, calls } = client(json(201, redemption));
    await luck.redemptions.create({ campaign_id: 'c', code: 'x', participant_id: 'p' }, { idempotencyKey: 'order-42' });
    expect(calls[0].headers['idempotency-key']).toBe('order-42');
  });

  it('encodes path segments and drops empty query values', async () => {
    const { luck, calls } = client(json(200, { data: [], next_cursor: null }));
    await luck.claims.list({ campaign_id: 'camp_1', status: 'pending', cursor: undefined });
    expect(calls[0].url.search).toBe('?campaign_id=camp_1&status=pending');
    const { luck: l2, calls: c2 } = client(json(200, {}));
    await l2.claims.retrieve('clm_1/../../admin');
    expect(c2[0].url.pathname).toBe('/v1/claims/clm_1%2F..%2F..%2Fadmin');
  });

  it('returns undefined for 204', async () => {
    const { luck } = client(new Response(null, { status: 204 }));
    await expect(luck.webhooks.delete('whk_1')).resolves.toBeUndefined();
  });

  it('sends force-win and reset the way the sandbox routes expect', async () => {
    const { luck, calls } = client(json(200, { tier: 'main', moments_added: 1 }), json(200, {}));
    await luck.sandbox.forceWin('camp_1', 'main');
    await luck.sandbox.reset('camp_1', { reseed: true });
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ tier: 'main' });
    expect(calls[1].url.search).toBe('?reseed=true');
  });
});

describe('errors', () => {
  it('turns the error envelope into LuckLogicError', async () => {
    const { luck } = client(
      json(
        400,
        { error: { code: 'CODE_ALREADY_REDEEMED', message: 'This code has already been used' } },
        { 'x-request-id': 'req_9' }
      )
    );
    const err = await luck.redemptions
      .create({ campaign_id: 'c', code: 'x', participant_id: 'p' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LuckLogicError);
    expect(isLuckLogicError(err, 'CODE_ALREADY_REDEEMED')).toBe(true);
    expect(err).toMatchObject({ status: 400, requestId: 'req_9', message: 'This code has already been used' });
  });

  it('copes with a non-JSON error from a proxy', async () => {
    const { luck } = client(new Response('<html>Bad gateway</html>', { status: 502, statusText: 'Bad Gateway' }));
    const err = await luck.campaigns.create({} as never).catch((e: unknown) => e);
    expect(err).toMatchObject({ status: 502, code: 'INTERNAL_SERVER_ERROR' });
  });
});

describe('retries', () => {
  it('retries reads on 5xx and connection errors', async () => {
    const { luck, calls } = client(apiError(503, 'RETRY_LATER'), new TypeError('fetch failed'), json(200, redemption));
    await expect(luck.redemptions.retrieve('rdm_1')).resolves.toMatchObject({ id: 'rdm_1' });
    expect(calls).toHaveLength(3);
  });

  it('retries a redemption with the same idempotency key', async () => {
    const { luck, calls } = client(new TypeError('socket hang up'), apiError(502, 'BAD'), json(201, redemption));
    await luck.redemptions.create({ campaign_id: 'c', code: 'x', participant_id: 'p' });
    expect(calls).toHaveLength(3);
    expect(new Set(calls.map((c) => c.headers['idempotency-key'])).size).toBe(1);
  });

  it('never repeats other writes after a fault, since the API may have acted', async () => {
    const { luck, calls } = client(apiError(503, 'RETRY_LATER'));
    await expect(luck.campaigns.activate('camp_1')).rejects.toMatchObject({ code: 'RETRY_LATER' });
    expect(calls).toHaveLength(1);

    const second = client(new TypeError('socket hang up'));
    const err = await second.luck.codes.generate('camp_1', { volume: 10 }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LuckLogicConnectionError);
    expect(second.calls).toHaveLength(1);
  });

  it('retries any request the key throttle refused, honouring Retry-After', async () => {
    const { luck, calls } = client(
      apiError(429, 'API_RATE_LIMIT_EXCEEDED', { 'retry-after': '0' }),
      json(200, { status: 'active' })
    );
    await luck.campaigns.activate('camp_1');
    expect(calls).toHaveLength(2);
  });

  it('does not retry a participant hitting their entry limit', async () => {
    const { luck, calls } = client(apiError(429, 'RATE_LIMIT_EXCEEDED', { 'retry-after': '3600' }));
    const err = await luck.redemptions
      .create({ campaign_id: 'c', code: 'x', participant_id: 'p' })
      .catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'RATE_LIMIT_EXCEEDED', retryAfter: 3600 });
    expect(calls).toHaveLength(1);
  });

  it('waits on REQUEST_IN_PROGRESS and asks again', async () => {
    const { luck, calls } = client(apiError(409, 'REQUEST_IN_PROGRESS', { 'retry-after': '0' }), json(201, redemption));
    await luck.redemptions.create({ campaign_id: 'c', code: 'x', participant_id: 'p' });
    expect(calls).toHaveLength(2);
  });

  it('gives up after maxRetries', async () => {
    const { luck, calls } = client(apiError(503, 'A'), apiError(503, 'B'), apiError(503, 'C'));
    await expect(luck.campaigns.retrieve('camp_1')).rejects.toMatchObject({ code: 'C' });
    expect(calls).toHaveLength(3);
  });

  it('reports a timeout as a connection error', async () => {
    const hang = (call: Call) =>
      new Promise<Response>((_, reject) =>
        call.init.signal?.addEventListener('abort', () => reject(call.init.signal?.reason))
      );
    const f = fakeFetch(hang);
    const luck = new LuckLogic({ apiKey: 'sk_test_x', fetch: f.fetch, timeoutMs: 20, maxRetries: 0 });
    const err = await luck.campaigns.activate('camp_1').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LuckLogicConnectionError);
    expect((err as LuckLogicConnectionError).timedOut).toBe(true);
  });
});

describe('pagination and jobs', () => {
  it('iterates across pages', async () => {
    const { luck, calls } = client(
      json(200, { data: [{ id: 'a' }, { id: 'b' }], next_cursor: 'cur_2' }),
      json(200, { data: [{ id: 'c' }], next_cursor: null })
    );
    const ids: string[] = [];
    for await (const r of luck.redemptions.iterate({ campaign_id: 'camp_1', limit: 2 })) ids.push(r.id);
    expect(ids).toEqual(['a', 'b', 'c']);
    expect(calls[1].url.searchParams.get('cursor')).toBe('cur_2');
    expect(calls[1].url.searchParams.get('limit')).toBe('2');
  });

  it('waits for a code batch to be ready', async () => {
    const { luck, calls } = client(
      json(200, { id: 'job_1', status: 'generating' }),
      json(200, { id: 'job_1', status: 'ready', download_url: 'https://dl' })
    );
    const job = await luck.jobs.waitUntilReady('job_1', { intervalMs: 1 });
    expect(job).toMatchObject({ status: 'ready', download_url: 'https://dl' });
    expect(calls).toHaveLength(2);

    const failed = client(json(200, { id: 'job_2', status: 'failed' }));
    await expect(failed.luck.jobs.waitUntilReady('job_2', { intervalMs: 1 })).rejects.toThrow(/failed/);
  });
});

describe('types follow the OpenAPI document', () => {
  it('resolves every hand-picked response type', () => {
    expectTypeOf<ResponseOf<'/v1/campaigns/{campaign_id}/changes', 'get'>>().not.toBeNever();
    expectTypeOf<ResponseOf<'/v1/campaigns/{campaign_id}/publishable-keys', 'post'>>().not.toBeNever();
    expectTypeOf<ResponseOf<'/v1/sandbox/campaigns/{campaign_id}/force-win', 'post'>>().not.toBeNever();
    expectTypeOf<ResponseOf<'/v1/campaigns/{campaign_id}/reschedule', 'post'>>().not.toBeNever();
    expectTypeOf<Redemption['outcome']>().toEqualTypeOf<'win' | 'lose'>();
  });
});
