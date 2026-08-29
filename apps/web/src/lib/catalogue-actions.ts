'use server'

/**
 * Server Actions for Product Catalogue, Variants, and Publishing (Implementation Plan §3.7).
 *
 * Responsibilities:
 * - Validate input schemas and pricing invariants
 * - Check authentication and RBAC authorization via @creatorhub/domain policy module
 * - Enforce RLS tenant isolation using @creatorhub/db
 * - Append audit logs for catalogue state mutations (product.created, product.updated, product.published)
 * - Safe error handling and sanitization
 */
import { randomUUID } from 'node:crypto'
import {
  type CreateProductInput,
  type CreateVariantInput,
  type UpdateProductInput,
  type WorkspaceId,
  createProductInputSchema,
  createVariantInputSchema,
  productIdSchema,
  requestId,
  updateProductInputSchema,
  userId,
  workspaceContext,
  workspaceIdSchema,
} from '@creatorhub/contracts'
import { auditLog, catalogue, workspaceMembers, workspaces } from '@creatorhub/db'
import {
  authorise,
  can,
  validateProductPricing,
  type Membership,
  type Permission,
} from '@creatorhub/domain'

import { getDatabase } from './db'
import { getServerSession } from './server-session'

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
  const reqId = requestId(`req-cat-${randomUUID().slice(0, 8)}`)

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
// Create Product
// ---------------------------------------------------------------------------

export async function createProductAction(
  wIdStr: string,
  input: Omit<CreateProductInput, 'workspaceId'>,
): Promise<ActionResponse<{ productId: string; slug: string }>> {
  const auth = await requireAuthorizedWorkspace(wIdStr, 'product.create')
  if (!auth.authorized) return auth.response

  const parsed = createProductInputSchema.safeParse({
    ...input,
    workspaceId: auth.workspaceId,
  })

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        title: 'Invalid Product Data',
        detail: parsed.error.issues[0]?.message ?? 'Validation failed',
        status: 400,
      },
    }
  }

  try {
    validateProductPricing(parsed.data.currency, parsed.data.basePrice, parsed.data.compareAtPrice)
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'INVALID_PRICING',
        title: 'Invalid Pricing Configuration',
        detail: err instanceof Error ? err.message : 'Invalid pricing rules',
        status: 400,
      },
    }
  }

  const db = getDatabase()
  const reqId = requestId(`req-prod-create-${randomUUID().slice(0, 8)}`)
  const context = workspaceContext({
    workspaceId: auth.workspaceId,
    actorId: auth.membership.userId,
    requestId: reqId,
  })

  try {
    const product = await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const created = await catalogue.createProduct(scope, parsed.data)

      await auditLog.writeAuditLog(scope, auditOptions, {
        actorType: 'user',
        actorId: auth.membership.userId,
        action: 'product.created',
        targetType: 'product',
        targetId: created.id,
        metadata: {
          title: created.title,
          slug: created.slug,
          currency: created.currency,
          basePrice: created.basePrice.toString(),
        },
      })

      return created
    })

    return {
      success: true,
      data: {
        productId: product.id,
        slug: product.slug,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'CREATE_FAILED',
        title: 'Failed to Create Product',
        detail: err instanceof Error ? err.message : 'Database error',
        status: 500,
      },
    }
  }
}

// ---------------------------------------------------------------------------
// Update Product
// ---------------------------------------------------------------------------

export async function updateProductAction(
  wIdStr: string,
  pIdStr: string,
  input: UpdateProductInput,
): Promise<ActionResponse<{ productId: string; title: string; status: string }>> {
  const auth = await requireAuthorizedWorkspace(wIdStr, 'product.update')
  if (!auth.authorized) return auth.response

  const pIdParsed = productIdSchema.safeParse(pIdStr)
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

  const parsed = updateProductInputSchema.safeParse(input)
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        title: 'Invalid Update Data',
        detail: parsed.error.issues[0]?.message ?? 'Validation failed',
        status: 400,
      },
    }
  }

  const db = getDatabase()
  const reqId = requestId(`req-prod-update-${randomUUID().slice(0, 8)}`)
  const context = workspaceContext({
    workspaceId: auth.workspaceId,
    actorId: auth.membership.userId,
    requestId: reqId,
  })

  try {
    const updated = await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const res = await catalogue.updateProduct(scope, pIdParsed.data, parsed.data)

      await auditLog.writeAuditLog(scope, auditOptions, {
        actorType: 'user',
        actorId: auth.membership.userId,
        action: 'product.updated',
        targetType: 'product',
        targetId: res.id,
        metadata: {
          title: res.title,
          status: res.status,
          visibility: res.visibility,
        },
      })

      return res
    })

    return {
      success: true,
      data: {
        productId: updated.id,
        title: updated.title,
        status: updated.status,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'UPDATE_FAILED',
        title: 'Failed to Update Product',
        detail: err instanceof Error ? err.message : 'Database error',
        status: 500,
      },
    }
  }
}

