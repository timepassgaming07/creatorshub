'use server'

/**
 * Server Actions for Asset Management and Product-Asset Associations (Item 3.8).
 *
 * Responsibilities:
 * - Presigned upload URL generation with size and content-type enforcement
 * - Post-upload verification and heuristic malware scanning
 * - Deliverability checks before attaching deliverable assets
 * - Tenant isolation and RBAC policy enforcement
 * - Audit log capture for asset lifecycle events
 */
import { randomUUID } from 'node:crypto'
import {
  type ProductAssetRole,
  type WorkspaceId,
  assetId,
  assetIdSchema,
  productIdSchema,
  productAssetRoleSchema,
  requestId,
  userId,
  workspaceContext,
  workspaceIdSchema,
} from '@creatorhub/contracts'
import { type AssetRecord, auditLog, catalogue, workspaceMembers } from '@creatorhub/db'
import { authorise, type Membership, type Permission } from '@creatorhub/domain'
import { assertAssetDeliverable } from '@creatorhub/storage'

import { getDatabase } from './db'
import { getServerSession } from './server-session'
import { getMalwareScanner, getStorageDriver, getStorageService } from './storage'

const AUDIT_SALT =
  process.env['AUDIT_IP_SALT'] ?? 'development-audit-ip-salt-at-least-32-chars-long'
const auditOptions = { currentSalt: () => AUDIT_SALT }

export type ActionError = {
  readonly code: string
  readonly title: string
  readonly detail: string
  readonly action?: string
  readonly status: 400 | 401 | 403 | 404 | 500
}

export type ActionResponse<T> =
  | { readonly success: true; readonly data: T }
  | { readonly success: false; readonly error: ActionError }

async function requireAuthorizedWorkspace(
  wIdStr: string,
  permission: Permission,
): Promise<
  | {
      readonly authorized: true
      readonly user: { readonly id: string; readonly email: string }
      readonly workspaceId: WorkspaceId
      readonly membership: Membership
    }
  | { readonly authorized: false; readonly response: ActionResponse<never> }
> {
  const session = await getServerSession()
  if (!session) {
    return {
      authorized: false,
      response: {
        success: false,
        error: {
          code: 'UNAUTHENTICATED',
          title: 'Authentication Required',
          detail: 'You must be signed in to perform this action.',
          action: 'Sign in and try again.',
          status: 401,
        },
      },
    }
  }

  const wIdParsed = workspaceIdSchema.safeParse(wIdStr)
  if (!wIdParsed.success) {
    return {
      authorized: false,
      response: {
        success: false,
        error: {
          code: 'INVALID_WORKSPACE_ID',
          title: 'Invalid Workspace',
          detail: 'The provided workspace identifier is malformed.',
          status: 400,
        },
      },
    }
  }

  const wId = wIdParsed.data
  const uId = userId(session.user.id)
  const reqId = requestId(`req-asset-${randomUUID().slice(0, 8)}`)

  const context = workspaceContext({
    workspaceId: wId,
    actorId: uId,
    requestId: reqId,
  })

  const db = getDatabase()
  const memberRow = await db.withWorkspace(context, (tx) =>
    workspaceMembers.findMemberByUserId({ tx, context }, uId),
  )

  if (!memberRow) {
    return {
      authorized: false,
      response: {
        success: false,
        error: {
          code: 'WORKSPACE_NOT_FOUND',
          title: 'Workspace Not Found',
          detail: 'The requested workspace was not found or you do not have access.',
          status: 404,
        },
      },
    }
  }

  const membership: Membership = {
    userId: uId,
    workspaceId: wId,
    role: memberRow.role,
  }

  const authz = authorise(membership, wId, permission)
  if (!authz.ok) {
    return {
      authorized: false,
      response: {
        success: false,
        error: {
          code: 'FORBIDDEN',
          title: 'Permission Denied',
          detail: `Your role (${memberRow.role}) does not grant permission to perform '${permission}'.`,
          status: 403,
        },
      },
    }
  }

  return {
    authorized: true,
    user: session.user,
    workspaceId: wId,
    membership,
  }
}

// ---------------------------------------------------------------------------
// Initiate Asset Upload
// ---------------------------------------------------------------------------

export type InitiateUploadResponse = {
  readonly assetId: string
  readonly uploadUrl: string
  readonly storageKey: string
  readonly headers: Readonly<Record<string, string>>
  readonly expiresAt: string
}

