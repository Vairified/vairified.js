/**
 * {@link ProvisionMembersResult} — result of a member provision call.
 *
 * @module
 */

import type {
  ProvisionErrorCode,
  ProvisionMemberResultWire,
  ProvisionMembersResultWire,
} from '../types.js';

/**
 * The outcome for one person in a provision call.
 *
 * - `created`: a VAIR ghost now exists for this person and {@link memberId}
 *   is theirs, usable at once in `matches.submit()`. A repeat call returns
 *   the same id for a ghost your key created, as long as nobody has claimed
 *   it yet, so a retry is safe.
 * - `exists`: VAIR already holds a record for this contact. **No id is
 *   returned**, whoever owns it. The person links their own VAIR account by
 *   signing in (OAuth/SSO).
 * - `invalid`: nothing was created. {@link error} says why, in words you
 *   can show to whoever typed the data.
 *
 * @category Members
 */
export class ProvisionResult {
  /** The email (trimmed, lower-cased), else the phone (trimmed). */
  readonly ref: string;
  readonly status: 'created' | 'exists' | 'invalid';
  /** Present only when {@link status} is `created`. */
  readonly memberId: number | null;
  /** Present only when {@link status} is `invalid`. */
  readonly error: { readonly code: ProvisionErrorCode; readonly message: string } | null;

  /** @internal */
  constructor(wire: ProvisionMemberResultWire) {
    this.ref = wire.ref;
    this.status = wire.status;
    this.memberId = wire.status === 'created' ? (wire.memberId ?? null) : null;
    this.error = wire.error ? Object.freeze({ ...wire.error }) : null;
    Object.freeze(this);
  }

  get isCreated(): boolean {
    return this.status === 'created';
  }

  get exists(): boolean {
    return this.status === 'exists';
  }

  get isInvalid(): boolean {
    return this.status === 'invalid';
  }

  toString(): string {
    return `ProvisionResult ${this.ref} -> ${this.status}`;
  }
}

/**
 * Result of a {@link MembersResource.provision} call.
 *
 * One entry per distinct ref, in the order each first appeared. Entries you
 * sent twice (the same email in different case, say) come back once.
 *
 * @category Members
 */
export class ProvisionMembersResult {
  readonly results: readonly ProvisionResult[];

  /** @internal */
  constructor(wire: ProvisionMembersResultWire) {
    this.results = Object.freeze(wire.results.map((r) => new ProvisionResult(r)));
    Object.freeze(this);
  }

  /**
   * Look up one person's result by the email or phone you sent.
   *
   * Emails match case-insensitively and both are trimmed, the same way the
   * API builds each `ref`.
   */
  get(emailOrPhone: string): ProvisionResult | null {
    const trimmed = emailOrPhone.trim();
    const needle = trimmed.includes('@') ? trimmed.toLowerCase() : trimmed;
    return this.results.find((r) => r.ref === needle) ?? null;
  }

  get created(): readonly ProvisionResult[] {
    return this.results.filter((r) => r.isCreated);
  }

  get existing(): readonly ProvisionResult[] {
    return this.results.filter((r) => r.exists);
  }

  get invalid(): readonly ProvisionResult[] {
    return this.results.filter((r) => r.isInvalid);
  }

  toString(): string {
    return (
      `ProvisionMembersResult created=${this.created.length} ` +
      `exists=${this.existing.length} invalid=${this.invalid.length}`
    );
  }
}
