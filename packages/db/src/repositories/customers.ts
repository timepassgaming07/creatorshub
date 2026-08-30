/**
 * Customers Repository (Slice 7 §7.1, §7.2).
 *
 * Responsibilities:
 * 1. Upsert customer records upon checkout / order creation, tracking lifetime spend & order counts.
 * 2. Scoped multi-tenant queries for customer profile, search, and lifetime metrics.
 * 3. Enforce tenant isolation via scoped(scope, customers, ...) on all database operations.
 */
import {
  type CustomerFilter,
  type CustomerId,
  type CustomerSummary,
  type WorkspaceId,
} from '@creatorhub/contracts'
import { and, desc, eq, gte, ilike, lte, or, sql } from 'drizzle-orm'

import { insertValues, scoped, type RepositoryScope } from '../repository.js'
import { customers, type CustomerRecord, type NewCustomerRecord } from '../schema/customers.js'

export type { CustomerRecord, NewCustomerRecord }

export type UpsertCustomerInput = {
  readonly email: string
  readonly name?: string | null | undefined
  readonly phone?: string | null | undefined
  readonly metadata?: Readonly<Record<string, unknown>> | undefined
  readonly incrementSpend?: bigint | undefined
  readonly incrementOrders?: number | undefined
}

export type UpdateCustomerRecordInput = {
  readonly name?: string | null | undefined
  readonly phone?: string | null | undefined
  readonly metadata?: Readonly<Record<string, unknown>> | undefined
}

/**
 * Upserts a customer within the scoped workspace.
 * If the customer already exists, increments their spend and order counts.
 */
export async function upsertCustomer(
  scope: RepositoryScope,
  input: UpsertCustomerInput,
): Promise<CustomerRecord> {
  const normalizedEmail = input.email.trim().toLowerCase()

  const existing = await findCustomerByEmail(scope, normalizedEmail)

  if (existing) {
    const updatedSpend = existing.totalSpend + (input.incrementSpend ?? 0n)
    const updatedOrders = existing.ordersCount + (input.incrementOrders ?? 0)
    const mergedMetadata = input.metadata
      ? { ...existing.metadata, ...input.metadata }
      : existing.metadata

    const [updated] = await scope.tx
      .update(customers)
      .set({
        ...(input.name !== undefined && input.name !== null && { name: input.name }),
        ...(input.phone !== undefined && input.phone !== null && { phone: input.phone }),
        totalSpend: updatedSpend,
        ordersCount: updatedOrders,
        metadata: mergedMetadata,
        lastSeenAt: new Date(),
        updatedAt: new Date(),
      })
      .where(scoped(scope, customers, eq(customers.id, existing.id)))
      .returning()

    if (!updated) {
      throw new Error(`Failed to update customer ${existing.id}`)
    }

    return updated
  }

  const [created] = await scope.tx
    .insert(customers)
    .values(
      insertValues<NewCustomerRecord>(scope, {
        email: normalizedEmail,
        name: input.name ?? null,
        phone: input.phone ?? null,
        metadata: (input.metadata ?? {}) as Record<string, unknown>,
        totalSpend: input.incrementSpend ?? 0n,
        ordersCount: input.incrementOrders ?? (input.incrementSpend ? 1 : 0),
        firstSeenAt: new Date(),
        lastSeenAt: new Date(),
      }),
    )
    .returning()

  if (!created) {
    throw new Error(`Failed to create customer for email '${normalizedEmail}'`)
  }

  return created
}

/**
 * Finds a customer by ID within the current workspace.
 */
export async function findCustomerById(
  scope: RepositoryScope,
  id: CustomerId,
): Promise<CustomerRecord | null> {
  const [record] = await scope.tx
    .select()
    .from(customers)
    .where(scoped(scope, customers, eq(customers.id, id)))
    .limit(1)

  return record ?? null
}

/**
 * Finds a customer by case-insensitive email within the current workspace.
 */
