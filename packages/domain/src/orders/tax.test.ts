/**
 * Tax Calculation and Double-Entry Ledger Posting tests (Slice 5 §5.5).
 *
 * Verifies:
 * 1. GST intra-state (CGST + SGST) and inter-state (IGST) calculations.
 * 2. Exact integer math and remainder preservation for 50/50 tax splits.
 * 3. Export zero-rating for international customers.
 * 4. Indian GSTIN validation.
 * 5. Integration with double-entry ledger posting and zero-sum balance invariant.
 */
import { currency, ledgerAccountId, money, workspaceId } from '@creatorhub/contracts'
import { describe, expect, it } from 'vitest'

import { createOrderPaymentPosting } from '../ledger/postings.js'
import { isErr, isOk } from '../result.js'
import { INVALID_TAXABLE_AMOUNT, calculateOrderTax, validateGstin } from './tax.js'

describe('Tax Calculation Domain Logic (§5.5)', () => {
  describe('GSTIN Validation', () => {
    it('validates standard Indian 15-digit GSTIN formats', () => {
      expect(validateGstin('27AAAAA0000A1Z5')).toBe(true)
      expect(validateGstin('07ABCDE1234F2ZB')).toBe(true)
      expect(validateGstin(' 27AAAAA0000A1Z5 ')).toBe(true) // Trims whitespace
    })

    it('rejects malformed GSTIN formats', () => {
      expect(validateGstin('')).toBe(false)
      expect(validateGstin('27AAAAA0000A1Z')).toBe(false) // 14 chars
      expect(validateGstin('27AAAAA0000A1Z59')).toBe(false) // 16 chars
      expect(validateGstin('XXAAAAA0000A1Z5')).toBe(false) // Non-numeric state
    })
  })

  describe('Tax Calculation', () => {
    it('returns zero tax for zero taxable amount', () => {
      const res = calculateOrderTax({
        taxableAmount: 0n,
        currency: currency('INR'),
      })
      expect(isOk(res)).toBe(true)
      if (isOk(res)) {
        expect(res.value.scheme).toBe('none')
        expect(res.value.totalTax.amount).toBe(0n)
        expect(res.value.components).toHaveLength(0)
      }
    })

    it('rejects negative taxable amounts', () => {
      const res = calculateOrderTax({
        taxableAmount: -100n,
        currency: currency('INR'),
      })
      expect(isErr(res)).toBe(true)
      if (isErr(res)) {
        expect(res.error.code).toBe(INVALID_TAXABLE_AMOUNT)
      }
    })

    it('calculates intra-state GST (CGST 9% + SGST 9%) with exact rounding', () => {
      // Taxable amount: ₹2,999.00 (299900 paise)
      // 18% GST = 53982 paise
      // CGST (9%) = 26991 paise, SGST (9%) = 26991 paise
      const res = calculateOrderTax({
        taxableAmount: 299900n,
        currency: currency('INR'),
        sellerCountry: 'IN',
        sellerState: 'MH',
        buyerCountry: 'IN',
        buyerState: 'MH',
        defaultRateBasisPoints: 1800,
      })

      expect(isOk(res)).toBe(true)
      if (isOk(res)) {
        const { scheme, totalTax, components } = res.value
        expect(scheme).toBe('gst_cgst_sgst')
        expect(totalTax.amount).toBe(53982n)
        expect(components).toHaveLength(2)
        expect(components[0]?.name).toBe('CGST')
        expect(components[0]?.amount).toBe(26991n)
        expect(components[1]?.name).toBe('SGST')
        expect(components[1]?.amount).toBe(26991n)
        expect(components[0]!.amount + components[1]!.amount).toBe(totalTax.amount)
      }
    })

    it('conserves remainder on odd-paise intra-state GST splits', () => {
      // Taxable amount: ₹1.01 (101 paise). 18% GST of 101 = 18 paise.
      // CGST = 9 paise, SGST = 9 paise.
      // Now consider taxable amount 105 paise. 18% = 18.9 -> 18 paise integer math.
      // Total tax = 18 paise -> 9 and 9.
      // Taxable amount 103 paise -> 18% = 18 paise.
      const res = calculateOrderTax({
        taxableAmount: 103n,
        currency: currency('INR'),
        sellerCountry: 'IN',
        sellerState: 'DL',
        buyerCountry: 'IN',
        buyerState: 'DL',
        defaultRateBasisPoints: 1800,
      })

      expect(isOk(res)).toBe(true)
      if (isOk(res)) {
        const { totalTax, components } = res.value
        expect(components[0]!.amount + components[1]!.amount).toBe(totalTax.amount)
      }
    })

    it('calculates inter-state GST (IGST 18%) for different states', () => {
      const res = calculateOrderTax({
        taxableAmount: 100000n, // ₹1,000.00
        currency: currency('INR'),
        sellerCountry: 'IN',
        sellerState: 'MH',
        buyerCountry: 'IN',
        buyerState: 'KA', // Karnataka
        defaultRateBasisPoints: 1800,
      })

      expect(isOk(res)).toBe(true)
      if (isOk(res)) {
        const { scheme, totalTax, components } = res.value
        expect(scheme).toBe('gst_igst')
        expect(totalTax.amount).toBe(18000n) // ₹180.00
        expect(components).toHaveLength(1)
        expect(components[0]?.name).toBe('IGST')
        expect(components[0]?.amount).toBe(18000n)
      }
    })

    it('zero-rates cross-border digital exports (India -> US)', () => {
      const res = calculateOrderTax({
        taxableAmount: 500000n,
        currency: currency('INR'),
        sellerCountry: 'IN',
        buyerCountry: 'US',
      })

      expect(isOk(res)).toBe(true)
      if (isOk(res)) {
        expect(res.value.scheme).toBe('none')
        expect(res.value.isExport).toBe(true)
        expect(res.value.totalTax.amount).toBe(0n)
      }
    })
  })

  describe('Double-Entry Ledger Posting with tax_payable', () => {
    it('creates perfectly balanced ledger transaction with tax_payable posting', () => {
      const orderTax = calculateOrderTax({
        taxableAmount: 100000n, // ₹1,000.00
        currency: currency('INR'),
        sellerCountry: 'IN',
        sellerState: 'MH',
        buyerCountry: 'IN',
        buyerState: 'MH',
      })

      expect(isOk(orderTax)).toBe(true)
      if (!isOk(orderTax)) return

      const taxAmount = orderTax.value.totalTax // 18000n (₹180.00)
      const grossAmount = money(118000n, currency('INR')) // Subtotal + Tax = 118000n
      const platformFee = money(10000n, currency('INR')) // ₹100.00 platform fee

      const wsId = workspaceId('018f9e2b-7c5e-7a2e-8c3b-000000000001')
      const processorClearing = ledgerAccountId('018f9e2b-7c5e-7a2e-8c3b-000000000011')
      const creatorPayable = ledgerAccountId('018f9e2b-7c5e-7a2e-8c3b-000000000012')
      const platformRevenue = ledgerAccountId('018f9e2b-7c5e-7a2e-8c3b-000000000013')
      const taxPayable = ledgerAccountId('018f9e2b-7c5e-7a2e-8c3b-000000000014')

      const postingProposal = createOrderPaymentPosting({
        workspaceId: wsId,
        orderId: 'ord_test_tax_123',
        idempotencyKey: 'idem_tax_test',
        currency: currency('INR'),
        grossAmount,
        taxAmount,
        platformFee,
        accounts: {
          processorClearingAccountId: processorClearing,
          creatorPayableAccountId: creatorPayable,
          platformRevenueAccountId: platformRevenue,
          taxPayableAccountId: taxPayable,
        },
      })

      expect(isOk(postingProposal)).toBe(true)
      if (isOk(postingProposal)) {
        const { entries } = postingProposal.value
        expect(entries).toHaveLength(4)

        // Debit processor clearing for total gross: 118000n
        const debitEntry = entries.find((e) => e.direction === 'debit')
        expect(debitEntry?.amount).toBe(118000n)
        expect(debitEntry?.accountId).toBe(processorClearing)

        // Credit creator payable for net payout: 118000 - 18000 - 10000 = 90000n
        const creatorEntry = entries.find((e) => e.accountId === creatorPayable)
        expect(creatorEntry?.amount).toBe(90000n)

        // Credit platform fee: 10000n
        const platformEntry = entries.find((e) => e.accountId === platformRevenue)
        expect(platformEntry?.amount).toBe(10000n)

        // Credit tax payable: 18000n
        const taxEntry = entries.find((e) => e.accountId === taxPayable)
        expect(taxEntry?.amount).toBe(18000n)

        // Verify zero-sum double entry balance: 118000n debit == 90000n + 10000n + 18000n credits
        const totalDebits = entries
          .filter((e) => e.direction === 'debit')
          .reduce((sum, e) => sum + e.amount, 0n)
        const totalCredits = entries
          .filter((e) => e.direction === 'credit')
          .reduce((sum, e) => sum + e.amount, 0n)
        expect(totalDebits).toBe(totalCredits)
      }
    })
  })
})
