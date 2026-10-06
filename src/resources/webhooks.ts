import type { BodyOf, Page, QueryOf, Schemas, Webhook, WebhookCreated, WebhookDelivery } from '../types.js';
import { type VerifyWebhookInput, type WebhookEvent, verifyWebhook } from '../webhook-events.js';

import { type CallOptions, Resource, seg } from './base.js';

export type WebhookDeliveryListParams = QueryOf<'/v1/webhooks/{webhook_id}/deliveries', 'get'>;

export class Webhooks extends Resource {
  /** Register an endpoint. The response's `secret` is shown once: store it to verify deliveries. */
  create(params: BodyOf<'/v1/webhooks', 'post'>, options?: CallOptions): Promise<WebhookCreated> {
    return this.http.request('POST', '/v1/webhooks', { ...options, body: params });
  }

  list(options?: CallOptions): Promise<Schemas['WebhookList']> {
    return this.http.request('GET', '/v1/webhooks', options);
  }

  delete(webhookId: string, options?: CallOptions): Promise<void> {
    return this.http.request('DELETE', `/v1/webhooks/${seg(webhookId)}`, options);
  }

  enable(webhookId: string, options?: CallOptions): Promise<Webhook> {
    return this.http.request('POST', `/v1/webhooks/${seg(webhookId)}/enable`, options);
  }

  disable(webhookId: string, options?: CallOptions): Promise<Webhook> {
    return this.http.request('POST', `/v1/webhooks/${seg(webhookId)}/disable`, options);
  }

  /** Queue a `webhook.test` delivery to the endpoint. */
  test(webhookId: string, options?: CallOptions): Promise<WebhookDelivery> {
    return this.http.request('POST', `/v1/webhooks/${seg(webhookId)}/test`, options);
  }

  deliveries(
    webhookId: string,
    params: WebhookDeliveryListParams = {},
    options?: CallOptions
  ): Promise<Page<WebhookDelivery>> {
    return this.http.request('GET', `/v1/webhooks/${seg(webhookId)}/deliveries`, { ...options, query: params });
  }

  /** Send a failed delivery again. */
  retryDelivery(webhookId: string, deliveryId: string, options?: CallOptions): Promise<WebhookDelivery> {
    return this.http.request('POST', `/v1/webhooks/${seg(webhookId)}/deliveries/${seg(deliveryId)}/retry`, options);
  }

  /** Verify a delivery's signature and return the typed event. Same as the `verifyWebhook` export. */
  verify(input: VerifyWebhookInput): Promise<WebhookEvent> {
    return verifyWebhook(input);
  }
}
