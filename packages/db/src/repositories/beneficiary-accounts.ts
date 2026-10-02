/**
 * Beneficiary Accounts Repository (Slice 11 §11.1).
 *
 * Responsibilities:
 * 1. Create and manage bank accounts and UPI IDs with tenant isolation.
 * 2. Set default disbursement accounts.
 * 3. Verify accounts and mask sensitive account numbers.
 */
import type { BeneficiaryAccountId, BeneficiaryAccountType, PayeeType } from '@creatorhub/contracts'
import { desc, eq } from 'drizzle-orm'

import type { RepositoryScope } from '../repository.js'
import { insertValues, scoped } from '../repository.js'
import { type BeneficiaryAccount, beneficiaryAccounts } from '../schema/index.js'

function maskAccountNumber(acc: string | null | undefined): string | null {
  if (!acc) return null
  const cleaned = acc.trim()
  if (cleaned.length <= 4) return cleaned
  return `••••••••${cleaned.slice(-4)}`
}

export type CreateBeneficiaryAccountData = {
  readonly payeeType: PayeeType
  readonly payeeId: string
  readonly accountHolderName: string
  readonly accountType: BeneficiaryAccountType
  readonly accountNumber?: string | undefined
  readonly ifscCode?: string | undefined
  readonly vpa?: string | undefined
  readonly isDefault?: boolean | undefined
}

export async function createBeneficiaryAccount(
  scope: RepositoryScope,
  data: CreateBeneficiaryAccountData,
): Promise<BeneficiaryAccount> {
  const masked = maskAccountNumber(data.accountNumber)

  if (data.isDefault) {
    // Clear other default flags for the same payee in this workspace
    await scope.tx
      .update(beneficiaryAccounts)
      .set({ isDefault: false, updatedAt: new Date() })
      .where(
        scoped(
          scope,
          beneficiaryAccounts,
          eq(beneficiaryAccounts.payeeType, data.payeeType),
          eq(beneficiaryAccounts.payeeId, data.payeeId),
        ),
      )
  }

  const [created] = await scope.tx
    .insert(beneficiaryAccounts)
    .values(
      insertValues(scope, {
        payeeType: data.payeeType,
        payeeId: data.payeeId,
        accountHolderName: data.accountHolderName.trim(),
        accountType: data.accountType,
        accountNumber: data.accountNumber?.trim() ?? null,
        maskedAccountNumber: masked,
        ifscCode: data.ifscCode?.trim().toUpperCase() ?? null,
        vpa: data.vpa?.trim().toLowerCase() ?? null,
        status: 'verified', // Verified on creation for validated inputs
        isDefault: data.isDefault ?? false,
        verifiedAt: new Date(),
      }),
    )
    .returning()

  if (!created) {
    throw new Error('Failed to create beneficiary account.')
  }

  return created
}

export async function findBeneficiaryAccountById(
  scope: RepositoryScope,
  id: BeneficiaryAccountId,
): Promise<BeneficiaryAccount | undefined> {
  const [account] = await scope.tx
    .select()
    .from(beneficiaryAccounts)
    .where(scoped(scope, beneficiaryAccounts, eq(beneficiaryAccounts.id, id)))
    .limit(1)

  return account
}

export async function listBeneficiaryAccounts(
  scope: RepositoryScope,
  params?: {
    readonly payeeType?: PayeeType | undefined
    readonly payeeId?: string | undefined
  },
): Promise<BeneficiaryAccount[]> {
  const conditions = []

  if (params?.payeeType) {
    conditions.push(eq(beneficiaryAccounts.payeeType, params.payeeType))
  }
  if (params?.payeeId) {
    conditions.push(eq(beneficiaryAccounts.payeeId, params.payeeId))
  }

  return scope.tx
    .select()
    .from(beneficiaryAccounts)
    .where(scoped(scope, beneficiaryAccounts, ...conditions))
    .orderBy(desc(beneficiaryAccounts.isDefault), desc(beneficiaryAccounts.createdAt))
}

export async function setDefaultBeneficiaryAccount(
  scope: RepositoryScope,
  id: BeneficiaryAccountId,
): Promise<BeneficiaryAccount | undefined> {
  const target = await findBeneficiaryAccountById(scope, id)
  if (!target) return undefined

  await scope.tx
    .update(beneficiaryAccounts)
    .set({ isDefault: false, updatedAt: new Date() })
    .where(
      scoped(
        scope,
        beneficiaryAccounts,
        eq(beneficiaryAccounts.payeeType, target.payeeType),
        eq(beneficiaryAccounts.payeeId, target.payeeId),
      ),
    )

  const [updated] = await scope.tx
    .update(beneficiaryAccounts)
    .set({ isDefault: true, updatedAt: new Date() })
    .where(scoped(scope, beneficiaryAccounts, eq(beneficiaryAccounts.id, id)))
    .returning()

  return updated
}

export async function deleteBeneficiaryAccount(
  scope: RepositoryScope,
  id: BeneficiaryAccountId,
): Promise<boolean> {
  const deleted = await scope.tx
    .delete(beneficiaryAccounts)
    .where(scoped(scope, beneficiaryAccounts, eq(beneficiaryAccounts.id, id)))
    .returning({ id: beneficiaryAccounts.id })

  return deleted.length > 0
}
