import { describe, expect, it } from 'vitest'

import { gstStateCode, parseWorkspaceTaxSettings, workspaceTaxSettingsSchema } from './tax-settings.js'

describe('workspace tax settings', () => {
  it('defaults anything malformed to unregistered', () => {
    expect(parseWorkspaceTaxSettings(null)).toEqual({ gstRegistered: false })
    expect(parseWorkspaceTaxSettings({ gstRegistered: true, gstin: 'nope' })).toEqual({
      gstRegistered: false,
    })
  })

  it('accepts a valid GSTIN, normalising case, with an 18% default rate', () => {
    const parsed = workspaceTaxSettingsSchema.parse({
      gstRegistered: true,
      gstin: '29abcde1234f1z5',
      legalName: 'Asha Rao',
    })
    expect(parsed).toEqual({
      gstRegistered: true,
      gstin: '29ABCDE1234F1Z5',
      legalName: 'Asha Rao',
      rateBasisPoints: 1800,
    })
    expect(gstStateCode('29ABCDE1234F1Z5')).toBe('29')
  })
})
