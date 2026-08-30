/**
 * Authorisation. One place that answers "may this actor do this?".
 *
 * Responsibilities: map a workspace role to the set of things it may do, and
 * decide a single request.
 * Dependencies: `@creatorhub/contracts` for the branded ids, and the Result type
 * next door. No database, no framework, no auth library.
 *
 * ADR-0006 names this module and says authorisation is deliberately not
 * delegated to the auth library. The reason is in that record; the consequence is
 * here. Better Auth knows who someone is. Whether they may refund an order is a
 * business rule, and business rules live in `packages/domain` where they can be
 * tested without a database and cannot be quietly overridden by a library
 * upgrade.
 *
 * **Pure functions over data.** Nothing in this file does I/O. The caller has
 * already loaded the membership, because loading it is a tenant-scoped
 * repository's job and repositories are the only thing allowed to touch the
 * database. That split is what makes every rule below testable as a table.
 *
 * **Permissions are enumerated, not derived from strings.** A permission is a
 * member of a closed union, so a typo is a compile error rather than a silently
 * denied request. `can(role, 'ordre.refund')` does not type-check.
 *
 * **Deny is the default and it is structural.** `ROLE_PERMISSIONS` is exhaustive
 * over the role union, and a role's set lists what it may do. A permission added
 * to the union without being granted anywhere is denied to everyone, which is the
 * safe direction: the failure is a feature nobody can reach, not a capability
 * everyone has.
 */
import type { UserId, WorkspaceId } from '@creatorhub/contracts'

import { type Result, domainError, err, ok } from '../result.js'

// ---------------------------------------------------------------------------
// Roles
// ---------------------------------------------------------------------------

/**
 * The three roles from `workspace_members.role`, in the same order as the
 * Postgres enum.
 *
 * Kept as a literal union rather than imported from `packages/db`, because the
 * domain must not depend on the database package: the lint rules in
 * `@creatorhub/config/eslint/domain` reject that import. The drift risk is real
 * and is caught by `roleFromString`, which is the only way a database value
 * enters this module and fails loudly on an unrecognised one.
 */
export type WorkspaceRole = 'owner' | 'admin' | 'member'

export const WORKSPACE_ROLES: readonly WorkspaceRole[] = ['owner', 'admin', 'member'] as const

// ---------------------------------------------------------------------------
// Permissions
// ---------------------------------------------------------------------------

/**
 * Everything a member of a workspace can be authorised to do.
 *
 * Named `resource.action`, present tense, matching the audit log's
 * `resource.action` convention in past tense. `member.invite` here writes
 * `member.invited` there.
 *
 * Only permissions with a call site in slice 1 are listed. Later slices add
 * their own, and adding one means deciding which roles hold it, which is the
 * point of keeping the list closed.
 */
export type Permission =
  // Workspace itself
  | 'workspace.view'
  | 'workspace.update'
  | 'workspace.delete'

  // Membership and governance
  | 'member.view'
  | 'member.invite'
  | 'member.remove'
  | 'member.role.change'

  // The audit log. Reading it is a governance action, not a general one.
  | 'audit.view'

  // Billing, which is the owner's alone because it is their money and their
  // liability.
  | 'billing.view'
  | 'billing.manage'

  // Catalogue and Products (Slice 3)
  | 'product.view'
  | 'product.create'
  | 'product.update'
  | 'product.delete'
  | 'product.publish'
  | 'discount.manage'

  // Storefronts (Slice 4)
  | 'storefront.view'
  | 'storefront.manage'
  | 'storefront.publish'

  // Orders, Payments, Refunds, and Disputes (Slice 5)
  | 'order.view'
  | 'order.refund'
  | 'dispute.manage'

  // Customers (Slice 7)
  | 'customer.view'
  | 'customer.manage'

  // Affiliates & Attribution (Slice 8)
  | 'affiliate.view'
  | 'affiliate.manage'

/**
 * Which permissions each role holds.
 *
 * A `Record` over the role union rather than a `Map`, so adding a role to
 * `WorkspaceRole` without granting it anything is a compile error rather than a
 * role that silently holds nothing. The exhaustiveness is the safety property.
 *
 * The shape is deliberately flat: no inheritance, no "admin extends member".
 * Spreading one role's set into another reads as convenient and makes the actual
 * grant of any given role unreadable at a glance, which is the wrong trade for
 * the module that decides who may remove whom.
 */
