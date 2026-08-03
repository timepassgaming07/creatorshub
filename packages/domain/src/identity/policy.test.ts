import { userId, workspaceId } from '@creatorhub/contracts'
import { describe, expect, it } from 'vitest'

import { isErr, isOk } from '../result.js'
import {
  WORKSPACE_ROLES,
  authorise,
  can,
  permissionsFor,
  roleFromString,
  type Membership,
  type Permission,
  type WorkspaceRole,
} from './policy.js'

/**
 * The authorisation rules, as a table.
 *
 * Written as an exhaustive matrix rather than a handful of examples, because a
 * permission table tested by example is a table where the untested cell is the
 * one that matters. Every role is asserted against every permission below, so
 * granting something by accident fails a test that names both the role and the
 * permission.
 *
 * The matrix is duplicated from `ROLE_PERMISSIONS` on purpose. A test that reads
 * the implementation asserts the implementation equals itself. This one states
 * independently what the rules are supposed to be, which is what makes changing a
 * grant require changing the intent as well.
 */

const WORKSPACE_A = workspaceId('019fc729-f882-7799-9720-2c8589f658e9')
const WORKSPACE_B = workspaceId('019fc729-f67b-710c-b516-54fa4734e574')
const USER = userId('019fc72a-0000-7000-8000-000000000001')

/** Every permission in the union, listed so the matrix can be exhaustive. */
const ALL_PERMISSIONS: readonly Permission[] = [
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
]

/**
 * The intended rules, stated independently of the implementation.
 *
 * `true` means the role holds the permission. Every cell is filled; there is no
 * default, because a blank cell in an authorisation matrix is a question nobody
 * answered.
 */
const EXPECTED: Record<WorkspaceRole, Record<Permission, boolean>> = {
  owner: {
    'workspace.view': true,
    'workspace.update': true,
    'workspace.delete': true,
    'member.view': true,
    'member.invite': true,
    'member.remove': true,
    'member.role.change': true,
    'audit.view': true,
    'billing.view': true,
    'billing.manage': true,
  },
  admin: {
    'workspace.view': true,
    'workspace.update': true,
    'workspace.delete': false,
    'member.view': true,
    'member.invite': true,
    'member.remove': true,
    'member.role.change': false,
    'audit.view': true,
    'billing.view': true,
    'billing.manage': false,
  },
  member: {
    'workspace.view': true,
    'workspace.update': false,
    'workspace.delete': false,
    'member.view': true,
    'member.invite': false,
    'member.remove': false,
    'member.role.change': false,
    'audit.view': false,
    'billing.view': false,
    'billing.manage': false,
  },
}

function membership(role: WorkspaceRole, workspace = WORKSPACE_A): Membership {
  return { userId: USER, workspaceId: workspace, role }
}

// ---------------------------------------------------------------------------
// The matrix
// ---------------------------------------------------------------------------

describe('can', () => {
  for (const role of WORKSPACE_ROLES) {
    describe(role, () => {
      for (const permission of ALL_PERMISSIONS) {
        const expected = EXPECTED[role][permission]

        it(`${expected ? 'holds' : 'does not hold'} ${permission}`, () => {
          expect(can(role, permission)).toBe(expected)
        })
      }
    })
  }
})

// ---------------------------------------------------------------------------
// The properties the matrix is supposed to have
//
// Stated separately from the cells, because these are the reasons the cells are
// what they are. A future permission added without thought will satisfy the
// matrix, which is written by hand, and can still break one of these.
// ---------------------------------------------------------------------------

describe('the shape of the rules', () => {
  // Every cell in the matrix corresponds to a real permission, and every real
  // permission has a cell. Without this, adding to the union and forgetting the
  // matrix leaves the new permission untested and silently denied.
  it('covers every permission the module declares', () => {
    for (const role of WORKSPACE_ROLES) {
      expect(Object.keys(EXPECTED[role]).sort()).toEqual([...ALL_PERMISSIONS].sort())
    }
  })

  // An admin who can change roles can make themselves an owner, which makes
  // every owner-only permission decorative. This is the reason admin stops
  // where it does.
  it('lets only the owner change roles', () => {
    expect(can('owner', 'member.role.change')).toBe(true)
    expect(can('admin', 'member.role.change')).toBe(false)
    expect(can('member', 'member.role.change')).toBe(false)
  })

  it('lets only the owner delete the workspace or manage billing', () => {
    for (const permission of ['workspace.delete', 'billing.manage'] as const) {
      expect(can('owner', permission)).toBe(true)
      expect(can('admin', permission)).toBe(false)
      expect(can('member', permission)).toBe(false)
    }
  })

  // Whatever a member may do, an admin may do, and whatever an admin may do, an
  // owner may do. Asserted rather than implemented by spreading, so the flat
  // table stays readable and the ordering property is still guaranteed.
  it('gives each role at least what the one below it has', () => {
    for (const permission of ALL_PERMISSIONS) {
      if (can('member', permission)) {
        expect(can('admin', permission)).toBe(true)
      }

      if (can('admin', permission)) {
        expect(can('owner', permission)).toBe(true)
      }
    }
  })

  // Every role can see the workspace it belongs to. A membership that cannot
  // view the workspace is a membership with no purpose.
  it('lets every role view the workspace and its members', () => {
    for (const role of WORKSPACE_ROLES) {
      expect(can(role, 'workspace.view')).toBe(true)
      expect(can(role, 'member.view')).toBe(true)
    }
  })
})