export async function initiateAssetUploadAction(
  wIdStr: string,
  input: {
    readonly filename: string
    readonly mimeType: string
    readonly byteSize: number
  },
): Promise<ActionResponse<InitiateUploadResponse>> {
  const auth = await requireAuthorizedWorkspace(wIdStr, 'product.create')
  if (!auth.authorized) return auth.response

  if (!input.filename.trim() || input.byteSize <= 0) {
    return {
      success: false,
      error: {
        code: 'INVALID_INPUT',
        title: 'Invalid File Details',
        detail: 'Filename must not be empty and file size must be greater than 0 bytes.',
        status: 400,
      },
    }
  }

  const newAssetId = assetId(randomUUID())
  const byteSizeBigInt = BigInt(input.byteSize)
  const storageService = getStorageService()

  try {
    const presigned = await storageService.initiateUpload({
      workspaceId: auth.workspaceId,
      assetId: newAssetId,
      filename: input.filename,
      mimeType: input.mimeType || 'application/octet-stream',
      byteSize: byteSizeBigInt,
    })

    const db = getDatabase()
    const reqId = requestId(`req-asset-init-${randomUUID().slice(0, 8)}`)
    const context = workspaceContext({
      workspaceId: auth.workspaceId,
      actorId: auth.membership.userId,
      requestId: reqId,
    })

    await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      await catalogue.createAsset(scope, {
        storageKey: presigned.storageKey,
        originalFilename: input.filename,
        mimeType: input.mimeType || 'application/octet-stream',
        byteSize: byteSizeBigInt,
        scanStatus: 'pending',
      })

      await auditLog.writeAuditLog(scope, auditOptions, {
        actorType: 'user',
        actorId: auth.membership.userId,
        action: 'asset.upload_initiated',
        targetType: 'asset',
        targetId: newAssetId,
        metadata: {
          filename: input.filename,
          byteSize: input.byteSize.toString(),
          storageKey: presigned.storageKey,
        },
      })
    })

    return {
      success: true,
      data: {
        assetId: newAssetId,
        uploadUrl: presigned.uploadUrl,
        storageKey: presigned.storageKey,
        headers: presigned.headers,
        expiresAt: presigned.expiresAt.toISOString(),
      },
    }
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'UPLOAD_INIT_FAILED',
        title: 'Failed to Initiate Upload',
        detail: err instanceof Error ? err.message : 'Storage error',
        status: 500,
      },
    }
  }
}

// ---------------------------------------------------------------------------
// Complete Asset Upload (Verify + Scan)
// ---------------------------------------------------------------------------

export type CompleteUploadResponse = {
  readonly assetId: string
  readonly scanStatus: 'pending' | 'clean' | 'infected' | 'skipped'
  readonly scanReason: string | null
  readonly filename: string
  readonly byteSize: string
}

export async function completeAssetUploadAction(
  wIdStr: string,
  assetIdStr: string,
  expectedByteSize: number,
  expectedMimeType: string,
): Promise<ActionResponse<CompleteUploadResponse>> {
  const auth = await requireAuthorizedWorkspace(wIdStr, 'product.create')
  if (!auth.authorized) return auth.response

  const aIdParsed = assetIdSchema.safeParse(assetIdStr)
  if (!aIdParsed.success) {
    return {
      success: false,
      error: {
        code: 'INVALID_ASSET_ID',
        title: 'Invalid Asset',
        detail: 'The provided asset identifier is malformed.',
        status: 400,
      },
    }
  }

  const db = getDatabase()
  const reqId = requestId(`req-asset-comp-${randomUUID().slice(0, 8)}`)
  const context = workspaceContext({
    workspaceId: auth.workspaceId,
    actorId: auth.membership.userId,
    requestId: reqId,
  })

  try {
    const asset = await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      return catalogue.findAssetById(scope, aIdParsed.data)
    })

    if (!asset) {
      return {
        success: false,
        error: {
          code: 'ASSET_NOT_FOUND',
          title: 'Asset Not Found',
          detail: 'The specified asset does not exist in this workspace.',
          status: 404,
        },
      }
    }

    const storageService = getStorageService()
    const verification = await storageService.verifyUpload(
      asset.storageKey,
      BigInt(expectedByteSize),
      expectedMimeType,
    )

    if (!verification.verified) {
      return {
        success: false,
        error: {
          code: 'VERIFICATION_FAILED',
          title: 'Asset Verification Failed',
          detail: verification.reason,
          status: 400,
        },
      }
    }

    // Perform Malware Scan
    const driver = getStorageDriver()
    const scanner = getMalwareScanner()
    const obj = await driver.getObject(asset.storageKey)

    let scanStatus: 'clean' | 'infected' | 'skipped' = 'clean'
    let scanReason: string | null = null

    if (obj) {
      const scanResult = await scanner.scanBuffer(obj.data)
      if (!scanResult.clean) {
        scanStatus = 'infected'
        scanReason = scanResult.threatName
      }
    }

    const updated: AssetRecord = await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const res = await catalogue.updateAssetScanStatus(scope, aIdParsed.data, {
        scanStatus,
        scanReason,
      })

      await auditLog.writeAuditLog(scope, auditOptions, {
        actorType: 'user',
        actorId: auth.membership.userId,
        action: 'asset.uploaded',
        targetType: 'asset',
        targetId: aIdParsed.data,
        metadata: {
          filename: res.originalFilename,
          scanStatus,
          scanReason: scanReason ?? undefined,
        },
      })

      return res
    })

    return {
      success: true,
      data: {
        assetId: updated.id,
        scanStatus: updated.scanStatus,
        scanReason: updated.scanReason,
        filename: updated.originalFilename,
        byteSize: updated.byteSize.toString(),
      },
    }
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'VERIFICATION_ERROR',
        title: 'Failed to Complete Asset Verification',
        detail: err instanceof Error ? err.message : 'Storage/verification error',
        status: 500,
      },
    }
  }
}

