import type { RequestOptions, Transport } from '../core.js';
import type { Page } from '../types.js';

/** Per-call options every method accepts. */
export type CallOptions = Pick<RequestOptions, 'timeoutMs' | 'maxRetries' | 'signal'>;

/** Encode one path segment. IDs come from callers, so never trust them in a URL. */
export const seg = (value: string) => encodeURIComponent(value);

export abstract class Resource {
  constructor(protected readonly http: Transport) {}

  /** Walk every page of a cursor-paginated list, fetching the next page only when needed. */
  protected async *paginate<T, Q extends { cursor?: string }>(
    list: (query: Q) => Promise<Page<T>>,
    query: Q
  ): AsyncGenerator<T, void, undefined> {
    let cursor = query.cursor;
    do {
      const page = await list({ ...query, cursor });
      yield* page.data;
      cursor = page.next_cursor ?? undefined;
    } while (cursor);
  }
}