export async function findCustomerByEmail(
  scope: RepositoryScope,
  email: string,
): Promise<CustomerRecord | null> {
  const normalizedEmail = email.trim().toLowerCase()

  const [record] = await scope.tx
    .select()
    .from(customers)
    .where(scoped(scope, customers, eq(customers.email, normalizedEmail)))
    .limit(1)

  return record ?? null
}

/**
 * Lists customers within the current workspace matching optional search & spend filters.
 */
export async function listCustomers(
  scope: RepositoryScope,
  filter: CustomerFilter = {},
): Promise<CustomerRecord[]> {
  const conditions = []

  if (filter.query && filter.query.trim().length > 0) {
    const term = `%${filter.query.trim()}%`
    conditions.push(or(ilike(customers.email, term), ilike(customers.name, term)))
  }

  if (filter.minSpend !== undefined && filter.minSpend > 0n) {
    conditions.push(gte(customers.totalSpend, filter.minSpend))
  }

  if (filter.fromDate) {
    conditions.push(gte(customers.createdAt, filter.fromDate))
  }

  if (filter.toDate) {
    conditions.push(lte(customers.createdAt, filter.toDate))
  }

  const query = scope.tx
    .select()
    .from(customers)
    .where(scoped(scope, customers, ...conditions))
    .orderBy(desc(customers.lastSeenAt))
    .limit(filter.limit ?? 50)
    .offset(filter.offset ?? 0)

  return await query
}

/**
 * Counts total customers matching filters in the current workspace.
 */
export async function countCustomers(
  scope: RepositoryScope,
  filter: CustomerFilter = {},
): Promise<number> {
  const conditions = []

  if (filter.query && filter.query.trim().length > 0) {
    const term = `%${filter.query.trim()}%`
    conditions.push(or(ilike(customers.email, term), ilike(customers.name, term)))
  }

  if (filter.minSpend !== undefined && filter.minSpend > 0n) {
    conditions.push(gte(customers.totalSpend, filter.minSpend))
  }

  if (filter.fromDate) {
    conditions.push(gte(customers.createdAt, filter.fromDate))
  }

  if (filter.toDate) {
    conditions.push(lte(customers.createdAt, filter.toDate))
  }

  const [row] = await scope.tx
    .select({ count: sql<number>`count(*)::int` })
    .from(customers)
    .where(scoped(scope, customers, ...conditions))

  return row?.count ?? 0
}

/**
 * Aggregates workspace customer metrics (LTV, total buyers, repeat buyers).
 */
export async function getCustomerSummary(scope: RepositoryScope): Promise<CustomerSummary> {
  const [row] = await scope.tx
    .select({
      totalCustomers: sql<number>`count(*)::int`,
      totalLifetimeValue: sql<string>`coalesce(sum(${customers.totalSpend}), 0)::text`,
      repeatCustomersCount: sql<number>`count(case when ${customers.ordersCount} > 1 then 1 end)::int`,
    })
    .from(customers)
    .where(scoped(scope, customers))

  const totalCustomers = row?.totalCustomers ?? 0
  const totalLifetimeValue = BigInt(row?.totalLifetimeValue ?? '0')
  const repeatCustomersCount = row?.repeatCustomersCount ?? 0
  const averageOrderValue =
    totalCustomers > 0 ? totalLifetimeValue / BigInt(totalCustomers) : 0n

  return {
    totalCustomers,
    totalLifetimeValue,
    averageOrderValue,
    repeatCustomersCount,
  }
}

/**
 * Updates a customer profile (name, phone, metadata).
 */
export async function updateCustomer(
  scope: RepositoryScope,
  id: CustomerId,
  input: UpdateCustomerRecordInput,
): Promise<CustomerRecord> {
  const [updated] = await scope.tx
    .update(customers)
    .set({
      ...(input.name !== undefined && { name: input.name }),
      ...(input.phone !== undefined && { phone: input.phone }),
      ...(input.metadata !== undefined && { metadata: input.metadata as Record<string, unknown> }),
      updatedAt: new Date(),
    })
    .where(scoped(scope, customers, eq(customers.id, id)))
    .returning()

  if (!updated) {
    throw new Error(`Customer ${id} not found or not accessible to tenant`)
  }

  return updated
}
