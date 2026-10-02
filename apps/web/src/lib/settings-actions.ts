/**
 * Server actions for workspace settings: the name buyers see on receipts and
 * the GST registration that decides what checkout charges.
 */
'use server'

import { workspaceTaxSettingsSchema, type WorkspaceTaxSettings } from '@creatorhub/contracts'
import { auditLog, workspaces } from '@creatorhub/db'
import { z } from 'zod'

import { auditOptions } from './env'
import { memberAction, type ActionResult } from './member-action'

const nameSchema = z
  .string()
  .trim()
  .min(2, 'Use at least 2 characters.')
  .max(80, 'Use at most 80 characters.')

export async function updateWorkspaceNameAction(
  rawWorkspaceId: string,
  rawName: string,
): Promise<ActionResult<{ readonly name: string }>> {
  const parsed = nameSchema.safeParse(rawName)
  if (!parsed.success)
    return { ok: false, error: parsed.error.issues[0]?.message ?? 'Enter a name.' }
  const name = parsed.data
  return memberAction(
    'workspace.rename',
    rawWorkspaceId,
    'workspace.update',
    async (scope, member) => {
      await workspaces.updateCurrentWorkspace(scope, { name })
      await auditLog.writeAuditLog(scope, auditOptions, {
        actorType: 'user',
        actorId: member.actorId as never,
        action: 'workspace.renamed',
        targetType: 'workspace',
        targetId: scope.context.workspaceId,
        metadata: { name },
      })
      return { name }
    },
  )
}

export async function updateTaxSettingsAction(
  rawWorkspaceId: string,
  input: unknown,
): Promise<ActionResult<WorkspaceTaxSettings>> {
  const parsed = workspaceTaxSettingsSchema.safeParse(input)
  if (!parsed.success) {
    const issue = parsed.error.issues[0]
    const field = issue?.path[0]
    return {
      ok: false,
      error:
        field === 'gstin'
          ? 'Enter your 15-character GSTIN exactly as it appears on your registration certificate.'
          : field === 'legalName'
            ? 'Enter the legal name on your GST registration.'
            : (issue?.message ?? 'Some fields are not valid.'),
    }
  }
  const settings = parsed.data
  return memberAction(
    'workspace.tax',
    rawWorkspaceId,
    'workspace.update',
    async (scope, member) => {
      await workspaces.updateCurrentWorkspace(scope, { taxSettings: settings })
      await auditLog.writeAuditLog(scope, auditOptions, {
        actorType: 'user',
        actorId: member.actorId as never,
        action: 'workspace.tax_settings_updated',
        targetType: 'workspace',
        targetId: scope.context.workspaceId,
        metadata: settings.gstRegistered
          ? {
              gstRegistered: true,
              gstin: settings.gstin,
              rateBasisPoints: settings.rateBasisPoints,
            }
          : { gstRegistered: false },
      })
      return settings
    },
  )
}
