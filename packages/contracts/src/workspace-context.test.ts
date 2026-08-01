import { describe, expect, it } from 'vitest'

import { requestId, userId, workspaceId } from './identifiers.js'
import { withWorkspaceId, workspaceContext } from './workspace-context.js'

const WORKSPACE_A = workspaceId('019fbd70-4d9a-72e4-b6ed-722fe672c2ba')
const WORKSPACE_B = workspaceId('019fbd70-5a1c-7f02-9c3d-1a2b3c4d5e6f')
const ACTOR = userId('019fbd70-6b2d-7813-8d4e-2b3c4d5e6f70')
const REQUEST = requestId('4bf92f3577b34da6a3ce929d0e0e4736')

describe('workspaceContext', () => {
  it('carries the workspace and request', () => {
    const context = workspaceContext({ workspaceId: WORKSPACE_A, requestId: REQUEST })

    expect(context.workspaceId).toBe(WORKSPACE_A)
    expect(context.requestId).toBe(REQUEST)
  })

  it('carries the actor when one is acting', () => {
    const context = workspaceContext({
      workspaceId: WORKSPACE_A,
      requestId: REQUEST,
      actorId: ACTOR,
    })

    expect(context.actorId).toBe(ACTOR)
  })

  // System work has no user behind it: the outbox publisher, scheduled jobs, and
  // webhook processing all act on a workspace with no actor. The audit log
  // records those as system rather than inventing a user.
  it('omits the actor entirely for system work', () => {
    const context = workspaceContext({ workspaceId: WORKSPACE_A, requestId: REQUEST })

    expect('actorId' in context).toBe(false)
  })

  // exactOptionalPropertyTypes is on, so "absent" and "present but undefined"
  // are different types. An explicit undefined must not create the key, or a
  // JSON-serialised context would carry actorId: null into the audit log.
  it('omits the actor when it is explicitly undefined', () => {
    const context = workspaceContext({
      workspaceId: WORKSPACE_A,
      requestId: REQUEST,
      actorId: undefined,
    })

    expect('actorId' in context).toBe(false)
  })
})

describe('withWorkspaceId', () => {
  // The only legitimate caller is a platform operation crossing tenants under an
  // audit obligation (ADR-0012). It is named rather than a general setter so
  // those call sites are greppable.
  it('retargets the workspace', () => {
    const context = workspaceContext({ workspaceId: WORKSPACE_A, requestId: REQUEST })

    expect(withWorkspaceId(context, WORKSPACE_B).workspaceId).toBe(WORKSPACE_B)
  })

  it('preserves the request and actor, so the audit trail survives the hop', () => {
    const context = workspaceContext({
      workspaceId: WORKSPACE_A,
      requestId: REQUEST,
      actorId: ACTOR,
    })

    const retargeted = withWorkspaceId(context, WORKSPACE_B)

    expect(retargeted.requestId).toBe(REQUEST)
    expect(retargeted.actorId).toBe(ACTOR)
  })

  it('does not mutate the original', () => {
    const context = workspaceContext({ workspaceId: WORKSPACE_A, requestId: REQUEST })

    withWorkspaceId(context, WORKSPACE_B)

    expect(context.workspaceId).toBe(WORKSPACE_A)
  })
})