// ---------------------------------------------------------------------------
// List Workspace Assets
// ---------------------------------------------------------------------------

export type AssetSummaryDisplay = {
  readonly id: string
  readonly originalFilename: string
  readonly mimeType: string
  readonly byteSize: string
  readonly scanStatus: string
  readonly scanReason: string | null
  readonly createdAt: string
}

export async function listWorkspaceAssetsAction(
  wIdStr: string,
): Promise<ActionResponse<readonly AssetSummaryDisplay[]>> {
  const auth = await requireAuthorizedWorkspace(wIdStr, 'product.view')
  if (!auth.authorized) return auth.response

  const db = getDatabase()
  const reqId = requestId(`req-asset-list-${randomUUID().slice(0, 8)}`)
  const context = workspaceContext({
    workspaceId: auth.workspaceId,
    actorId: auth.membership.userId,
    requestId: reqId,
  })

  try {
    const assetsList = await db.withWorkspace(context, (tx) =>
      catalogue.listAssets({ tx, context }),
    )

    return {
      success: true,
      data: assetsList.map((a) => ({
        id: a.id,
        originalFilename: a.originalFilename,
        mimeType: a.mimeType,
        byteSize: a.byteSize.toString(),
        scanStatus: a.scanStatus,
        scanReason: a.scanReason,
        createdAt: a.createdAt.toISOString(),
      })),
    }
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'LIST_FAILED',
        title: 'Failed to List Assets',
        detail: err instanceof Error ? err.message : 'Database error',
        status: 500,
      },
    }
  }
}

// ---------------------------------------------------------------------------
// Attach Asset to Product
// ---------------------------------------------------------------------------

export async function attachProductAssetAction(
  wIdStr: string,
  productIdStr: string,
  assetIdStr: string,
  role: ProductAssetRole,
): Promise<ActionResponse<{ success: true }>> {
  const auth = await requireAuthorizedWorkspace(wIdStr, 'product.update')
  if (!auth.authorized) return auth.response

  const pIdParsed = productIdSchema.safeParse(productIdStr)
  const aIdParsed = assetIdSchema.safeParse(assetIdStr)
  const roleParsed = productAssetRoleSchema.safeParse(role)

  if (!pIdParsed.success || !aIdParsed.success || !roleParsed.success) {
    return {
      success: false,
      error: {
        code: 'INVALID_PARAMETERS',
        title: 'Invalid Attachment Data',
        detail: 'Product ID, Asset ID, or Role is invalid.',
        status: 400,
      },
    }
  }

  const db = getDatabase()
  const reqId = requestId(`req-asset-att-${randomUUID().slice(0, 8)}`)
  const context = workspaceContext({
    workspaceId: auth.workspaceId,
    actorId: auth.membership.userId,
    requestId: reqId,
  })

  try {
    await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const asset = await catalogue.findAssetById(scope, aIdParsed.data)
      if (!asset) {
        throw new Error('Asset not found')
      }

      if (role === 'deliverable') {
        assertAssetDeliverable(asset)
      }

      await catalogue.attachProductAsset(scope, {
        productId: pIdParsed.data,
        assetId: aIdParsed.data,
        role,
      })

      await auditLog.writeAuditLog(scope, auditOptions, {
        actorType: 'user',
        actorId: auth.membership.userId,
        action: 'product.asset_attached',
        targetType: 'product_asset',
        targetId: aIdParsed.data,
        metadata: {
          productId: pIdParsed.data,
          role,
        },
      })
    })

    return {
      success: true,
      data: { success: true },
    }
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'ATTACH_FAILED',
        title: 'Failed to Attach Asset',
        detail: err instanceof Error ? err.message : 'Database error',
        status: 400,
      },
    }
  }
}

