/**
 * {@link WebhooksResource} — webhook delivery inspection.
 *
 * @module
 */

import type { HttpTransport } from '../http.js';
import { WebhookDeliveriesResult } from '../models/webhook-delivery.js';
import type { WebhookDeliveriesResultWire } from '../types.js';

/**
 * Webhook delivery inspection.
 *
 * @category Resources
 */
export class WebhooksResource {
  readonly #http: HttpTransport;

  /** @internal */
  constructor(http: HttpTransport) {
    this.#http = http;
  }

  /**
   * List recent webhook delivery attempts.
   *
   * @param options - Optional filters and pagination.
   * @param options.event - Filter by event type (e.g. `'rating.updated'`).
   * @param options.status - Filter: `'all'`, `'pending'`, `'success'`, or `'failed'`.
   * @param options.limit - Results per page (1-100, default 20).
   * @param options.offset - Pagination offset.
   * @returns {@link WebhookDeliveriesResult} with entries and total.
   * @category Webhooks
   *
   * @example
   * ```ts
   * const result = await client.webhooks.deliveries({ status: 'failed' });
   * for (const d of result.deliveries) {
   *   console.log(d.event, d.statusCode, d.errorMessage);
   * }
   * ```
   */
  async deliveries(options?: {
    event?: string;
    status?: 'all' | 'pending' | 'success' | 'failed';
    limit?: number;
    offset?: number;
  }): Promise<WebhookDeliveriesResult> {
    const query: Record<string, string | number> = {};
    if (options?.event) query.event = options.event;
    if (options?.status) query.status = options.status;
    if (options?.limit != null) query.limit = options.limit;
    if (options?.offset != null) query.offset = options.offset;
    const data = await this.#http.request<WebhookDeliveriesResultWire>({
      method: 'GET',
      path: '/partner/webhook-deliveries',
      query,
    });
    return new WebhookDeliveriesResult(data);
  }
}
