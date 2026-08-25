/**
 * {@link TournamentImportResult} — result of a tournament import submission.
 *
 * @module
 */

import type { TournamentImportResultWire } from '../types.js';

/**
 * One ghost player created by a tournament import.
 *
 * @category Matches
 */
export interface TournamentImportCreatedGhost {
  /** The email or phone you supplied for this person in `ghostMembers[]`. */
  readonly ref: string;
  /** The public member id allocated to them, usable in `matches.submit()`. */
  readonly memberId: number;
}

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
  /**
   * Public member ids for the ghost players THIS import created, keyed by the
   * `ref` supplied in `ghostMembers[]`.
   *
   * Empty on a dry-run, and empty for entries the import matched to a player who
   * already existed — resolving an existing email to a member requires the
   * `key:player:lookup` scope and `members.getByEmail()`.
   *
   * Use these ids directly in a follow-up `matches.submit()`; without them an
   * import reports only how many accounts it caused and you cannot address any
   * of them.
   */
  readonly createdGhostMembers: readonly TournamentImportCreatedGhost[];

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
    this.createdGhostMembers = Object.freeze(
      (wire.createdGhostMembers ?? []).map((entry) =>
        Object.freeze({ ref: entry.ref, memberId: entry.memberId }),
      ),
    );
    Object.freeze(this);
  }

  /** True when the import succeeded without errors. */
  get ok(): boolean {
    return this.success && this.errors.length === 0;
  }
}
