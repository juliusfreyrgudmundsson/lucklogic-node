import type { components, paths } from './generated/api.js';

/** Every schema in the API's OpenAPI document, by name. */
export type Schemas = components['schemas'];

type Method = 'get' | 'post' | 'put' | 'patch' | 'delete';
type Op<P extends keyof paths, M extends Method> = NonNullable<paths[P][M]>;
type JsonOf<C> = C extends { content: { 'application/json': infer B } } ? B : never;
type SuccessOf<R> = R extends Record<infer K, unknown> ? (K extends 200 | 201 | 202 ? R[K] : never) : never;

/** JSON body of an operation. */
export type BodyOf<P extends keyof paths, M extends Method> =
  Op<P, M> extends { requestBody?: infer R } ? JsonOf<NonNullable<R>> : never;
/** Query parameters of an operation. */
export type QueryOf<P extends keyof paths, M extends Method> =
  Op<P, M> extends { parameters: { query?: infer Q } } ? NonNullable<Q> : never;
/** JSON body of the success response of an operation. */
export type ResponseOf<P extends keyof paths, M extends Method> =
  Op<P, M> extends { responses: infer R } ? JsonOf<SuccessOf<R>> : never;

export type Campaign = Schemas['Campaign'];
export type CampaignStats = Schemas['CampaignStats'];
export type CampaignChange = Schemas['CampaignChange'];
export type Claim = Schemas['Claim'];
export type ClaimEvent = Schemas['ClaimEvent'];
export type ClaimStatus = Claim['status'];
export type Client = Schemas['Client'];
export type Job = Schemas['Job'];
export type JobAccepted = Schemas['JobAccepted'];
export type Location = Schemas['Location'];
export type Message = Schemas['Message'];
export type PublishableKey = Schemas['PublishableKey'];
export type Redemption = Schemas['Redemption'];
export type RedeemRequest = Schemas['RedeemRequest'];
export type Simulation = Schemas['Simulation'];
export type SimulationRequest = Schemas['SimulationRequest'];
export type Webhook = Schemas['Webhook'];
export type WebhookCreated = Schemas['WebhookCreated'];
export type WebhookDelivery = Schemas['WebhookDelivery'];
export type AuditEntry = Schemas['AuditEntry'];

/** One page of a cursor-paginated list. Pass `next_cursor` as `cursor` to get the next page. */
export type Page<T> = { data: T[]; next_cursor: string | null };