describe('permissionsFor', () => {
  it('returns exactly the permissions the matrix grants', () => {
    for (const role of WORKSPACE_ROLES) {
      const granted = [...permissionsFor(role)].sort()
      const expected = ALL_PERMISSIONS.filter((p) => EXPECTED[role][p]).sort()

      expect(granted).toEqual(expected)
    }
  })

  it('gives the owner every permission', () => {
    expect([...permissionsFor('owner')].sort()).toEqual([...ALL_PERMISSIONS].sort())
  })
})

// ---------------------------------------------------------------------------
// Deciding one request
// ---------------------------------------------------------------------------

describe('authorise', () => {
  it('allows a permission the role holds, in the right workspace', () => {
    const result = authorise(membership('admin'), WORKSPACE_A, 'member.invite')

    expect(isOk(result)).toBe(true)
  })

  it('refuses a permission the role does not hold', () => {
    const result = authorise(membership('admin'), WORKSPACE_A, 'workspace.delete')

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error.code).toBe('authorisation.insufficient_role')
    }
  })

  // The check that matters most. An owner of workspace A holds every permission,
  // and must still be refused on workspace B. Answering this by role alone says
  // yes, which is the tenancy leak the whole slice exists to prevent.
  it('refuses an owner of one workspace acting on another', () => {
    const result = authorise(membership('owner', WORKSPACE_A), WORKSPACE_B, 'workspace.delete')

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error.code).toBe('authorisation.wrong_workspace')
    }
  })

  // The workspace is compared before the role, so a membership in the wrong
  // workspace is refused for that reason rather than for a permission it also
  // happens to lack. Two different audit entries, and this is what keeps them
  // distinguishable.
  it('reports the wrong workspace even when the role also lacks the permission', () => {
    const result = authorise(membership('member', WORKSPACE_A), WORKSPACE_B, 'billing.manage')

    expect(isErr(result)).toBe(true)
    if (isErr(result)) {
      expect(result.error.code).toBe('authorisation.wrong_workspace')
    }
  })

  // The slice 1 exit condition: a request carrying workspace A's session and
  // workspace B's id must not learn that the record exists. The wrong-workspace
  // error therefore says nothing about roles, permissions, or the other
  // workspace.
  it('says nothing about the other workspace or the role when refusing', () => {
    const result = authorise(membership('member', WORKSPACE_A), WORKSPACE_B, 'billing.manage')

    if (isErr(result)) {
      const text = [result.error.title, result.error.detail, result.error.action].join(' ')

      expect(text).not.toContain(WORKSPACE_B)
      expect(text).not.toContain(WORKSPACE_A)
      expect(text).not.toContain('member')
      expect(text).not.toContain('billing')
    }
  })

  it('returns the membership on success, so the caller can log the actor', () => {
    const actor = membership('owner')
    const result = authorise(actor, WORKSPACE_A, 'billing.manage')

    if (isOk(result)) {
      expect(result.value).toEqual(actor)
    }
  })

  // Every error carries all four fields, because the manifesto requires a
  // user-facing error to say what happened, why, and what to do next.
  it('produces a complete error in both failure cases', () => {
    const failures = [
      authorise(membership('member'), WORKSPACE_A, 'billing.manage'),
      authorise(membership('owner'), WORKSPACE_B, 'workspace.view'),
    ]

    for (const failure of failures) {
      expect(isErr(failure)).toBe(true)
      if (isErr(failure)) {
        expect(failure.error.code.length).toBeGreaterThan(0)
        expect(failure.error.title.length).toBeGreaterThan(0)
        expect(failure.error.detail.length).toBeGreaterThan(0)
        expect(failure.error.action.length).toBeGreaterThan(0)
      }
    }
  })
})

// ---------------------------------------------------------------------------
// Crossing the boundary from the database
// ---------------------------------------------------------------------------

describe('roleFromString', () => {
  it.each([...WORKSPACE_ROLES])('accepts %s', (role) => {
    const result = roleFromString(role)

    expect(isOk(result)).toBe(true)
    if (isOk(result)) {
      expect(result.value).toBe(role)
    }
  })

  // No defaulting. A value this module does not recognise means the TypeScript
  // union and the Postgres enum have drifted, and defaulting would either grant a
  // privilege nobody decided on or lock out a role that is legitimate.
  it.each(['Owner', 'OWNER', 'superuser', 'admin ', '', 'null'])(
    'refuses %o rather than guessing',
    (value) => {
      const result = roleFromString(value)

      expect(isErr(result)).toBe(true)
      if (isErr(result)) {
        expect(result.error.code).toBe('authorisation.unknown_role')
      }
    },
  )

  // The unrecognised value is a deployment problem, not something the reader
  // typed, so it stays out of the text they see and belongs in the log.
  it('keeps the offending value out of the user-facing text', () => {
    const result = roleFromString('superuser')

    if (isErr(result)) {
      const text = [result.error.title, result.error.detail, result.error.action].join(' ')

      expect(text).not.toContain('superuser')
    }
  })
})
