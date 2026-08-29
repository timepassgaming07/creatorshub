import { beforeEach, describe, expect, it, vi } from 'vitest'
import { userId } from '@creatorhub/contracts'
import type { ServerSession } from './server-session'

const mockGetServerSession = vi.fn<() => Promise<ServerSession | null>>()

vi.mock('./server-session', () => ({
  getServerSession: () => mockGetServerSession(),
}))

import {
  createWorkspaceAction,
  getWorkspaceDataAction,
  inviteMemberAction,
  removeMemberAction,
  updateMemberRoleAction,
} from './workspace-actions'

describe('workspace actions - authentication checks', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue(null)
  })

  it('rejects createWorkspaceAction when unauthenticated', async () => {
    const res = await createWorkspaceAction({
      name: 'Test Store',
      slug: 'test-store',
    })

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.status).toBe(401)
      expect(res.error.code).toBe('auth.unauthenticated')
    }
  })

  it('rejects getWorkspaceDataAction when unauthenticated', async () => {
    const res = await getWorkspaceDataAction('00000000-0000-7000-8000-000000000000')

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.status).toBe(401)
      expect(res.error.code).toBe('auth.unauthenticated')
    }
  })

  it('rejects inviteMemberAction when unauthenticated', async () => {
    const res = await inviteMemberAction({
      workspaceId: '00000000-0000-7000-8000-000000000000',
      email: 'test@example.com',
      role: 'member',
    })

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.status).toBe(401)
      expect(res.error.code).toBe('auth.unauthenticated')
    }
  })

  it('rejects updateMemberRoleAction when unauthenticated', async () => {
    const res = await updateMemberRoleAction({
      workspaceId: '00000000-0000-7000-8000-000000000000',
      targetUserId: '00000000-0000-7000-8000-000000000001',
      role: 'admin',
    })

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.status).toBe(401)
      expect(res.error.code).toBe('auth.unauthenticated')
    }
  })

  it('rejects removeMemberAction when unauthenticated', async () => {
    const res = await removeMemberAction({
      workspaceId: '00000000-0000-7000-8000-000000000000',
      targetUserId: '00000000-0000-7000-8000-000000000001',
    })

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.status).toBe(401)
      expect(res.error.code).toBe('auth.unauthenticated')
    }
  })
})

describe('workspace actions - input validation', () => {
  beforeEach(() => {
    mockGetServerSession.mockResolvedValue({
      userId: userId('00000000-0000-7000-8000-000000000001'),
      user: {
        id: '00000000-0000-7000-8000-000000000001',
        email: 'owner@example.com',
        name: 'Owner',
      },
    })
  })

  it('rejects workspace creation with empty or short name', async () => {
    const res = await createWorkspaceAction({
      name: 'A',
      slug: 'valid-slug',
    })

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.status).toBe(400)
      expect(res.error.code).toBe('validation.name_too_short')
    }
  })

  it('rejects workspace creation with invalid slug format', async () => {
    const res = await createWorkspaceAction({
      name: 'Valid Name',
      slug: 'Invalid Slug With Spaces!',
    })

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.status).toBe(400)
      expect(res.error.code).toBe('validation.invalid_slug')
    }
  })

  it('rejects member invitation with invalid email', async () => {
    const res = await inviteMemberAction({
      workspaceId: '00000000-0000-7000-8000-000000000000',
      email: 'not-an-email',
      role: 'member',
    })

    expect(res.success).toBe(false)
    if (!res.success) {
      expect(res.error.status).toBe(400)
      expect(res.error.code).toBe('validation.invalid_email')
    }
  })
})
