/**
 * {@link WebhookDelivery} and {@link WebhookDeliveriesResult} — webhook
 * delivery inspection models.
 *
 * @module
 */

import type { WebhookDeliveriesResultWire, WebhookDeliveryWire } from '../types.js';

/**
 * A single webhook delivery attempt.
 *
 * @category Webhooks
 */
export class WebhookDelivery {
  readonly id: string;
  readonly event: string;
  readonly url: string;
  readonly statusCode: number | null;
  readonly responseBody: string | null;
  readonly errorMessage: string | null;
  readonly attempts: number;
  readonly maxAttempts: number;
  readonly lastAttemptAt: string;
  readonly nextRetryAt: string | null;
  readonly completedAt: string | null;
  readonly createdAt: string;
  readonly payload: Readonly<Record<string, unknown>>;

  /** @internal */
  constructor(wire: WebhookDeliveryWire) {
    this.id = wire.id;
    this.event = wire.event;
    this.url = wire.url;
    this.statusCode = wire.statusCode;
    this.responseBody = wire.responseBody;
    this.errorMessage = wire.errorMessage;
    this.attempts = wire.attempts;
    this.maxAttempts = wire.maxAttempts;
    this.lastAttemptAt = wire.lastAttemptAt;
    this.nextRetryAt = wire.nextRetryAt;
    this.completedAt = wire.completedAt;
    this.createdAt = wire.createdAt;
    this.payload = Object.freeze({ ...wire.payload });
    Object.freeze(this);
  }

  /** Whether delivery completed successfully (2xx status). */
  get succeeded(): boolean {
    return (
      this.completedAt != null &&
      this.statusCode != null &&
      this.statusCode >= 200 &&
      this.statusCode < 300
    );
  }

  /** Whether delivery failed definitively (completed with non-2xx). */
  get failed(): boolean {
    return this.completedAt != null && !this.succeeded;
  }
}

/**
 * Paginated list of webhook delivery attempts.
 *
 * @category Webhooks
 */
export class WebhookDeliveriesResult {
  readonly deliveries: readonly WebhookDelivery[];
  readonly total: number;

  /** @internal */
  constructor(wire: WebhookDeliveriesResultWire) {
    this.deliveries = Object.freeze(wire.deliveries.map((d) => new WebhookDelivery(d)));
    this.total = wire.total;
    Object.freeze(this);
  }
}
