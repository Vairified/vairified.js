/**
 * {@link MatchesResource} — bulk match submission.
 *
 * @module
 */

import type { HttpTransport } from '../http.js';
import { MatchBatchResult } from '../models/match-batch-result.js';
import { TournamentImportResult } from '../models/tournament-import-result.js';
import type { MatchBatch, MatchBatchResultWire, TournamentImportResultWire } from '../types.js';

/**
 * Match submission — one call submits a full batch.
 *
 * @category Resources
 */
export class MatchesResource {
  readonly #http: HttpTransport;

  /** @internal */
  constructor(http: HttpTransport) {
    this.#http = http;
  }

  /**
   * Submit a {@link MatchBatch} for rating calculation.
   *
   * All players in every match must have granted the `user:match:submit`
   * scope via OAuth (unless your API key has the
   * `user:match:submit:trusted` scope, which skips per-player consent).
   *
   * Set `batch.dryRun = true` to validate without persisting.
   *
   * ```ts
   * const result = await client.matches.submit({
   *   sport: 'pickleball',
   *   winScore: 11,
   *   winBy: 2,
   *   bracket: '4.0 Doubles',
   *   event: 'Weekly League',
   *   matchDate: '2026-04-11T14:00:00Z',
   *   matches: [
   *     {
   *       identifier: 'm1',
   *       teams: [['vair_mem_aaa', 'vair_mem_bbb'],
   *               ['vair_mem_ccc', 'vair_mem_ddd']],
   *       games: [{ scores: [11, 8] }, { scores: [11, 5] }],
   *     },
   *   ],
   * });
   * if (result.ok) {
   *   console.log(`Submitted ${result.numGames} games`);
   * }
   * ```
   */
  async submit(batch: MatchBatch): Promise<MatchBatchResult> {
    const wire = await this.#http.request<MatchBatchResultWire>({
      method: 'POST',
      path: '/partner/matches',
      body: batch,
    });
    return new MatchBatchResult(wire);
  }

  /**
   * Import tournament results.
   *
   * The request body is a free-form JSON object whose structure is
   * defined by the Vairified tournament import schema. Set
   * `body.dryRun = true` to validate without persisting.
   *
   * @param body - Tournament import payload.
   * @returns {@link TournamentImportResult} with match/game counts.
   * @category Matches
   *
   * @example
   * ```ts
   * const result = await client.matches.tournamentImport({
   *   sport: 'pickleball',
   *   tournamentName: 'Spring Classic',
   *   matches: [...],
   * });
   * if (result.ok) {
   *   console.log(`Imported ${result.matchesImported} matches`);
   * }
   * ```
   */
  async tournamentImport(body: Record<string, unknown>): Promise<TournamentImportResult> {
    const wire = await this.#http.request<TournamentImportResultWire>({
      method: 'POST',
      path: '/partner/tournament-import',
      body,
    });
    return new TournamentImportResult(wire);
  }

  /** Send a test payload to a webhook URL. */
  async testWebhook(webhookUrl: string): Promise<Record<string, unknown>> {
    const data = await this.#http.request<Record<string, unknown> | undefined>({
      method: 'POST',
      path: '/partner/webhook-test',
      body: { webhookUrl },
    });
    return data ?? {};
  }
}
