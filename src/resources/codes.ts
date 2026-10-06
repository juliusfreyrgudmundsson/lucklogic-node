import type { BodyOf, Job, JobAccepted, Schemas } from '../types.js';

import { type CallOptions, Resource, seg } from './base.js';

export type GenerateCodesParams = BodyOf<'/v1/campaigns/{campaign_id}/generate', 'post'>;

export class Codes extends Resource {
  /**
   * Start generating a batch of printable codes. Returns at once with a job;
   * follow it with `jobs.retrieve()` or `jobs.waitUntilReady()`.
   */
  generate(campaignId: string, params: GenerateCodesParams, options?: CallOptions): Promise<JobAccepted> {
    return this.http.request('POST', `/v1/campaigns/${seg(campaignId)}/generate`, { ...options, body: params });
  }

  /** Every batch generated for a campaign. */
  listBatches(campaignId: string, options?: CallOptions): Promise<Schemas['JobList']> {
    return this.http.request('GET', `/v1/campaigns/${seg(campaignId)}/batches`, options);
  }
}

export class Jobs extends Resource {
  retrieve(jobId: string, options?: CallOptions): Promise<Job> {
    return this.http.request('GET', `/v1/jobs/${seg(jobId)}`, options);
  }

  /** Withdraw a whole batch, e.g. after a misprint. Its codes stop redeeming. */
  revoke(jobId: string, params: BodyOf<'/v1/jobs/{job_id}/revoke', 'post'>, options?: CallOptions): Promise<Job> {
    return this.http.request('POST', `/v1/jobs/${seg(jobId)}/revoke`, { ...options, body: params });
  }

  /**
   * Poll until the batch is `ready` (its `download_url` is then set) and return it.
   * Throws if it fails or is revoked, or after `timeoutMs` (default 15 minutes).
   */
  async waitUntilReady(
    jobId: string,
    { intervalMs = 2000, timeoutMs = 15 * 60_000, ...options }: CallOptions & { intervalMs?: number } = {}
  ): Promise<Job> {
    const deadline = Date.now() + timeoutMs;
    for (;;) {
      const job = await this.retrieve(jobId, options);
      if (job.status === 'ready') return job;
      if (job.status === 'failed' || job.status === 'revoked') {
        throw new Error(`Code batch ${jobId} ended as ${job.status}`);
      }
      if (Date.now() + intervalMs > deadline) {
        throw new Error(`Code batch ${jobId} was still ${job.status} after ${Math.round(timeoutMs / 1000)} s`);
      }
      await new Promise((r) => setTimeout(r, intervalMs));
    }
  }
}