// ---------------------------------------------------------------------------
// Detach Asset from Product
// ---------------------------------------------------------------------------

export async function detachProductAssetAction(
  wIdStr: string,
  productIdStr: string,
  assetIdStr: string,
): Promise<ActionResponse<{ success: true }>> {
  const auth = await requireAuthorizedWorkspace(wIdStr, 'product.update')
  if (!auth.authorized) return auth.response

  const pIdParsed = productIdSchema.safeParse(productIdStr)
  const aIdParsed = assetIdSchema.safeParse(assetIdStr)

  if (!pIdParsed.success || !aIdParsed.success) {
    return {
      success: false,
      error: {
        code: 'INVALID_PARAMETERS',
        title: 'Invalid Identifiers',
        detail: 'Product ID or Asset ID is invalid.',
        status: 400,
      },
    }
  }

  const db = getDatabase()
  const reqId = requestId(`req-asset-det-${randomUUID().slice(0, 8)}`)
  const context = workspaceContext({
    workspaceId: auth.workspaceId,
    actorId: auth.membership.userId,
    requestId: reqId,
  })

  try {
    await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      await catalogue.detachProductAsset(scope, pIdParsed.data, aIdParsed.data)

      await auditLog.writeAuditLog(scope, auditOptions, {
        actorType: 'user',
        actorId: auth.membership.userId,
        action: 'product.asset_detached',
        targetType: 'product_asset',
        targetId: aIdParsed.data,
        metadata: {
          productId: pIdParsed.data,
        },
      })
    })

    return {
      success: true,
      data: { success: true },
    }
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'DETACH_FAILED',
        title: 'Failed to Detach Asset',
        detail: err instanceof Error ? err.message : 'Database error',
        status: 500,
      },
    }
  }
}

// ---------------------------------------------------------------------------
// List Product Assets
// ---------------------------------------------------------------------------

export type ProductAssetDisplay = {
  readonly id: string
  readonly assetId: string
  readonly filename: string
  readonly mimeType: string
  readonly byteSize: string
  readonly role: string
  readonly scanStatus: string
  readonly position: number
}

export async function listProductAssetsAction(
  wIdStr: string,
  productIdStr: string,
): Promise<ActionResponse<readonly ProductAssetDisplay[]>> {
  const auth = await requireAuthorizedWorkspace(wIdStr, 'product.view')
  if (!auth.authorized) return auth.response

  const pIdParsed = productIdSchema.safeParse(productIdStr)
  if (!pIdParsed.success) {
    return {
      success: false,
      error: {
        code: 'INVALID_PRODUCT_ID',
        title: 'Invalid Product',
        detail: 'The provided product identifier is malformed.',
        status: 400,
      },
    }
  }

  const db = getDatabase()
  const reqId = requestId(`req-prod-assets-${randomUUID().slice(0, 8)}`)
  const context = workspaceContext({
    workspaceId: auth.workspaceId,
    actorId: auth.membership.userId,
    requestId: reqId,
  })

  try {
    const list = await db.withWorkspace(context, (tx) =>
      catalogue.listAssetsForProduct({ tx, context }, pIdParsed.data),
    )

    return {
      success: true,
      data: list.map((item) => ({
        id: item.productAsset.id,
        assetId: item.asset.id,
        filename: item.asset.originalFilename,
        mimeType: item.asset.mimeType,
        byteSize: item.asset.byteSize.toString(),
        role: item.productAsset.role,
        scanStatus: item.asset.scanStatus,
        position: item.productAsset.position,
      })),
    }
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'FETCH_FAILED',
        title: 'Failed to Load Product Assets',
        detail: err instanceof Error ? err.message : 'Database error',
        status: 500,
      },
    }
  }
}
