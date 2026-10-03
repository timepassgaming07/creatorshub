-- Migration: Add configurable platform fee to workspaces
-- This replaces the hardcoded platform fee (500 bps / 5%) scattered across
-- order-fulfillment.ts and analytics.ts with a proper per-workspace column.
-- Every workspace defaults to 500 bps (5.00%). High-volume creators can
-- negotiate lower rates by updating this column.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS platform_fee_bps INTEGER NOT NULL DEFAULT 500;

COMMENT ON COLUMN workspaces.platform_fee_bps IS
  'Platform fee in basis points. 500 = 5.00%. Deducted from every sale before creator payout.';
