/**
 * Workspace repository.
 *
 * Responsibilities: read, create, and update `workspaces` for the current workspace.
 * Dependencies: drizzle-orm, the repository base.
 *
 * The tenant root repository. Scoped by `workspaces.id = scope.context.workspaceId`,
 * matching the RLS policy in migration 0001.
 */
import {
  parseWorkspaceTaxSettings,
  type WorkspaceId,
  type WorkspaceTaxSettings,
} from '@creatorhub/contracts'
import { eq } from 'drizzle-orm'

import type { RepositoryScope } from '../repository.js'
import { workspaces, type workspaceStatus } from '../schema/identity.js'

export type WorkspaceStatus = (typeof workspaceStatus.enumValues)[number]

export type WorkspaceRecord = {
  readonly id: WorkspaceId
  readonly slug: string
  readonly name: string
  readonly timezone: string
  readonly defaultCurrency: string
  readonly platformFeeBps: number
  readonly taxSettings: WorkspaceTaxSettings
  readonly status: WorkspaceStatus
  readonly createdAt: Date
  readonly updatedAt: Date
}

/**
 * Fetch the current workspace from the scoped context.
 *
 * Scoped by `workspaces.id = scope.context.workspaceId`.
 */
export async function findCurrentWorkspace(
  scope: RepositoryScope,
): Promise<WorkspaceRecord | undefined> {
  const rows = await scope.tx
    .select({
      id: workspaces.id,
      slug: workspaces.slug,
      name: workspaces.name,
      timezone: workspaces.timezone,
      defaultCurrency: workspaces.defaultCurrency,
      platformFeeBps: workspaces.platformFeeBps,
      taxSettings: workspaces.taxSettings,
      status: workspaces.status,
      createdAt: workspaces.createdAt,
      updatedAt: workspaces.updatedAt,
    })
    .from(workspaces)
    .where(eq(workspaces.id, scope.context.workspaceId))
    .limit(1)

  const row = rows[0]
  if (row === undefined) {
    return undefined
  }

  return {
    id: row.id as WorkspaceId,
    slug: row.slug,
    name: row.name,
    timezone: row.timezone,
    defaultCurrency: row.defaultCurrency,
    platformFeeBps: row.platformFeeBps,
    taxSettings: parseWorkspaceTaxSettings(row.taxSettings),
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  }
}

/**
 * Create a new workspace row.
 *
 * Stamps the workspace id from the scope's context.
 */
export async function createWorkspace(
  scope: RepositoryScope,
  input: {
    readonly slug: string
    readonly name: string
    readonly timezone?: string
    readonly defaultCurrency?: string
  },
): Promise<WorkspaceId> {
  const rows = await scope.tx
    .insert(workspaces)
    .values({
      id: scope.context.workspaceId,
      slug: input.slug,
      name: input.name,
      ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
      ...(input.defaultCurrency === undefined ? {} : { defaultCurrency: input.defaultCurrency }),
    })
    .returning({ id: workspaces.id })

  return (rows[0]?.id ?? '') as WorkspaceId
}

/**
 * Update the current workspace.
 *
 * Scoped to the current workspace id.
 */
export async function updateCurrentWorkspace(
  scope: RepositoryScope,
  input: {
    readonly name?: string
    readonly timezone?: string
    readonly defaultCurrency?: string
    readonly status?: WorkspaceStatus
    readonly taxSettings?: WorkspaceTaxSettings
  },
): Promise<boolean> {
  const rows = await scope.tx
    .update(workspaces)
    .set({
      updatedAt: new Date(),
      ...(input.name === undefined ? {} : { name: input.name }),
      ...(input.timezone === undefined ? {} : { timezone: input.timezone }),
      ...(input.defaultCurrency === undefined ? {} : { defaultCurrency: input.defaultCurrency }),
      ...(input.status === undefined ? {} : { status: input.status }),
      ...(input.taxSettings === undefined ? {} : { taxSettings: input.taxSettings }),
    })
    .where(eq(workspaces.id, scope.context.workspaceId))
    .returning({ id: workspaces.id })

  return rows.length > 0
}
