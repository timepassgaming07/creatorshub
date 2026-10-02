/**
 * Per-workspace GST settings (migration 0028).
 *
 * Unregistered is the default and charges no GST. A registered seller's state
 * is the first two digits of their GSTIN, which is how checkout tells a
 * same-state sale (CGST + SGST) from an inter-state one (IGST).
 */
import { z } from 'zod'

/** 15 characters: 2-digit state, PAN, entity number, Z, checksum. */
export const GSTIN_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

export const workspaceTaxSettingsSchema = z.discriminatedUnion('gstRegistered', [
  z.object({ gstRegistered: z.literal(false) }),
  z.object({
    gstRegistered: z.literal(true),
    gstin: z
      .string()
      .trim()
      .toUpperCase()
      .regex(GSTIN_PATTERN, 'Enter a valid 15-character GSTIN.'),
    legalName: z.string().trim().min(2).max(200),
    /** GST rate for the creator's goods in basis points. 1800 = 18%. */
    rateBasisPoints: z.number().int().min(0).max(2800).default(1800),
  }),
])

export type WorkspaceTaxSettings = z.infer<typeof workspaceTaxSettingsSchema>

export const UNREGISTERED_TAX_SETTINGS: WorkspaceTaxSettings = { gstRegistered: false }

/** Read stored settings, treating anything malformed as unregistered. */
export function parseWorkspaceTaxSettings(value: unknown): WorkspaceTaxSettings {
  const parsed = workspaceTaxSettingsSchema.safeParse(value)
  return parsed.success ? parsed.data : UNREGISTERED_TAX_SETTINGS
}

/** The two-digit GST state code a GSTIN starts with. */
export function gstStateCode(gstin: string): string {
  return gstin.slice(0, 2)
}

/** GST state codes, for the buyer's state picker at checkout. */
export const INDIAN_STATES: readonly { readonly code: string; readonly name: string }[] = [
  { code: '35', name: 'Andaman and Nicobar Islands' },
  { code: '37', name: 'Andhra Pradesh' },
  { code: '12', name: 'Arunachal Pradesh' },
  { code: '18', name: 'Assam' },
  { code: '10', name: 'Bihar' },
  { code: '04', name: 'Chandigarh' },
  { code: '22', name: 'Chhattisgarh' },
  { code: '26', name: 'Dadra and Nagar Haveli and Daman and Diu' },
  { code: '07', name: 'Delhi' },
  { code: '30', name: 'Goa' },
  { code: '24', name: 'Gujarat' },
  { code: '06', name: 'Haryana' },
  { code: '02', name: 'Himachal Pradesh' },
  { code: '01', name: 'Jammu and Kashmir' },
  { code: '20', name: 'Jharkhand' },
  { code: '29', name: 'Karnataka' },
  { code: '32', name: 'Kerala' },
  { code: '38', name: 'Ladakh' },
  { code: '31', name: 'Lakshadweep' },
  { code: '23', name: 'Madhya Pradesh' },
  { code: '27', name: 'Maharashtra' },
  { code: '14', name: 'Manipur' },
  { code: '17', name: 'Meghalaya' },
  { code: '15', name: 'Mizoram' },
  { code: '13', name: 'Nagaland' },
  { code: '21', name: 'Odisha' },
  { code: '34', name: 'Puducherry' },
  { code: '03', name: 'Punjab' },
  { code: '08', name: 'Rajasthan' },
  { code: '11', name: 'Sikkim' },
  { code: '33', name: 'Tamil Nadu' },
  { code: '36', name: 'Telangana' },
  { code: '16', name: 'Tripura' },
  { code: '09', name: 'Uttar Pradesh' },
  { code: '05', name: 'Uttarakhand' },
  { code: '19', name: 'West Bengal' },
]
