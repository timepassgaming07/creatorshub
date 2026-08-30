/**
 * Customer Contracts & Domain Models (Slice 7 §7.1).
 *
 * Responsibilities:
 * 1. Define customer entity types, input schemas, and aggregation summaries.
 * 2. Confine Customer PII (name, email, phone) to the customer entity.
 * 3. Enforce branded CustomerId identifier.
 */
import type { CustomerId, WorkspaceId } from './identifiers.js'

export type CustomerStatus = 'active' | 'archived'

export type Customer = {
  readonly id: CustomerId
  readonly workspaceId: WorkspaceId
  readonly email: string
  readonly name: string | null
  readonly phone: string | null
  readonly totalSpend: bigint
  readonly ordersCount: number
  readonly firstSeenAt: Date
  readonly lastSeenAt: Date
  readonly metadata: Readonly<Record<string, unknown>>
  readonly createdAt: Date
  readonly updatedAt: Date
}

export type CreateCustomerInput = {
  readonly email: string
  readonly name?: string | null | undefined
  readonly phone?: string | null | undefined
  readonly metadata?: Readonly<Record<string, unknown>> | undefined
}

export type UpdateCustomerInput = {
  readonly name?: string | null | undefined
  readonly phone?: string | null | undefined
  readonly metadata?: Readonly<Record<string, unknown>> | undefined
}

export type CustomerFilter = {
  readonly query?: string | undefined
  readonly minSpend?: bigint | undefined
  readonly fromDate?: Date | undefined
  readonly toDate?: Date | undefined
  readonly limit?: number | undefined
  readonly offset?: number | undefined
}

export type CustomerSummary = {
  readonly totalCustomers: number
  readonly totalLifetimeValue: bigint
  readonly averageOrderValue: bigint
  readonly repeatCustomersCount: number
}
