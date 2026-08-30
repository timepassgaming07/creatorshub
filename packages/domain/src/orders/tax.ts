/**
 * Tax Calculation & GST Compliance Domain Logic (Slice 5 §5.5).
 *
 * Responsibilities:
 * 1. India GST calculation (IGST vs CGST + SGST) based on seller and buyer states.
 * 2. Cross-border digital export and reverse charge determination.
 * 3. GSTIN format validation.
 * 4. Exact integer math using minor units (`bigint`) with remainder conservation.
 *
 * Invariants:
 * - Sum of tax components exactly equals `totalTaxAmount`.
 * - Intra-state GST splits exactly 50/50: `CGST = total / 2n`, `SGST = total - CGST`.
 * - No floating point calculations.
 */
import type { CurrencyCode, Money } from '@creatorhub/contracts'
import { money } from '@creatorhub/contracts'

import { domainError, err, ok, type Result } from '../result.js'

export const INVALID_TAXABLE_AMOUNT = 'INVALID_TAXABLE_AMOUNT'
export const INVALID_GSTIN = 'INVALID_GSTIN'

export type TaxScheme = 'gst_igst' | 'gst_cgst_sgst' | 'vat' | 'none'

export type TaxComponent = {
  readonly name: string
  readonly rateBasisPoints: number
  readonly amount: bigint
}

export type CalculateTaxParams = {
  readonly taxableAmount: bigint
  readonly currency: CurrencyCode
  readonly sellerCountry?: string | undefined // Defaults to 'IN'
  readonly sellerState?: string | null | undefined
  readonly buyerCountry?: string | null | undefined
  readonly buyerState?: string | null | undefined
  readonly buyerGstin?: string | null | undefined
  readonly defaultRateBasisPoints?: number | undefined // Default 1800 (18.00% GST)
}

export type CalculatedTaxBreakdown = {
  readonly scheme: TaxScheme
  readonly rateBasisPoints: number
  readonly totalTax: Money
  readonly components: readonly TaxComponent[]
  readonly isReverseCharge: boolean
  readonly isExport: boolean
}

// 15-character Indian GSTIN Regex: 2 digits state code + 10-char PAN + 1 entity num + 'Z' + 1 checksum char
export const GSTIN_REGEX = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[1-9A-Z]{1}Z[0-9A-Z]{1}$/

/**
 * Validates the structure and length of an Indian GST Identification Number.
 */
export function validateGstin(gstin: string): boolean {
  return GSTIN_REGEX.test(gstin.trim().toUpperCase())
}

/**
 * Calculates tax breakdown based on seller/buyer tax jurisdictions and GST rules.
 */
export function calculateOrderTax(params: CalculateTaxParams): Result<CalculatedTaxBreakdown> {
  if (params.taxableAmount < 0n) {
    return err(
      domainError({
        code: INVALID_TAXABLE_AMOUNT,
        title: 'Invalid Taxable Amount',
        detail: 'Taxable amount cannot be negative.',
        action: 'Provide a valid positive or zero taxable amount.',
      }),
    )
  }

  const sellerCountry = (params.sellerCountry ?? 'IN').toUpperCase()
  const buyerCountry = (params.buyerCountry ?? 'IN').toUpperCase()
  const sellerState = params.sellerState?.trim().toUpperCase() ?? null
  const buyerState = params.buyerState?.trim().toUpperCase() ?? null
  const buyerGstin = params.buyerGstin?.trim().toUpperCase() ?? null

  const defaultRate = params.defaultRateBasisPoints ?? 1800 // 18%

  // 1. Zero taxable amount -> No tax
  if (params.taxableAmount === 0n) {
    return ok({
      scheme: 'none',
      rateBasisPoints: 0,
      totalTax: money(0n, params.currency),
      components: [],
      isReverseCharge: false,
      isExport: false,
    })
  }

  // 2. Cross-border export (Seller IN, Buyer outside IN) -> Zero-rated export
  if (sellerCountry === 'IN' && buyerCountry !== 'IN') {
    return ok({
      scheme: 'none',
      rateBasisPoints: 0,
      totalTax: money(0n, params.currency),
      components: [],
      isReverseCharge: false,
      isExport: true,
    })
  }

  // 3. Indian Domestic GST
  if (sellerCountry === 'IN' && buyerCountry === 'IN') {
    const isB2B = buyerGstin !== null && validateGstin(buyerGstin)
    const isIntraState = sellerState !== null && buyerState !== null && sellerState === buyerState

    const totalTaxAmount = (params.taxableAmount * BigInt(defaultRate)) / 10000n

    if (isIntraState) {
      // Intra-state: CGST (50%) + SGST (50%)
      const halfRate = Math.floor(defaultRate / 2)
      const cgstAmount = totalTaxAmount / 2n
      const sgstAmount = totalTaxAmount - cgstAmount // Guarantees exact sum

      return ok({
        scheme: 'gst_cgst_sgst',
        rateBasisPoints: defaultRate,
        totalTax: money(totalTaxAmount, params.currency),
        components: [
          { name: 'CGST', rateBasisPoints: halfRate, amount: cgstAmount },
          { name: 'SGST', rateBasisPoints: defaultRate - halfRate, amount: sgstAmount },
        ],
        isReverseCharge: false,
        isExport: false,
      })
    }

    // Inter-state: IGST
    return ok({
      scheme: 'gst_igst',
      rateBasisPoints: defaultRate,
      totalTax: money(totalTaxAmount, params.currency),
      components: [{ name: 'IGST', rateBasisPoints: defaultRate, amount: totalTaxAmount }],
      isReverseCharge:
        isB2B && sellerState !== null && buyerState !== null && sellerState !== buyerState,
      isExport: false,
    })
  }

  // 4. Default / Generic VAT
  const totalTaxAmount = (params.taxableAmount * BigInt(defaultRate)) / 10000n
  return ok({
    scheme: defaultRate > 0 ? 'vat' : 'none',
    rateBasisPoints: defaultRate,
    totalTax: money(totalTaxAmount, params.currency),
    components:
      defaultRate > 0
        ? [{ name: 'VAT', rateBasisPoints: defaultRate, amount: totalTaxAmount }]
        : [],
    isReverseCharge: false,
    isExport: false,
  })
}
