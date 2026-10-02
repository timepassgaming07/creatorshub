/**
 * Operator command for settling money by hand: creator withdrawals and
 * affiliate commissions.
 *
 * CreatorHub does not move money out automatically yet (ADR-0021). An
 * operator sends each payment from the platform's bank account by IMPS or UPI,
 * then records it here with the bank's reference (UTR). Every command works
 * inside one workspace, through the same tenant-scoped database role as the
 * app, so row-level security applies exactly as it does to a request.
 *
 *   pnpm operator payouts         --workspace <id>
 *   pnpm operator payout-sent     --workspace <id> --payout <id> --utr <ref>
 *   pnpm operator payout-failed   --workspace <id> --payout <id> --reason "<text>"
 *   pnpm operator affiliates      --workspace <id>
 *   pnpm operator affiliate-paid  --workspace <id> --affiliate <id> --utr <ref>
 */
/* eslint-disable no-console -- a command-line tool: printing is its output */
import { parseArgs } from 'node:util'
import {
  affiliateId as toAffiliateId,
  currency as toCurrency,
  money,
  payoutId as toPayoutId,
  requestId,
  workspaceContext,
  workspaceId as toWorkspaceId,
  type LedgerAccountId,
} from '@creatorhub/contracts'
import {
  affiliates,
  auditLog,
  beneficiaryAccountsRepo,
  commissions,
  createDatabase,
  ledger,
  loadDatabaseConfig,
  payoutsRepo,
  type RepositoryScope,
} from '@creatorhub/db'
import { createPayoutPosting } from '@creatorhub/domain'

import { generateUuidV7 } from '../src/lib/uuidv7'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const UTR = /^[A-Za-z0-9-]{6,40}$/

const { positionals, values } = parseArgs({
  allowPositionals: true,
  options: {
    workspace: { type: 'string' },
    payout: { type: 'string' },
    affiliate: { type: 'string' },
    utr: { type: 'string' },
    reason: { type: 'string' },
  },
})

function fail(message: string): never {
  console.error(`error: ${message}`)
  process.exit(1)
}

function rupees(minor: bigint): string {
  const sign = minor < 0n ? '-' : ''
  const abs = minor < 0n ? -minor : minor
  return `${sign}₹${(abs / 100n).toLocaleString('en-IN')}.${(abs % 100n).toString().padStart(2, '0')}`
}

const command = positionals[0]
const ws = values.workspace
if (!command)
  fail('give a command: payouts, payout-sent, payout-failed, affiliates, affiliate-paid')
if (!ws || !UUID.test(ws)) fail('--workspace <uuid> is required')

const audit = {
  currentSalt: () => process.env['AUDIT_IP_SALT'] ?? 'operator-cli-audit-salt-not-used-for-ips',
}
const db = createDatabase(loadDatabaseConfig(process.env))
const context = workspaceContext({
  workspaceId: toWorkspaceId(ws),
  requestId: requestId(`req-operator-${Date.now().toString(36)}`),
})

async function inWorkspace<T>(work: (scope: RepositoryScope) => Promise<T>): Promise<T> {
  return db.withWorkspace(context, (tx) => work({ tx, context }))
}