// ---------------------------------------------------------------------------
// Create Product Variant
// ---------------------------------------------------------------------------

export async function createVariantAction(
  wIdStr: string,
  pIdStr: string,
  input: Omit<CreateVariantInput, 'workspaceId' | 'productId'>,
): Promise<ActionResponse<{ variantId: string; title: string }>> {
  const auth = await requireAuthorizedWorkspace(wIdStr, 'product.update')
  if (!auth.authorized) return auth.response

  const pIdParsed = productIdSchema.safeParse(pIdStr)
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

  const parsed = createVariantInputSchema.safeParse({
    ...input,
    workspaceId: auth.workspaceId,
    productId: pIdParsed.data,
  })

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: 'VALIDATION_FAILED',
        title: 'Invalid Variant Data',
        detail: parsed.error.issues[0]?.message ?? 'Validation failed',
        status: 400,
      },
    }
  }

  const db = getDatabase()
  const reqId = requestId(`req-var-create-${randomUUID().slice(0, 8)}`)
  const context = workspaceContext({
    workspaceId: auth.workspaceId,
    actorId: auth.membership.userId,
    requestId: reqId,
  })

  try {
    const variant = await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const res = await catalogue.createVariant(scope, parsed.data)

      await auditLog.writeAuditLog(scope, auditOptions, {
        actorType: 'user',
        actorId: auth.membership.userId,
        action: 'product.variant_created',
        targetType: 'product_variant',
        targetId: res.id,
        metadata: {
          productId: res.productId,
          title: res.title,
          sku: res.sku ?? undefined,
        },
      })

      return res
    })

    return {
      success: true,
      data: {
        variantId: variant.id,
        title: variant.title,
      },
    }
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'VARIANT_CREATE_FAILED',
        title: 'Failed to Create Variant',
        detail: err instanceof Error ? err.message : 'Database error',
        status: 500,
      },
    }
  }
}

// ---------------------------------------------------------------------------
// Publish Product
// ---------------------------------------------------------------------------

export async function publishProductAction(
  wIdStr: string,
  pIdStr: string,
): Promise<ActionResponse<{ productId: string; status: 'published' }>> {
  const auth = await requireAuthorizedWorkspace(wIdStr, 'product.publish')
  if (!auth.authorized) return auth.response

  const pIdParsed = productIdSchema.safeParse(pIdStr)
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
  const reqId = requestId(`req-prod-pub-${randomUUID().slice(0, 8)}`)
  const context = workspaceContext({
    workspaceId: auth.workspaceId,
    actorId: auth.membership.userId,
    requestId: reqId,
  })

  try {
    const updated = await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const existing = await catalogue.findProductById(scope, pIdParsed.data)

      if (!existing) {
        throw new Error('Product not found')
      }

      const res = await catalogue.updateProduct(scope, pIdParsed.data, {
        status: 'published',
      })

      await auditLog.writeAuditLog(scope, auditOptions, {
        actorType: 'user',
        actorId: auth.membership.userId,
        action: 'product.published',
        targetType: 'product',
        targetId: res.id,
        metadata: {
          title: res.title,
          slug: res.slug,
        },
      })

      return res
    })

    return {
      success: true,
      data: {
        productId: updated.id,
        status: 'published',
      },
    }
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'PUBLISH_FAILED',
        title: 'Failed to Publish Product',
        detail: err instanceof Error ? err.message : 'Database error',
        status: 500,
      },
    }
  }
}

// ---------------------------------------------------------------------------
// Query: Product List View Data
// ---------------------------------------------------------------------------

export type ProductSummaryDisplay = {
  readonly id: string
  readonly title: string
  readonly slug: string
  readonly status: string
  readonly visibility: string
  readonly currency: string
  readonly basePrice: string
  readonly compareAtPrice: string | null
  readonly createdAt: string
  readonly updatedAt: string
}

export type ProductListData = {
  readonly workspace: {
    readonly id: string
    readonly name: string
    readonly slug: string
    readonly defaultCurrency: string
  }
  readonly products: readonly ProductSummaryDisplay[]
  readonly canCreate: boolean
  readonly canPublish: boolean
}

