import type { BodyOf, Client, Location, PublishableKey, QueryOf, ResponseOf, Schemas } from '../types.js';

import { type CallOptions, Resource, seg } from './base.js';

/** Brands the agency runs campaigns for. */
export class Clients extends Resource {
  create(params: BodyOf<'/v1/clients', 'post'>, options?: CallOptions): Promise<Client> {
    return this.http.request('POST', '/v1/clients', { ...options, body: params });
  }

  retrieve(clientId: string, options?: CallOptions): Promise<Client> {
    return this.http.request('GET', `/v1/clients/${seg(clientId)}`, options);
  }

  list(params: QueryOf<'/v1/clients', 'get'> = {}, options?: CallOptions): Promise<Schemas['ClientList']> {
    return this.http.request('GET', '/v1/clients', { ...options, query: params });
  }

  update(clientId: string, params: BodyOf<'/v1/clients/{client_id}', 'patch'>, options?: CallOptions): Promise<Client> {
    return this.http.request('PATCH', `/v1/clients/${seg(clientId)}`, { ...options, body: params });
  }

  /** Archives the client (a soft delete); its campaigns keep their history. */
  delete(clientId: string, options?: CallOptions): Promise<Client> {
    return this.http.request('DELETE', `/v1/clients/${seg(clientId)}`, options);
  }
}

/** Places where in-store and event prizes are collected. */
export class Locations extends Resource {
  create(params: BodyOf<'/v1/locations', 'post'>, options?: CallOptions): Promise<Location> {
    return this.http.request('POST', '/v1/locations', { ...options, body: params });
  }

  retrieve(locationId: string, options?: CallOptions): Promise<Location> {
    return this.http.request('GET', `/v1/locations/${seg(locationId)}`, options);
  }

  list(params: QueryOf<'/v1/locations', 'get'> = {}, options?: CallOptions): Promise<Schemas['LocationList']> {
    return this.http.request('GET', '/v1/locations', { ...options, query: params });
  }

  update(
    locationId: string,
    params: BodyOf<'/v1/locations/{location_id}', 'patch'>,
    options?: CallOptions
  ): Promise<Location> {
    return this.http.request('PATCH', `/v1/locations/${seg(locationId)}`, { ...options, body: params });
  }

  /** Deactivates the location (a soft delete); past collections keep pointing at it. */
  delete(locationId: string, options?: CallOptions): Promise<Location> {
    return this.http.request('DELETE', `/v1/locations/${seg(locationId)}`, options);
  }
}

/** `pk_…` keys for the browser widget: one campaign, exact origins. */
export class PublishableKeys extends Resource {
  create(
    campaignId: string,
    params: BodyOf<'/v1/campaigns/{campaign_id}/publishable-keys', 'post'>,
    options?: CallOptions
  ): Promise<ResponseOf<'/v1/campaigns/{campaign_id}/publishable-keys', 'post'>> {
    return this.http.request('POST', `/v1/campaigns/${seg(campaignId)}/publishable-keys`, {
      ...options,
      body: params,
    });
  }

  list(
    campaignId: string,
    options?: CallOptions
  ): Promise<ResponseOf<'/v1/campaigns/{campaign_id}/publishable-keys', 'get'>> {
    return this.http.request('GET', `/v1/campaigns/${seg(campaignId)}/publishable-keys`, options);
  }

  update(
    keyId: string,
    params: BodyOf<'/v1/publishable-keys/{key_id}', 'patch'>,
    options?: CallOptions
  ): Promise<PublishableKey> {
    return this.http.request('PATCH', `/v1/publishable-keys/${seg(keyId)}`, { ...options, body: params });
  }

  /** Revokes the key. */
  delete(keyId: string, options?: CallOptions): Promise<PublishableKey> {
    return this.http.request('DELETE', `/v1/publishable-keys/${seg(keyId)}`, options);
  }
}

/** Test helpers for `sk_test_` keys. Production keys get `SANDBOX_ONLY`. */
export class Sandbox extends Resource {
  /** Make the next valid code on this campaign win the given tier. */
  forceWin(
    campaignId: string,
    tier: string,
    options?: CallOptions
  ): Promise<ResponseOf<'/v1/sandbox/campaigns/{campaign_id}/force-win', 'post'>> {
    return this.http.request('POST', `/v1/sandbox/campaigns/${seg(campaignId)}/force-win`, {
      ...options,
      body: { tier },
    });
  }

  /** Unredeem every code and start the campaign over. `reseed` lays out a different schedule. */
  reset(campaignId: string, params: { reseed?: boolean } = {}, options?: CallOptions): Promise<Schemas['Campaign']> {
    return this.http.request('POST', `/v1/sandbox/campaigns/${seg(campaignId)}/reset`, {
      ...options,
      query: { reseed: params.reseed ? 'true' : undefined },
    });
  }
}

export class Diagnostics extends Resource {
  /** How the API sees this request (client IP, forwarded headers). For checking proxy setups. */
  request(options?: CallOptions): Promise<Schemas['RequestDiagnostics']> {
    return this.http.request('GET', '/v1/diagnostics/request', options);
  }
}
