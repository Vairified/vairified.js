/**
 * {@link TournamentImportResult} — result of a tournament import submission.
 *
 * @module
 */

import type { TournamentImportResultWire } from '../types.js';

/**
 * Result of a tournament import submission.
 *
 * @category Matches
 */
export class TournamentImportResult {
  readonly success: boolean;
  readonly matchesImported: number;
  readonly gamesRecorded: number;
  readonly ghostPlayersCreated: number;
  readonly existingPlayersMatched: number;
  readonly dryRun: boolean;
  readonly message: string | undefined;
  readonly errors: readonly string[];

  /** @internal */
  constructor(wire: TournamentImportResultWire) {
    this.success = wire.success;
    this.matchesImported = wire.matchesImported;
    this.gamesRecorded = wire.gamesRecorded;
    this.ghostPlayersCreated = wire.ghostPlayersCreated;
    this.existingPlayersMatched = wire.existingPlayersMatched;
    this.dryRun = wire.dryRun ?? false;
    this.message = wire.message;
    this.errors = Object.freeze(wire.errors ?? []);
    Object.freeze(this);
  }

  /** True when the import succeeded without errors. */
  get ok(): boolean {
    return this.success && this.errors.length === 0;
  }
}
