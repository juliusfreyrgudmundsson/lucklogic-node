import { Transport } from './core.js';
import { Campaigns } from './resources/campaigns.js';
import { Claims } from './resources/claims.js';
import { Codes, Jobs } from './resources/codes.js';
import { Redemptions } from './resources/redemptions.js';
import { Clients, Diagnostics, Locations, PublishableKeys, Sandbox } from './resources/setup.js';
import { Webhooks } from './resources/webhooks.js';

export type LuckLogicOptions = {
  /** `sk_test_…` (sandbox) or `sk_live_…` (production). Defaults to the LUCKLOGIC_API_KEY environment variable. */
  apiKey?: string;
  /** Defaults to https://api.lucklogic.dev, or LUCKLOGIC_BASE_URL when set. */
  baseUrl?: string;
  /** Per attempt. Default 30 seconds. */
  timeoutMs?: number;
  /** Automatic retries for failures that are safe to repeat. Default 2. */
  maxRetries?: number;
  /** A custom fetch, e.g. for a proxy agent or tests. */
  fetch?: typeof fetch;
};

const env = (name: string): string | undefined =>
  (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.[name];

/**
 * The LuckLogic API client. Server-side only: it holds a secret key.
 *
 * ```ts
 * const luck = new LuckLogic({ apiKey: process.env.LUCKLOGIC_API_KEY });
 * const result = await luck.redemptions.create({ campaign_id, code, participant_id });
 * ```
 */
export class LuckLogic {
  /** `sandbox` for `sk_test_` keys, `production` for `sk_live_`. */
  readonly mode: 'sandbox' | 'production';

  readonly redemptions: Redemptions;
  readonly campaigns: Campaigns;
  readonly codes: Codes;
  readonly jobs: Jobs;
  readonly claims: Claims;
  readonly clients: Clients;
  readonly locations: Locations;
  readonly publishableKeys: PublishableKeys;
  readonly webhooks: Webhooks;
  readonly sandbox: Sandbox;
  readonly diagnostics: Diagnostics;

  constructor(options: LuckLogicOptions = {}) {
    const apiKey = options.apiKey ?? env('LUCKLOGIC_API_KEY');
    if (!apiKey) {
      throw new Error('LuckLogic: no API key. Pass { apiKey } or set LUCKLOGIC_API_KEY.');
    }
    if (apiKey.startsWith('pk_')) {
      throw new Error(
        'LuckLogic: pk_ keys are publishable keys for the browser widget. This client needs a secret sk_test_ or sk_live_ key.'
      );
    }
    if (!/^sk_(test|live)_/.test(apiKey)) {
      throw new Error('LuckLogic: API keys start with sk_test_ or sk_live_.');
    }
    this.mode = apiKey.startsWith('sk_live_') ? 'production' : 'sandbox';

    const fetchImpl = options.fetch ?? globalThis.fetch;
    if (!fetchImpl) throw new Error('LuckLogic: no fetch available. Use Node 20+ or pass { fetch }.');
    const http = new Transport({
      apiKey,
      baseUrl: (options.baseUrl ?? env('LUCKLOGIC_BASE_URL') ?? 'https://api.lucklogic.dev').replace(/\/+$/, ''),
      timeoutMs: options.timeoutMs ?? 30_000,
      maxRetries: options.maxRetries ?? 2,
      fetch: fetchImpl.bind(globalThis),
    });

    this.redemptions = new Redemptions(http);
    this.campaigns = new Campaigns(http);
    this.codes = new Codes(http);
    this.jobs = new Jobs(http);
    this.claims = new Claims(http);
    this.clients = new Clients(http);
    this.locations = new Locations(http);
    this.publishableKeys = new PublishableKeys(http);
    this.webhooks = new Webhooks(http);
    this.sandbox = new Sandbox(http);
    this.diagnostics = new Diagnostics(http);
  }
}
