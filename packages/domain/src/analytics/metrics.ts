/**
 * Pure Analytics Financial & Telemetry Calculation Engine (Slice 10 §10.1).
 *
 * Responsibilities:
 * 1. Zero-float integer basis-point arithmetic for business metrics.
 * 2. Strict ledger-aligned financial balance derivations.
 * 3. Conversion funnel step drop-off calculations.
 */

/**
 * Derives net sales from gross sales minus refunds and disputes.
 * Formula: Net = Gross - Refunds - Disputes (floor at 0).
 */
export function calculateNetSales(
  grossSalesMinor: bigint,
  refundsMinor: bigint,
  disputesMinor: bigint = 0n,
): bigint {
  const deductions = refundsMinor + disputesMinor
  if (deductions >= grossSalesMinor) {
    return 0n
  }
  return grossSalesMinor - deductions
}

/**
 * Calculates refund rate in basis points (100 bps = 1.00%).
 * Returns 0 if gross sales is 0.
 */
export function calculateRefundRateBps(
  grossSalesMinor: bigint,
  refundsMinor: bigint,
): number {
  if (grossSalesMinor <= 0n || refundsMinor <= 0n) {
    return 0
  }
  if (refundsMinor >= grossSalesMinor) {
    return 10_000 // 100.00%
  }
  return Number((refundsMinor * 10_000n) / grossSalesMinor)
}

/**
 * Calculates conversion rate in basis points from unique visitors to orders.
 * Returns 0 if visitors count is 0.
 */
export function calculateConversionRateBps(
  visitorsCount: number,
  ordersCount: number,
): number {
  if (visitorsCount <= 0 || ordersCount <= 0) {
    return 0
  }
  if (ordersCount >= visitorsCount) {
    return 10_000 // 100.00%
  }
  return Math.round((ordersCount / visitorsCount) * 10_000)
}

/**
 * Calculates Average Order Value (AOV) in minor units.
 * Returns 0n if orders count is 0.
 */
export function calculateAverageOrderValue(
  grossSalesMinor: bigint,
  ordersCount: number,
): bigint {
  if (ordersCount <= 0 || grossSalesMinor <= 0n) {
    return 0n
  }
  return grossSalesMinor / BigInt(ordersCount)
}

/**
 * Derives creator gross profit after affiliate payouts and platform fees.
 */
export function calculateGrossProfit(
  netSalesMinor: bigint,
  affiliateExpenseMinor: bigint,
  platformFeesMinor: bigint,
): bigint {
  const totalExpenses = affiliateExpenseMinor + platformFeesMinor
  if (totalExpenses >= netSalesMinor) {
    return 0n
  }
  return netSalesMinor - totalExpenses
}

/**
 * Computes conversion funnel step drop-off rate in basis points.
 */
export function calculateDropoffRateBps(
  previousStepCount: number,
  currentStepCount: number,
): number {
  if (previousStepCount <= 0) {
    return 0
  }
  if (currentStepCount >= previousStepCount) {
    return 0 // No dropoff
  }
  const dropped = previousStepCount - currentStepCount
  return Math.round((dropped / previousStepCount) * 10_000)
}
