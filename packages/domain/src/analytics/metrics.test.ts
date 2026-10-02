/**
 * Unit tests for pure analytics metrics calculations (Slice 10 §10.1).
 */
import { describe, expect, it } from 'vitest'

import {
  calculateAverageOrderValue,
  calculateConversionRateBps,
  calculateDropoffRateBps,
  calculateGrossProfit,
  calculateNetSales,
  calculateRefundRateBps,
} from './metrics.js'

describe('Analytics Pure Metrics Calculations (Slice 10)', () => {
  it('calculates net sales correctly with zero floor', () => {
    expect(calculateNetSales(100000n, 20000n)).toBe(80000n)
    expect(calculateNetSales(100000n, 20000n, 10000n)).toBe(70000n)
    expect(calculateNetSales(50000n, 60000n)).toBe(0n)
  })

  it('calculates refund rate in exact basis points', () => {
    // ₹200 refund on ₹1,000 gross = 20.00% = 2000 bps
    expect(calculateRefundRateBps(100000n, 20000n)).toBe(2000)
    // ₹0 refund
    expect(calculateRefundRateBps(100000n, 0n)).toBe(0)
    // 100% refund
    expect(calculateRefundRateBps(50000n, 50000n)).toBe(10000)
    // Partial refund: ₹33.33 on ₹100.00 = 3333 bps
    expect(calculateRefundRateBps(10000n, 3333n)).toBe(3333)
  })

  it('calculates conversion rate in basis points', () => {
    // 50 orders from 1,000 visitors = 5.00% = 500 bps
    expect(calculateConversionRateBps(1000, 50)).toBe(500)
    // 0 visitors
    expect(calculateConversionRateBps(0, 5)).toBe(0)
    // 0 orders
    expect(calculateConversionRateBps(500, 0)).toBe(0)
    // 100% conversion
    expect(calculateConversionRateBps(20, 20)).toBe(10000)
  })

  it('calculates Average Order Value (AOV) accurately', () => {
    // ₹1,000.00 total across 4 orders = ₹250.00 (25000n)
    expect(calculateAverageOrderValue(100000n, 4)).toBe(25000n)
    expect(calculateAverageOrderValue(100000n, 0)).toBe(0n)
  })

  it('calculates gross creator profit after deductions', () => {
    // Net ₹1,000.00, Affiliate ₹200.00, Platform fee ₹50.00 -> Profit ₹750.00
    expect(calculateGrossProfit(100000n, 20000n, 5000n)).toBe(75000n)
    expect(calculateGrossProfit(20000n, 15000n, 10000n)).toBe(0n)
  })

  it('calculates conversion funnel drop-off rate', () => {
    // 1,000 visitors -> 400 product views = 60.00% drop-off (6000 bps)
    expect(calculateDropoffRateBps(1000, 400)).toBe(6000)
    // 400 product views -> 100 checkout starts = 75.00% drop-off (7500 bps)
    expect(calculateDropoffRateBps(400, 100)).toBe(7500)
    // No dropoff
    expect(calculateDropoffRateBps(100, 100)).toBe(0)
  })
})
