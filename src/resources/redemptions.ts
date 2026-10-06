import type { BodyOf, Page, QueryOf, Redemption } from '../types.js';

import { type CallOptions, Resource, seg } from './base.js';

export type RedeemParams = BodyOf<'/v1/redemptions', 'post'>;
export type RedemptionListParams = QueryOf<'/v1/redemptions', 'get'>;

export class Redemptions extends Resource {
  /**
   * Redeem a code: consumes it, decides the outcome and returns it.
   *
   * Safe to retry: every call carries an `Idempotency-Key` (a fresh UUID unless you pass your own),
   * reused across the client's automatic retries, so a timeout never redeems a code twice.
   * Pass your own key when you retry across processes, e.g. from a job queue.
   *
   * Throws LuckLogicError with code `CODE_NOT_FOUND`, `CODE_ALREADY_REDEEMED`, `CAMPAIGN_NOT_ACTIVE`,
   * `RATE_LIMIT_EXCEEDED` (the participant's entry limit) or `VALIDATION_ERROR` for the expected refusals.
   */
  create(params: RedeemParams, options: CallOptions & { idempotencyKey?: string } = {}): Promise<Redemption> {
    return this.http.request('POST', '/v1/redemptions', {
      ...options,
      body: params,
      idempotencyKey: options.idempotencyKey ?? crypto.randomUUID(),
    });
  }

  retrieve(redemptionId: string, options?: CallOptions): Promise<Redemption> {
    return this.http.request('GET', `/v1/redemptions/${seg(redemptionId)}`, options);
  }

  /** One page of a campaign's redemptions, newest first. */
  list(params: RedemptionListParams, options?: CallOptions): Promise<Page<Redemption>> {
    return this.http.request('GET', '/v1/redemptions', { ...options, query: params });
  }

  /** Every redemption matching the filter: `for await (const r of luck.redemptions.iterate({ campaign_id }))`. */
  iterate(params: Omit<RedemptionListParams, 'cursor'>, options?: CallOptions): AsyncGenerator<Redemption> {
    return this.paginate((q) => this.list(q, options), params as RedemptionListParams);
  }
}
