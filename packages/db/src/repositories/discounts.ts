/**
 * Discounts repository — tenant-scoped discount coupons and product restrictions (Implementation Plan §3.6).
 *
 * Responsibilities:
 * 1. Create, find, and list discounts scoped to workspace.
 * 2. Increment discount usage atomically.
 * 3. Bind and query product restrictions for discounts.
 *
 * Invariants:
 * Multi-tenancy: Every query is filtered by workspaceId via RepositoryScope and Postgres RLS.
 * Codes: Unique per workspace.
 */
import {
  type CreateDiscountInput,
  type DiscountId,
  type ProductId,
  discountId,
  productId,
} from '@creatorhub/contracts'
import { and, desc, eq, sql } from 'drizzle-orm'

import type { RepositoryScope } from '../repository.js'
import { insertValues, scoped } from '../repository.js'
import {
  type DiscountRecord,
  type NewDiscountProductRecord,
  type NewDiscountRecord,
  discountProducts,
  discounts,
} from '../schema/discounts.js'

/**
 * Creates a new discount coupon for the current workspace.
 */
export async function createDiscount(
  scope: RepositoryScope,
  input: CreateDiscountInput,
): Promise<DiscountRecord> {
  const [created] = await scope.tx
    .insert(discounts)
    .values(
      insertValues<NewDiscountRecord>(scope, {
        code: input.code.trim().toUpperCase(),
        discountType: input.discountType,
        discountValue: input.discountValue,
        currency: input.currency ?? null,
        maxUses: input.maxUses ?? null,
        usesCount: 0,
        startsAt: input.startsAt ?? null,
        expiresAt: input.expiresAt ?? null,
        minOrderAmount: input.minOrderAmount ?? null,
        isActive: input.isActive ?? true,
      }),
    )
    .returning()

  if (!created) {
    throw new Error(`Failed to create discount with code '${input.code}'`)
  }

  // If specific products are restricted to this discount, bind them
  if (input.productIds && input.productIds.length > 0) {
    await bindProductsToDiscount(scope, discountId(created.id), input.productIds)
  }

  return created
}

/**
 * Finds a discount by its unique UUIDv7 id within the current workspace.
 */
export async function findDiscountById(
  scope: RepositoryScope,
  id: DiscountId,
): Promise<DiscountRecord | null> {
  const [row] = await scope.tx
    .select()
    .from(discounts)
    .where(scoped(scope, discounts, eq(discounts.id, id)))

  return row ?? null
}

/**
 * Finds an active discount by its coupon code within the current workspace.
 */
export async function findDiscountByCode(
  scope: RepositoryScope,
  code: string,
): Promise<DiscountRecord | null> {
  const normalized = code.trim().toUpperCase()

  const [row] = await scope.tx
    .select()
    .from(discounts)
    .where(scoped(scope, discounts, eq(discounts.code, normalized)))

  return row ?? null
}

/**
 * Lists all discounts in the current workspace with optional status filtering.
 */
export async function listDiscounts(
  scope: RepositoryScope,
  filters?: { readonly isActive?: boolean | undefined },
): Promise<DiscountRecord[]> {
  const conditions = []

  if (filters?.isActive !== undefined) {
    conditions.push(eq(discounts.isActive, filters.isActive))
  }

  const query = scope.tx
    .select()
    .from(discounts)
    .where(scoped(scope, discounts, conditions.length > 0 ? and(...conditions) : undefined))
    .orderBy(desc(discounts.createdAt))

  return query
}

/**
 * Atomically increments the usage counter for a discount.
 */
export async function incrementDiscountUsage(
  scope: RepositoryScope,
  id: DiscountId,
): Promise<DiscountRecord> {
  const [row] = await scope.tx
    .update(discounts)
    .set({
      usesCount: sql`${discounts.usesCount} + 1`,
      updatedAt: new Date(),
    })
    .where(scoped(scope, discounts, eq(discounts.id, id)))
    .returning()

  if (!row) {
    throw new Error(`Discount ${id} not found or not accessible to tenant.`)
  }

  return row
}

/**
 * Binds a list of restricted product IDs to a discount.
 */
export async function bindProductsToDiscount(
  scope: RepositoryScope,
  discount_id: DiscountId,
  product_ids: readonly ProductId[],
): Promise<void> {
  if (product_ids.length === 0) return

  for (const pId of product_ids) {
    await scope.tx
      .insert(discountProducts)
      .values(
        insertValues<NewDiscountProductRecord>(scope, {
          discountId: discount_id,
          productId: pId,
        }),
      )
      .onConflictDoNothing()
  }
}

/**
 * Retrieves the list of restricted product IDs for a discount.
 */
export async function listApplicableProductIdsForDiscount(
  scope: RepositoryScope,
  discount_id: DiscountId,
): Promise<ProductId[]> {
  const rows = await scope.tx
    .select({ productId: discountProducts.productId })
    .from(discountProducts)
    .where(scoped(scope, discountProducts, eq(discountProducts.discountId, discount_id)))

  return rows.map((r) => productId(r.productId))
}
