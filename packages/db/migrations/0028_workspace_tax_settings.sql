-- Migration: per-workspace GST settings.
--
-- Checkout used to add 18% GST to every domestic sale and never knew the
-- seller's state, so every sale was taxed as inter-state IGST. Most creators
-- starting out are below the GST registration threshold and must not charge
-- GST at all; charging it means collecting tax nobody is registered to remit.
--
-- The default is therefore "not registered": no GST is added. A registered
-- creator sets their GSTIN, the state code is taken from its first two digits,
-- and checkout then splits CGST + SGST for same-state buyers and charges IGST
-- otherwise. Prices are exclusive of GST, which checkout states plainly.

ALTER TABLE workspaces
  ADD COLUMN IF NOT EXISTS tax_settings jsonb NOT NULL DEFAULT '{"gstRegistered": false}'::jsonb;
