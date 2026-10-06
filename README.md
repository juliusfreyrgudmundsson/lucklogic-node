# @lucklogic/node

The official Node.js client for the [LuckLogic API](https://lucklogic.dev/docs): redeem on-pack codes, run
campaigns, fulfil prizes and verify webhooks, with types generated from the API's OpenAPI document.

- No dependencies. Uses the platform's `fetch` and Web Crypto.
- Retries what is safe to retry, and nothing else. A redemption is never processed twice.
- ESM and CommonJS, with TypeScript types for every request and response.

Requires Node.js 20 or later. Server-side only: it holds a secret API key.

```sh
npm install @lucklogic/node
```

## Redeem a code

```ts
import { LuckLogic, isLuckLogicError } from '@lucklogic/node';

const luck = new LuckLogic({ apiKey: process.env.LUCKLOGIC_API_KEY });

try {
  const result = await luck.redemptions.create({
    campaign_id: 'camp_8f92a3b1c4d54e6f9a0b1c2d3e4f5a6b',
    code: 'KM7X9-P2QWR', // as the consumer typed or scanned it
    participant_id: 'crm_12345', // your own identifier; never a name or email
  });

  if (result.outcome === 'win') {
    console.log(`Won ${result.prize?.name}; claim token ${result.claim_token}`);
  }
} catch (err) {
  if (isLuckLogicError(err, 'CODE_ALREADY_REDEEMED')) {
    // Show "this code has already been used".
  } else {
    throw err;
  }
}
```

`sk_test_` keys work on sandbox campaigns and `sk_live_` keys on production campaigns. `luck.mode` tells you which
one you have. Without `apiKey`, the client reads `LUCKLOGIC_API_KEY`.

## Errors

Every refusal from the API is a `LuckLogicError` with a stable `code`, the HTTP `status`, the `message`, any
`details`, the `requestId` to quote to support, and `retryAfter` in seconds when the API sent one. Match on `code`:

| Code                    | Status | Meaning                                              |
| ----------------------- | ------ | ---------------------------------------------------- |
| `CODE_NOT_FOUND`        | 404    | No such code in this campaign                        |
| `CODE_ALREADY_REDEEMED` | 400    | The code has been used                               |
| `CAMPAIGN_NOT_ACTIVE`   | 403    | Before the start, after the end, or paused           |
| `RATE_LIMIT_EXCEEDED`   | 429    | This participant reached the campaign's entry limit  |
| `VALIDATION_ERROR`      | 400    | The request is malformed; `details` lists the fields |
| `UNAUTHORIZED`          | 401    | Missing, wrong or revoked API key                    |
| `SANDBOX_ONLY`          | 403    | A sandbox helper was called with a production key    |

No answer at all (DNS, a refused connection, a timeout) is a `LuckLogicConnectionError`; `timedOut` says which.

## Retries and idempotency

The client retries a call only when repeating it cannot do anything twice:

- **Redemptions** carry an `Idempotency-Key` on every call, reused across retries, so a timeout or a dropped
  connection never redeems a code twice. Pass your own key when you retry from somewhere else, such as a job queue:
  `luck.redemptions.create(params, { idempotencyKey: order.id })`.
- **Reads** (`GET`) and replacements (`PUT`, `DELETE`) are retried after connection errors and 5xx answers.
- **Other writes**, such as activating a campaign or generating codes, are not retried after a connection error or a
  5xx, because the API may already have acted. You get the error and decide.
- **Any call** refused by your key's request throttle (`API_RATE_LIMIT_EXCEEDED`) is retried after `Retry-After`.
- A participant's entry limit (`RATE_LIMIT_EXCEEDED`) is an answer, not a fault, and is never retried.

Defaults are 2 retries and a 30-second timeout per attempt. Change them on the client or per call:

```ts
const luck = new LuckLogic({ maxRetries: 4, timeoutMs: 10_000 });
await luck.campaigns.stats(campaignId, { timeoutMs: 60_000, signal: AbortSignal.timeout(90_000) });
```

## Webhooks

Register an endpoint once and keep its secret; it is shown only at creation:

```ts
const hook = await luck.webhooks.create({ url: 'https://example.com/webhooks/lucklogic' });
// Store hook.secret (whsec_…) in your secrets manager.
```

Verify every delivery against the **raw** request body before trusting it. `verifyWebhook` checks the
`X-LuckLogic-Signature` header, rejects anything older than five minutes, and returns the typed event:

```ts
// Next.js route handler: app/api/webhooks/lucklogic/route.ts
import { WebhookVerificationError, verifyWebhook } from '@lucklogic/node';

export async function POST(request: Request) {
  try {
    const event = await verifyWebhook({
      payload: await request.text(),
      signature: request.headers.get('x-lucklogic-signature'),
      secret: process.env.LUCKLOGIC_WEBHOOK_SECRET!,
    });
    if (event.event === 'prize.claimed') {
      // event.data.claim_token, event.data.prize_tier, event.data.participant_id …
    }
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof WebhookVerificationError) return new Response('Bad signature', { status: 400 });
    throw err;
  }
}
```

```ts
// Express: keep the body raw for this route.
app.post('/webhooks/lucklogic', express.raw({ type: 'application/json' }), async (req, res) => {
  const event = await verifyWebhook({
    payload: req.body, // a Buffer
    signature: req.get('x-lucklogic-signature'),
    secret: process.env.LUCKLOGIC_WEBHOOK_SECRET!,
  }).catch(() => null);
  if (!event) return res.sendStatus(400);
  res.sendStatus(204);
});
```

Events: `prize.claimed` (a code won), `claim.updated` (a claim changed status) and `webhook.test` (from
`luck.webhooks.test(id)`). Deliveries that fail are retried for about 15 hours; `luck.webhooks.deliveries(id)` shows
each attempt and `luck.webhooks.retryDelivery(id, deliveryId)` sends one again.

## Campaigns and codes

```ts
const campaign = await luck.campaigns.create({
  name: 'Summer 2027',
  starts_at: '2027-06-01T00:00:00Z',
  ends_at: '2027-08-31T23:59:59Z',
  timezone: 'Europe/London',
  prize_tiers: [
    { tier: 'main', name: 'PlayStation 5', quantity: 5, distribution: 'late_stage' },
    { tier: 'secondary', name: 'T-shirt', quantity: 1000, distribution: 'even' },
  ],
});

// How would prizes fall with 400,000 entries, busiest at launch? Read-only.
const sim = await luck.campaigns.simulate(campaign.id, { entries: 400_000, pattern: 'front_loaded' });

// Printable codes are generated in the background.
const { job_id } = await luck.codes.generate(campaign.id, { volume: 250_000 });
const job = await luck.jobs.waitUntilReady(job_id);
console.log(job.download_url); // presigned CSV for the printer

await luck.campaigns.activate(campaign.id);
```

## Lists

List methods return one page, `{ data, next_cursor }`. The `iterate` methods walk every page for you:

```ts
for await (const redemption of luck.redemptions.iterate({ campaign_id: campaign.id, outcome: 'win' })) {
  console.log(redemption.participant_id, redemption.prize?.tier);
}
```

## Prize claims

```ts
const claim = await luck.claims.retrieve(claimToken);
await luck.claims.update(claimToken, { status: 'approved' });
await luck.claims.update(claimToken, { status: 'fulfilled', note: 'Shipped 2027-07-02' });
```

## Sandbox helpers

With an `sk_test_` key:

```ts
await luck.sandbox.forceWin(campaign.id, 'main'); // the next valid code wins this tier
await luck.sandbox.reset(campaign.id); // unredeem every code and start over
```

## Everything else

`luck.clients`, `luck.locations`, `luck.publishableKeys`, `luck.campaigns.prizeTiers`, `luck.campaigns.messages`,
`luck.campaigns.reschedule`, `luck.campaigns.audit` and `luck.diagnostics` cover the rest of the API. Each method
mirrors one endpoint in the [API reference](https://api.lucklogic.dev/v1/docs), with the same field names.

Every request and response type is exported: `Campaign`, `Redemption`, `Claim`, `Job` and so on, plus `Schemas` for
any schema by name.

## Development

```sh
npm install
npm run generate   # refresh src/generated/api.ts from the API (OPENAPI_URL overrides the source)
npm test           # unit tests, no network
LUCKLOGIC_LIVE=1 LUCKLOGIC_API_KEY=sk_test_… LUCKLOGIC_BASE_URL=http://localhost:3000 npm run test:live
npm run build
```

The live suite needs an API that runs its worker and reaches its object storage. It creates a sandbox campaign,
generates and downloads codes, redeems them and receives a signed webhook.

## License

MIT
