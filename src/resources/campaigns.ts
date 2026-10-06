import type {
  AuditEntry,
  BodyOf,
  Campaign,
  CampaignStats,
  Page,
  QueryOf,
  ResponseOf,
  Schemas,
  Simulation,
  SimulationRequest,
} from '../types.js';

import { type CallOptions, Resource, seg } from './base.js';

export type CampaignCreateParams = BodyOf<'/v1/campaigns', 'post'>;
export type CampaignUpdateParams = BodyOf<'/v1/campaigns/{campaign_id}', 'patch'>;
export type CampaignListParams = QueryOf<'/v1/campaigns', 'get'>;
export type CampaignDuplicateParams = BodyOf<'/v1/campaigns/{campaign_id}/duplicate', 'post'>;
export type RescheduleParams = BodyOf<'/v1/campaigns/{campaign_id}/reschedule', 'post'>;
export type AuditListParams = QueryOf<'/v1/campaigns/{campaign_id}/audit', 'get'>;
export type MessagesPutParams = BodyOf<'/v1/campaigns/{campaign_id}/messages', 'put'>;

class PrizeTiers extends Resource {
  /** Add a prize tier to a campaign, including one already running. */
  create(
    campaignId: string,
    params: BodyOf<'/v1/campaigns/{campaign_id}/prize-tiers', 'post'>,
    options?: CallOptions
  ): Promise<Schemas['PrizeChangeResult']> {
    return this.http.request('POST', `/v1/campaigns/${seg(campaignId)}/prize-tiers`, { ...options, body: params });
  }

  /** Change how many prizes a tier has, until the campaign ends. */
  update(
    campaignId: string,
    tier: string,
    params: BodyOf<'/v1/campaigns/{campaign_id}/prize-tiers/{tier}', 'patch'>,
    options?: CallOptions
  ): Promise<Schemas['PrizeChangeResult']> {
    return this.http.request('PATCH', `/v1/campaigns/${seg(campaignId)}/prize-tiers/${seg(tier)}`, {
      ...options,
      body: params,
    });
  }
}

class Messages extends Resource {
  list(campaignId: string, options?: CallOptions): Promise<Schemas['MessageList']> {
    return this.http.request('GET', `/v1/campaigns/${seg(campaignId)}/messages`, options);
  }

  /** Replace the campaign's result messages. */
  set(campaignId: string, params: MessagesPutParams, options?: CallOptions): Promise<Schemas['MessageList']> {
    return this.http.request('PUT', `/v1/campaigns/${seg(campaignId)}/messages`, { ...options, body: params });
  }

  /** What a consumer would see for each outcome, with fallbacks applied. */
  preview(
    campaignId: string,
    params: QueryOf<'/v1/campaigns/{campaign_id}/messages/preview', 'get'> = {},
    options?: CallOptions
  ): Promise<Schemas['ResolvedMessages']> {
    return this.http.request('GET', `/v1/campaigns/${seg(campaignId)}/messages/preview`, {
      ...options,
      query: params,
    });
  }
}

export class Campaigns extends Resource {
  readonly prizeTiers = new PrizeTiers(this.http);
  readonly messages = new Messages(this.http);

  create(params: CampaignCreateParams, options?: CallOptions): Promise<Campaign> {
    return this.http.request('POST', '/v1/campaigns', { ...options, body: params });
  }

  retrieve(campaignId: string, options?: CallOptions): Promise<Campaign> {
    return this.http.request('GET', `/v1/campaigns/${seg(campaignId)}`, options);
  }

  list(params: CampaignListParams = {}, options?: CallOptions): Promise<Schemas['CampaignList']> {
    return this.http.request('GET', '/v1/campaigns', { ...options, query: params });
  }

  update(campaignId: string, params: CampaignUpdateParams, options?: CallOptions): Promise<Campaign> {
    return this.http.request('PATCH', `/v1/campaigns/${seg(campaignId)}`, { ...options, body: params });
  }

  /** Go live: lays out the winning moments. In production this happens once. */
  activate(campaignId: string, options?: CallOptions): Promise<Campaign> {
    return this.http.request('POST', `/v1/campaigns/${seg(campaignId)}/activate`, options);
  }

  pause(campaignId: string, options?: CallOptions): Promise<Campaign> {
    return this.http.request('POST', `/v1/campaigns/${seg(campaignId)}/pause`, options);
  }

  resume(campaignId: string, options?: CallOptions): Promise<Campaign> {
    return this.http.request('POST', `/v1/campaigns/${seg(campaignId)}/resume`, options);
  }

  complete(campaignId: string, options?: CallOptions): Promise<Campaign> {
    return this.http.request('POST', `/v1/campaigns/${seg(campaignId)}/complete`, options);
  }

  /** Copy a campaign's setup (never its codes, redemptions or claims) into a new draft. */
  duplicate(campaignId: string, params: CampaignDuplicateParams = {}, options?: CallOptions): Promise<Campaign> {
    return this.http.request('POST', `/v1/campaigns/${seg(campaignId)}/duplicate`, { ...options, body: params });
  }

  stats(campaignId: string, options?: CallOptions): Promise<CampaignStats> {
    return this.http.request('GET', `/v1/campaigns/${seg(campaignId)}/stats`, options);
  }

  /** How prizes would fall for an expected number of entries. Read-only; never reveals the real schedule. */
  simulate(campaignId: string, params: SimulationRequest, options?: CallOptions): Promise<Simulation> {
    return this.http.request('POST', `/v1/campaigns/${seg(campaignId)}/simulate`, { ...options, body: params });
  }

  /** Change the dates of an activated campaign. Production campaigns need a `reason`. */
  reschedule(
    campaignId: string,
    params: RescheduleParams,
    options?: CallOptions
  ): Promise<ResponseOf<'/v1/campaigns/{campaign_id}/reschedule', 'post'>> {
    return this.http.request('POST', `/v1/campaigns/${seg(campaignId)}/reschedule`, { ...options, body: params });
  }

  /** The change log: reschedules and prize changes. */
  changes(
    campaignId: string,
    options?: CallOptions
  ): Promise<ResponseOf<'/v1/campaigns/{campaign_id}/changes', 'get'>> {
    return this.http.request('GET', `/v1/campaigns/${seg(campaignId)}/changes`, options);
  }

  /** Every entry attempt, including refused ones, newest first. */
  audit(campaignId: string, params: AuditListParams = {}, options?: CallOptions): Promise<Page<AuditEntry>> {
    return this.http.request('GET', `/v1/campaigns/${seg(campaignId)}/audit`, { ...options, query: params });
  }

  iterateAudit(
    campaignId: string,
    params: Omit<AuditListParams, 'cursor'> = {},
    options?: CallOptions
  ): AsyncGenerator<AuditEntry> {
    return this.paginate((q) => this.audit(campaignId, q, options), params as AuditListParams);
  }
}