export async function getProductListDataAction(
  wIdStr: string,
): Promise<ActionResponse<ProductListData>> {
  const auth = await requireAuthorizedWorkspace(wIdStr, 'product.view')
  if (!auth.authorized) return auth.response

  const db = getDatabase()
  const reqId = requestId(`req-prod-list-${randomUUID().slice(0, 8)}`)
  const context = workspaceContext({
    workspaceId: auth.workspaceId,
    actorId: auth.membership.userId,
    requestId: reqId,
  })

  try {
    const data = await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const wsRow = await workspaces.findCurrentWorkspace(scope)
      if (!wsRow) {
        throw new Error('Workspace not found')
      }

      const productsList = await catalogue.listProducts(scope)

      return {
        workspace: {
          id: wsRow.id,
          name: wsRow.name,
          slug: wsRow.slug,
          defaultCurrency: wsRow.defaultCurrency,
        },
        products: productsList.map((p) => ({
          id: p.id,
          title: p.title,
          slug: p.slug,
          status: p.status,
          visibility: p.visibility,
          currency: p.currency,
          basePrice: p.basePrice.toString(),
          compareAtPrice: p.compareAtPrice !== null ? p.compareAtPrice.toString() : null,
          createdAt: p.createdAt.toISOString(),
          updatedAt: p.updatedAt.toISOString(),
        })),
        canCreate: can(auth.membership.role, 'product.create'),
        canPublish: can(auth.membership.role, 'product.publish'),
      }
    })

    return {
      success: true,
      data,
    }
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'FETCH_FAILED',
        title: 'Failed to Load Products',
        detail: err instanceof Error ? err.message : 'Database error',
        status: 500,
      },
    }
  }
}

// ---------------------------------------------------------------------------
// Query: Product Detail View Data
// ---------------------------------------------------------------------------

export type VariantDisplay = {
  readonly id: string
  readonly title: string
  readonly sku: string | null
  readonly priceOverride: string | null
  readonly position: number
  readonly inventoryPolicy: string
  readonly inventoryQuantity: number
  readonly isActive: boolean
}

export type ProductDetailData = {
  readonly workspace: {
    readonly id: string
    readonly name: string
    readonly slug: string
    readonly defaultCurrency: string
  }
  readonly product: ProductSummaryDisplay & { readonly description: string | null }
  readonly variants: readonly VariantDisplay[]
  readonly canUpdate: boolean
  readonly canPublish: boolean
}

export async function getProductDetailDataAction(
  wIdStr: string,
  pIdStr: string,
): Promise<ActionResponse<ProductDetailData>> {
  const auth = await requireAuthorizedWorkspace(wIdStr, 'product.view')
  if (!auth.authorized) return auth.response

  const pIdParsed = productIdSchema.safeParse(pIdStr)
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
  const reqId = requestId(`req-prod-detail-${randomUUID().slice(0, 8)}`)
  const context = workspaceContext({
    workspaceId: auth.workspaceId,
    actorId: auth.membership.userId,
    requestId: reqId,
  })

  try {
    const data = await db.withWorkspace(context, async (tx) => {
      const scope = { tx, context }
      const wsRow = await workspaces.findCurrentWorkspace(scope)
      if (!wsRow) {
        throw new Error('Workspace not found')
      }

      const product = await catalogue.findProductById(scope, pIdParsed.data)
      if (!product) {
        throw new Error('Product not found')
      }

      const variants = await catalogue.listVariantsForProduct(scope, pIdParsed.data)

      return {
        workspace: {
          id: wsRow.id,
          name: wsRow.name,
          slug: wsRow.slug,
          defaultCurrency: wsRow.defaultCurrency,
        },
        product: {
          id: product.id,
          title: product.title,
          slug: product.slug,
          description: product.description,
          status: product.status,
          visibility: product.visibility,
          currency: product.currency,
          basePrice: product.basePrice.toString(),
          compareAtPrice:
            product.compareAtPrice !== null ? product.compareAtPrice.toString() : null,
          createdAt: product.createdAt.toISOString(),
          updatedAt: product.updatedAt.toISOString(),
        },
        variants: variants.map((v) => ({
          id: v.id,
          title: v.title,
          sku: v.sku,
          priceOverride: v.priceOverride !== null ? v.priceOverride.toString() : null,
          position: v.position,
          inventoryPolicy: v.inventoryPolicy,
          inventoryQuantity: v.inventoryQuantity,
          isActive: v.isActive,
        })),
        canUpdate: can(auth.membership.role, 'product.update'),
        canPublish: can(auth.membership.role, 'product.publish'),
      }
    })

    return {
      success: true,
      data,
    }
  } catch (err) {
    return {
      success: false,
      error: {
        code: 'FETCH_FAILED',
        title: 'Failed to Load Product Details',
        detail: err instanceof Error ? err.message : 'Database error',
        status: 500,
      },
    }
  }
}
