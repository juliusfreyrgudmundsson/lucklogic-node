import type { BodyOf, Claim, ClaimEvent, Page, QueryOf } from '../types.js';

import { type CallOptions, Resource, seg } from './base.js';

export type ClaimListParams = QueryOf<'/v1/claims', 'get'>;
export type ClaimUpdateParams = BodyOf<'/v1/claims/{claim_token}', 'patch'>;
export type ClaimCollectParams = BodyOf<'/v1/claims/{claim_token}/collect', 'post'>;
export type ClaimReopenParams = BodyOf<'/v1/claims/{claim_token}/reopen', 'post'>;

/** Prize claims, keyed by the `claim_token` a winning redemption returns. */
export class Claims extends Resource {
  retrieve(claimToken: string, options?: CallOptions): Promise<Claim> {
    return this.http.request('GET', `/v1/claims/${seg(claimToken)}`, options);
  }

  list(params: ClaimListParams = {}, options?: CallOptions): Promise<Page<Claim>> {
    return this.http.request('GET', '/v1/claims', { ...options, query: params });
  }

  iterate(params: Omit<ClaimListParams, 'cursor'> = {}, options?: CallOptions): AsyncGenerator<Claim> {
    return this.paginate((q) => this.list(q, options), params as ClaimListParams);
  }

  /** Approve, reject or fulfil a claim, or add a note. */
  update(claimToken: string, params: ClaimUpdateParams, options?: CallOptions): Promise<Claim> {
    return this.http.request('PATCH', `/v1/claims/${seg(claimToken)}`, { ...options, body: params });
  }

  /** Record an in-store or event prize as handed over. */
  collect(claimToken: string, params: ClaimCollectParams, options?: CallOptions): Promise<Claim> {
    return this.http.request('POST', `/v1/claims/${seg(claimToken)}/collect`, { ...options, body: params });
  }

  /** Undo a rejection or expiry. */
  reopen(claimToken: string, params: ClaimReopenParams = {}, options?: CallOptions): Promise<Claim> {
    return this.http.request('POST', `/v1/claims/${seg(claimToken)}/reopen`, { ...options, body: params });
  }

  /** The claim's full history, oldest first. */
  events(claimToken: string, options?: CallOptions): Promise<{ data: ClaimEvent[] }> {
    return this.http.request('GET', `/v1/claims/${seg(claimToken)}/events`, options);
  }
}
