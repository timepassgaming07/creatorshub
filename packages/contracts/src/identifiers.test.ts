import { describe, expect, it } from 'vitest'

import {
  InvalidIdentifierError,
  requestId,
  requestIdSchema,
  userId,
  userIdSchema,
  workspaceId,
  workspaceIdSchema,
} from './identifiers.js'

/** A valid UUIDv7: version nibble 7, variant nibble in [89ab]. */
const VALID_V7 = '019fbd70-4d9a-72e4-b6ed-722fe672c2ba'

describe('workspaceId', () => {
  it('accepts a UUIDv7', () => {
    expect(workspaceId(VALID_V7)).toBe(VALID_V7)
  })

  it('accepts uppercase, since Postgres returns lowercase but callers may not', () => {
    expect(() => workspaceId(VALID_V7.toUpperCase())).not.toThrow()
  })

  // The whole point of the brand is that a v4 from another system cannot become
  // a primary key. Time ordering is what the index locality argument rests on.
  it('rejects a UUIDv4', () => {
    expect(() => workspaceId('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toThrow(
      InvalidIdentifierError,
    )
  })

  it('rejects a bad variant nibble', () => {
    expect(() => workspaceId('019fbd70-4d9a-72e4-c6ed-722fe672c2ba')).toThrow(
      InvalidIdentifierError,
    )
  })

  it.each([
    ['empty', ''],
    ['not a uuid', 'workspace-1'],
    ['truncated', '019fbd70-4d9a-72e4-b6ed'],
    ['trailing content', `${VALID_V7} OR 1=1`],
    ['leading whitespace', ` ${VALID_V7}`],
  ])('rejects %s', (_label, value) => {
    expect(() => workspaceId(value)).toThrow(InvalidIdentifierError)
  })

  it('names the field in the error, so the message says which id was wrong', () => {
    expect(() => workspaceId('nope')).toThrow(/workspace id/)
  })
})

describe('userId', () => {
  it('accepts a UUIDv7', () => {
    expect(userId(VALID_V7)).toBe(VALID_V7)
  })

  it('rejects a UUIDv4', () => {
    expect(() => userId('f47ac10b-58cc-4372-a567-0e02b2c3d479')).toThrow(InvalidIdentifierError)
  })

  it('names the field in the error', () => {
    expect(() => userId('nope')).toThrow(/user id/)
  })
})

describe('requestId', () => {
  it('accepts a UUID', () => {
    expect(requestId(VALID_V7)).toBe(VALID_V7)
  })

  // Correlation ids arrive from upstream proxies in several shapes. A W3C
  // traceparent id is hex; some proxies send dotted or colon-separated values.
  it.each([
    ['hex trace id', '4bf92f3577b34da6a3ce929d0e0e4736'],
    ['dotted', 'edge.01.abc'],
    ['colon separated', 'trace:123:456'],
    ['underscored', 'req_01HX'],
  ])('accepts %s', (_label, value) => {
    expect(requestId(value)).toBe(value)
  })

  it('rejects empty', () => {
    expect(() => requestId('')).toThrow(InvalidIdentifierError)
  })

  it('rejects longer than 128 characters, so one header cannot bloat every log line', () => {
    expect(() => requestId('a'.repeat(129))).toThrow(InvalidIdentifierError)
  })

  it('accepts exactly 128 characters', () => {
    expect(requestId('a'.repeat(128))).toHaveLength(128)
  })

  // A request id reaches log output and the audit log. Control characters and
  // separators are how a forged header injects a fake log line.
  it.each([
    ['newline', 'req\nfake-line'],
    ['carriage return', 'req\rfake'],
    ['null byte', 'req\u0000'],
    ['space', 'req 1'],
    ['quote', "req'"],
    ['semicolon', 'req;DROP'],
  ])('rejects %s', (_label, value) => {
    expect(() => requestId(value)).toThrow(InvalidIdentifierError)
  })
})

describe('schemas', () => {
  it('parse a valid value', () => {
    expect(workspaceIdSchema.parse(VALID_V7)).toBe(VALID_V7)
    expect(userIdSchema.parse(VALID_V7)).toBe(VALID_V7)
    expect(requestIdSchema.parse(VALID_V7)).toBe(VALID_V7)
  })

  // At a boundary a bad value is an expected outcome, so it must be reportable
  // rather than thrown. This is the difference from the constructors above.
  it('report a failure rather than throwing', () => {
    const result = workspaceIdSchema.safeParse('not-a-uuid')

    expect(result.success).toBe(false)
  })

  it('reject a UUIDv4 the same way the constructor does', () => {
    expect(userIdSchema.safeParse('f47ac10b-58cc-4372-a567-0e02b2c3d479').success).toBe(false)
  })

  it('reject a request id carrying a newline', () => {
    expect(requestIdSchema.safeParse('req\ninjected').success).toBe(false)
  })
})
