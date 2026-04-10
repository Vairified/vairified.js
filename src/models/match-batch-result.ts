/**
 * {@link MatchBatchResult} — result of a batch match submission.
 *
 * @module
 */

import type { MatchBatchResultWire } from '../types.js';

/**
 * Result of a {@link MatchesResource.submit} call.
 *
 * {@link success} is `true` only when every match in the batch was
 * accepted. Check {@link errors} for per-match validation failures.
 *
 * @category Matches
 */
export class MatchBatchResult {
  readonly success: boolean;
  readonly numMatches: number;
  readonly numGames: number;
  readonly dryRun: boolean | null;
  readonly message: string | null;
  readonly errors: readonly string[] | null;

  constructor(wire: MatchBatchResultWire) {
    this.success = wire.success;
    this.numMatches = wire.numMatches;
    this.numGames = wire.numGames;
    this.dryRun = wire.dryRun ?? null;
    this.message = wire.message ?? null;
    this.errors = wire.errors ? Object.freeze([...wire.errors]) : null;
    Object.freeze(this);
  }

  /** Shorthand: successful submission with zero errors. */
  get ok(): boolean {
    return this.success && (this.errors === null || this.errors.length === 0);
  }

  /** Whether this was a dry-run (validation only, nothing persisted). */
  get isDryRun(): boolean {
    return this.dryRun === true;
  }

  toString(): string {
    const mode = this.isDryRun ? ' [dry-run]' : '';
    const errs = this.errors && this.errors.length > 0 ? ` errors=${this.errors.length}` : '';
    const status = this.ok ? 'ok' : 'FAILED';
    return `MatchBatchResult ${status}${mode} matches=${this.numMatches} games=${this.numGames}${errs}`;
  }
}