const ROLE_PERMISSIONS: Record<WorkspaceRole, readonly Permission[]> = {
  /**
   * Owner. Everything, including the three things nobody else may do: delete the
   * workspace, change roles, and manage billing.
   *
   * Exactly one owner per workspace, enforced by a partial unique index rather
   * than here, because a governance invariant belongs in the database.
   */
  owner: [
    'workspace.view',
    'workspace.update',
    'workspace.delete',
    'member.view',
    'member.invite',
    'member.remove',
    'member.role.change',
    'audit.view',
    'billing.view',
    'billing.manage',
    'product.view',
    'product.create',
    'product.update',
    'product.delete',
    'product.publish',
    'discount.manage',
    'storefront.view',
    'storefront.manage',
    'storefront.publish',
    'order.view',
    'order.refund',
    'dispute.manage',
    'customer.view',
    'customer.manage',
    'affiliate.view',
    'affiliate.manage',
  ],

  /**
   * Admin. Runs the workspace day to day, and cannot end it or pay for it.
   *
   * No `member.role.change`: an admin who can promote is an admin who can make
   * themselves an owner, which makes the owner's exclusive permissions
   * decorative. No `workspace.delete` and no `billing.manage` for the same
   * reason, one step further along.
   */
  admin: [
    'workspace.view',
    'workspace.update',
    'member.view',
    'member.invite',
    'member.remove',
    'audit.view',
    'billing.view',
    'product.view',
    'product.create',
    'product.update',
    'product.delete',
    'product.publish',
    'discount.manage',
    'storefront.view',
    'storefront.manage',
    'storefront.publish',
    'order.view',
    'order.refund',
    'dispute.manage',
    'customer.view',
    'customer.manage',
    'affiliate.view',
    'affiliate.manage',
  ],

  /**
   * Member. Sees the workspace and who is in it, changes neither.
   *
   * No `audit.view`: the audit log records who did what, including things a
   * member has no business knowing about. It is a governance surface.
   */
  member: [
    'workspace.view',
    'member.view',
    'product.view',
    'product.create',
    'product.update',
    'storefront.view',
    'order.view',
    'customer.view',
    'affiliate.view',
  ],
}

// ---------------------------------------------------------------------------
// The actor
// ---------------------------------------------------------------------------

/**
 * A user's standing in one workspace, as loaded from `workspace_members`.
 *
 * Carries the workspace id as well as the role, because a membership without the
 * workspace it belongs to is the shape that lets workspace A's membership
 * authorise an action on workspace B. `authorise` compares it against the
 * workspace being acted on, and refuses when they differ.
 */
export type Membership = {
  readonly userId: UserId
  readonly workspaceId: WorkspaceId
  readonly role: WorkspaceRole
}

// ---------------------------------------------------------------------------
// Deciding
// ---------------------------------------------------------------------------

/**
 * Does this role hold this permission?
 *
 * The whole rule table in one function. Every authorisation question in the
 * system reduces to this call, and it is a set membership test with no I/O, so
 * it can be exhaustively tested across every role and permission pair.
 */
export function can(role: WorkspaceRole, permission: Permission): boolean {
  return ROLE_PERMISSIONS[role].includes(permission)
}

/** Every permission a role holds. For rendering a UI, not for deciding. */
export function permissionsFor(role: WorkspaceRole): readonly Permission[] {
  return ROLE_PERMISSIONS[role]
}

/**
 * Authorise one action, against one workspace, by one member.
 *
 * Two checks, and the order matters. The workspace is compared first, because a
 * membership in the wrong workspace is not a permission question at all: an owner
 * of workspace A holds `workspace.delete`, and asking whether they may delete
 * workspace B by looking only at their role answers yes.
 *
 * Returns `Result` rather than throwing, and rather than returning a boolean,
 * because the caller needs to know which of the two failed. Not-a-member and
 * insufficient-role produce the same HTTP response, per the slice 1 exit
 * condition, but they are different audit log entries.
 */
export function authorise(
  membership: Membership,
  workspaceId: WorkspaceId,
  permission: Permission,
): Result<Membership> {
  if (membership.workspaceId !== workspaceId) {
    return err(
      domainError({
        code: 'authorisation.wrong_workspace',

        // Deliberately identical wording to the not-found case a caller would
        // otherwise produce. The slice 1 exit condition requires that workspace
        // A's session asking about workspace B's record learns nothing, and a
        // distinct message here would be the leak the condition forbids. Neither
        // the role nor the target workspace is named.
        title: 'Not found',
        detail: 'We could not find that.',
        action: 'Check the link and try again.',
      }),
    )
  }

  if (!can(membership.role, permission)) {
    return err(
      domainError({
        code: 'authorisation.insufficient_role',
        title: 'You do not have permission',

        // The role is named because the reader is a member of this workspace and
        // already knows their own role. What they cannot know is which role the
        // action needs, and telling them turns a dead end into a request they can
        // make of someone.
        detail: 'Your role in this workspace does not allow this action.',
        action: 'Ask an owner or admin of this workspace to do it, or to change your role.',
      }),
    )
  }

  return ok(membership)
}

// ---------------------------------------------------------------------------
// Crossing the boundary from the database
// ---------------------------------------------------------------------------

/**
 * Turn a database string into a role, or fail.
 *
 * The one place an untyped value becomes a `WorkspaceRole`. Postgres enforces the
 * enum, so an unrecognised value means the two definitions have drifted, and the
 * honest response is to refuse rather than to guess. Guessing here means
 * defaulting, and a default in an authorisation module is either a privilege
 * nobody granted or a lockout nobody intended.
 */
export function roleFromString(value: string): Result<WorkspaceRole> {
  const role = WORKSPACE_ROLES.find((candidate) => candidate === value)

  if (role === undefined) {
    return err(
      domainError({
        code: 'authorisation.unknown_role',

        // Reaching this means the database holds a role this module does not
        // know, which is a deployment problem rather than anything the reader
        // did. The offending value stays out of the user-facing text and belongs
        // in the log line the caller writes.
        title: 'Something went wrong',
        detail: 'We could not read your role in this workspace.',
        action: 'Try again. If it keeps happening, contact support.',
      }),
    )
  }

  return ok(role)
}
