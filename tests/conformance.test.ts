/**
 * The shared conformance suite.
 *
 * `conformance/webhook-cases.json` is byte-identical in `vairified.js` and
 * `vairified.py`, and both run every case in their own CI. That is what makes
 * parity a build failure instead of something a person asserts.
 *
 * It exists because parity WAS something a person asserted, and the assertion
 * was wrong twice: one pass reported 13 of 13 cases agreeing, a review then
 * found 14 more that all diverged, and a third pass found 15 real divergences
 * in 41 cases. Fixing named instances was not converging, so the mechanism
 * changed rather than the instances.
 *
 * **Adding a case:** edit the JSON in BOTH repos, byte-identical. A reviewer who
 * finds a divergence contributes a case here rather than a bug report — that is
 * the property that makes this converge.
 */

import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { verifyWebhook, WebhookSignatureError } from '../src/index.js';

interface ConformanceCase {
  name: string;
  why: string;
  bodyHex: string;
  header: string;
  secret: string | readonly string[] | null;
  nowSeconds: number;
  toleranceSeconds?: number | 'NaN' | 'Infinity';
}

const suite = JSON.parse(
  readFileSync(new URL('../conformance/webhook-cases.json', import.meta.url), 'utf8'),
) as { version: number; cases: ConformanceCase[] };

/**
 * JSON has no literal for these, so the case file carries them as strings and
 * each SDK revives them in its own way. Without this the two most dangerous
 * option values — the ones that silently disabled the replay window — could not
 * be expressed in a shared file at all.
 */
function tolerance(v: ConformanceCase['toleranceSeconds']): number | undefined {
  if (v === undefined) return undefined;
  if (v === 'NaN') return Number.NaN;
  if (v === 'Infinity') return Number.POSITIVE_INFINITY;
  return v;
}

describe(`conformance suite (v${suite.version}, ${suite.cases.length} cases)`, () => {
  it('has the same case list the Python SDK runs', () => {
    // A cheap guard against one repo's file being edited alone. It cannot prove
    // the two files match — only CI fetching the sibling could — but it pins
    // the count and version so a silent truncation is visible.
    expect(suite.version).toBe(1);
    expect(suite.cases.length).toBeGreaterThanOrEqual(53);
    expect(new Set(suite.cases.map((c) => c.name)).size).toBe(suite.cases.length);
  });

  for (const c of suite.cases) {
    const shouldAccept = c.name.startsWith('accept/');
    it(`${c.name} — ${c.why}`, async () => {
      const body = Uint8Array.from(Buffer.from(c.bodyHex, 'hex'));
      const opts: { nowSeconds: number; toleranceSeconds?: number } = {
        nowSeconds: c.nowSeconds,
      };
      const tol = tolerance(c.toleranceSeconds);
      if (tol !== undefined) opts.toleranceSeconds = tol;

      if (shouldAccept) {
        const event = await verifyWebhook(body, c.header, c.secret, opts);
        expect(typeof event.event).toBe('string');
        expect(typeof event.eventId).toBe('string');
      } else {
        await expect(verifyWebhook(body, c.header, c.secret, opts)).rejects.toBeInstanceOf(
          WebhookSignatureError,
        );
      }
    });
  }
});