try {
  switch (command) {
    case 'payouts': {
      const rows = await inWorkspace(async (scope) => {
        const list = await payoutsRepo.listPayouts(scope, { limit: 100, offset: 0 })
        const open = list.filter((p) => ['requested', 'approved', 'processing'].includes(p.status))
        const out = []
        for (const p of open) {
          const account = await beneficiaryAccountsRepo.findBeneficiaryAccountById(
            scope,
            p.beneficiaryAccountId as never,
          )
          out.push({ p, account })
        }
        return out
      })
      if (rows.length === 0) console.log('No open withdrawals.')
      for (const { p, account } of rows) {
        console.log(
          `\n${p.id}  ${rupees(p.amount)}  ${p.status}  requested ${p.createdAt.toISOString()}`,
        )
        if (p.status === 'requested')
          console.log('  waiting for the creator to approve; do not pay yet')
        if (account) {
          console.log(`  to: ${account.accountHolderName}`)
          console.log(
            account.accountType === 'vpa'
              ? `  UPI: ${account.vpa ?? ''}`
              : `  bank: ${account.accountNumber ?? account.maskedAccountNumber ?? ''}  IFSC ${account.ifscCode ?? ''}`,
          )
        }
      }
      break
    }

    case 'payout-sent': {
      const id = values.payout
      const utr = values.utr
      if (!id || !UUID.test(id)) fail('--payout <uuid> is required')
      if (!utr || !UTR.test(utr))
        fail('--utr <bank reference> is required (6 to 40 letters and digits)')
      const settled = await inWorkspace(async (scope) => {
        const existing = await payoutsRepo.findPayoutById(scope, toPayoutId(id))
        if (!existing) fail('no such payout in this workspace')
        if (existing.status !== 'approved' && existing.status !== 'processing') {
          fail(`payout is ${existing.status}; only an approved payout can be marked sent`)
        }
        if (existing.status === 'approved')
          await payoutsRepo.recordPayoutProcessing(scope, {
            payoutId: toPayoutId(id),
            providerPayoutId: utr,
          })
        const done = await payoutsRepo.recordPayoutSettlement(scope, toPayoutId(id))
        if (!done) fail('payout could not be marked paid')
        await auditLog.writeAuditLog(scope, audit, {
          actorType: 'system',
          action: 'payout.settled',
          targetType: 'payout',
          targetId: id,
          metadata: { utr, amount: done.amount.toString(), by: 'operator-cli' },
        })
        return done
      })
      console.log(`Marked ${rupees(settled.amount)} as paid with UTR ${utr}.`)
      break
    }

    case 'payout-failed': {
      const id = values.payout
      const reason = values.reason?.trim()
      if (!id || !UUID.test(id)) fail('--payout <uuid> is required')
      if (!reason || reason.length < 3) fail('--reason "<what the bank said>" is required')
      const failed = await inWorkspace(async (scope) => {
        const done = await payoutsRepo.recordPayoutFailure(scope, {
          payoutId: toPayoutId(id),
          failureReason: reason,
        })
        if (!done) fail('payout could not be marked failed (already paid, or not found)')
        await auditLog.writeAuditLog(scope, audit, {
          actorType: 'system',
          action: 'payout.failed',
          targetType: 'payout',
          targetId: id,
          metadata: { reason, by: 'operator-cli' },
        })
        return done
      })
      console.log(
        `Marked ${rupees(failed.amount)} as failed; the money is back in the creator's balance.`,
      )
      break
    }

    case 'affiliates': {
      const rows = await inWorkspace(async (scope) => {
        await commissions.releaseHeldCommissions(scope, new Date())
        const list = await affiliates.listAffiliates(scope, { limit: 500 })
        const out = []
        for (const a of list) {
          const b = await commissions.getAffiliateLedgerBreakdown(scope, toAffiliateId(a.id))
          if (b.vestedMinor > 0n) out.push({ a, payable: b.vestedMinor })
        }
        return out
      })
      if (rows.length === 0) console.log('No affiliate commissions are payable.')
      for (const { a, payable } of rows) {
        const acct = (a.payoutAccount ?? {}) as Record<string, string>
        console.log(`\n${a.id}  ${a.name ?? a.email}  payable ${rupees(payable)}`)
        console.log(
          acct['method'] === 'upi'
            ? `  UPI: ${acct['upiId'] ?? ''}`
            : acct['method'] === 'bank'
              ? `  bank: ${acct['accountName'] ?? ''}  ${acct['accountNumber'] ?? ''}  IFSC ${acct['ifsc'] ?? ''}`
              : '  no payout details yet; ask them to add them in their dashboard',
        )
      }
      break
    }

    case 'affiliate-paid': {
      const id = values.affiliate
      const utr = values.utr
      if (!id || !UUID.test(id)) fail('--affiliate <uuid> is required')
      if (!utr || !UTR.test(utr))
        fail('--utr <bank reference> is required (6 to 40 letters and digits)')
      const paid = await inWorkspace(async (scope) => {
        const marked = await commissions.markVestedCommissionsPaid(scope, toAffiliateId(id))
        if (marked.count === 0 || !marked.currency) fail('this affiliate has nothing payable')
        const code = toCurrency(marked.currency)
        const payable = await ledger.findOrCreateWorkspaceAccount(scope, 'affiliate_payable', code)
        const clearing = await ledger.findOrCreateWorkspaceAccount(
          scope,
          'processor_clearing',
          code,
        )
        const posting = createPayoutPosting({
          workspaceId: toWorkspaceId(ws),
          payoutId: generateUuidV7(),
          idempotencyKey: `affiliate-payout-${id}-${utr}`,
          currency: code,
          amount: money(marked.totalMinor, code),
          accounts: {
            payableAccountId: payable.id as LedgerAccountId,
            processorClearingAccountId: clearing.id as LedgerAccountId,
          },
        })
        if (!posting.ok) fail(posting.error.detail)
        await ledger.postTransaction(scope, posting.value)
        await auditLog.writeAuditLog(scope, audit, {
          actorType: 'system',
          action: 'affiliate.commissions_paid',
          targetType: 'affiliate',
          targetId: id,
          metadata: {
            utr,
            amount: marked.totalMinor.toString(),
            commissions: marked.count,
            by: 'operator-cli',
          },
        })
        return marked
      })
      console.log(
        `Marked ${String(paid.count)} commissions (${rupees(paid.totalMinor)}) as paid with UTR ${utr}.`,
      )
      break
    }

    default:
      fail(`unknown command ${command}`)
  }
} finally {
  await db.close()
}
