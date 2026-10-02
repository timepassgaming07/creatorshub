import { describe, expect, it } from 'vitest'

import { createDownloadToken, parseDownloadToken } from './download-token'

const WS = '01a0fc30-1e74-73ed-a087-b22e9108ad6d'

describe('download tokens', () => {
  it('round-trips the workspace and hashes only the secret half', () => {
    const { token, tokenHash } = createDownloadToken(WS)
    expect(token.startsWith(`${WS}.`)).toBe(true)
    expect(token).not.toContain(tokenHash)
    expect(parseDownloadToken(token)).toEqual({ workspaceId: WS, tokenHash })
  })

  it('issues a different secret every time', () => {
    expect(createDownloadToken(WS).token).not.toBe(createDownloadToken(WS).token)
  })

  it('rejects malformed tokens', () => {
    expect(parseDownloadToken('')).toBeNull()
    expect(parseDownloadToken('abc')).toBeNull()
    expect(parseDownloadToken(`${WS}.${'a'.repeat(63)}`)).toBeNull()
    expect(parseDownloadToken(`../${WS}.${'a'.repeat(64)}`)).toBeNull()
    expect(parseDownloadToken('a'.repeat(64))).toBeNull()
  })
})
