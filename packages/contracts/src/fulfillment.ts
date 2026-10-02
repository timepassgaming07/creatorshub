/**
 * Digital fulfillment and entitlement contracts (@creatorhub/contracts).
 *
 * Responsibilities:
 * - Define entitlement proof-of-purchase lifecycle states (active, revoked, suspended).
 * - Define time-limited, count-capped download grants stored hashed.
 * - Define download audit event structures.
 * - Independent of order status: entitlement is the single source of truth for file access.
 */
import { z } from 'zod'
import {
  assetIdSchema,
  downloadEventIdSchema,
  downloadGrantIdSchema,
  entitlementIdSchema,
  orderIdSchema,
  productIdSchema,
  workspaceIdSchema,
} from './identifiers.js'
import type {
  AssetId,
  DownloadEventId,
  DownloadGrantId,
  EntitlementId,
  OrderId,
  ProductId,
  WorkspaceId,
} from './identifiers.js'

export const ENTITLEMENT_STATUSES = ['active', 'revoked', 'suspended'] as const
export type EntitlementStatus = (typeof ENTITLEMENT_STATUSES)[number]

export const entitlementStatusSchema = z.enum(ENTITLEMENT_STATUSES)

/**
 * Entitlement entity record schema.
 */
export const entitlementRecordSchema = z.object({
  id: entitlementIdSchema,
  workspaceId: workspaceIdSchema,
  orderId: orderIdSchema,
  productId: productIdSchema,
  customerEmail: z.email(),
  status: entitlementStatusSchema,
  grantedAt: z.date(),
  revokedAt: z.date().nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type EntitlementRecord = {
  readonly id: EntitlementId
  readonly workspaceId: WorkspaceId
  readonly orderId: OrderId
  readonly productId: ProductId
  readonly customerEmail: string
  readonly status: EntitlementStatus
  readonly grantedAt: Date
  readonly revokedAt?: Date | null
  readonly metadata: Record<string, unknown>
  readonly createdAt: Date
  readonly updatedAt: Date
}

/**
 * Input for creating a new entitlement.
 */
export const createEntitlementInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  orderId: orderIdSchema,
  productId: productIdSchema,
  customerEmail: z.email(),
  status: entitlementStatusSchema.default('active'),
  metadata: z.record(z.string(), z.unknown()).optional(),
})

export type CreateEntitlementInput = z.infer<typeof createEntitlementInputSchema>

/**
 * Download Grant entity record schema.
 * Note: Raw token is never stored in DB. tokenHash is SHA-256 hex string.
 */
export const downloadGrantRecordSchema = z.object({
  id: downloadGrantIdSchema,
  workspaceId: workspaceIdSchema,
  entitlementId: entitlementIdSchema,
  assetId: assetIdSchema,
  tokenHash: z.string().min(64).max(64),
  maxDownloads: z.number().int().min(1).default(5),
  downloadCount: z.number().int().min(0).default(0),
  expiresAt: z.date(),
  createdAt: z.date(),
  updatedAt: z.date(),
})

export type DownloadGrantRecord = {
  readonly id: DownloadGrantId
  readonly workspaceId: WorkspaceId
  readonly entitlementId: EntitlementId
  readonly assetId: AssetId
  readonly tokenHash: string
  readonly maxDownloads: number
  readonly downloadCount: number
  readonly expiresAt: Date
  readonly createdAt: Date
  readonly updatedAt: Date
}

/**
 * Input for creating a download grant.
 */
export const createDownloadGrantInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  entitlementId: entitlementIdSchema,
  assetId: assetIdSchema,
  tokenHash: z.string().min(64).max(64),
  maxDownloads: z.number().int().min(1).default(5),
  expiresAt: z.date(),
})

export type CreateDownloadGrantInput = z.infer<typeof createDownloadGrantInputSchema>

/**
 * Download Event entity record schema.
 */
export const downloadEventRecordSchema = z.object({
  id: downloadEventIdSchema,
  workspaceId: workspaceIdSchema,
  downloadGrantId: downloadGrantIdSchema,
  ipHash: z.string().nullable().optional(),
  userAgent: z.string().nullable().optional(),
  downloadedAt: z.date(),
})

export type DownloadEventRecord = {
  readonly id: DownloadEventId
  readonly workspaceId: WorkspaceId
  readonly downloadGrantId: DownloadGrantId
  readonly ipHash?: string | null
  readonly userAgent?: string | null
  readonly downloadedAt: Date
}

/**
 * Input for recording a download event.
 */
export const recordDownloadEventInputSchema = z.object({
  workspaceId: workspaceIdSchema,
  downloadGrantId: downloadGrantIdSchema,
  ipHash: z.string().optional().nullable(),
  userAgent: z.string().optional().nullable(),
})

export type RecordDownloadEventInput = z.infer<typeof recordDownloadEventInputSchema>
