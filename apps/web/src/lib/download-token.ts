/**
 * Download link tokens.
 *
 * Format: `<workspace uuid>.<64 hex chars>`. The random half is the secret and
 * is stored only as a SHA-256 hash. The workspace half is not secret; it tells
 * the server which tenant to open before looking the hash up, so the lookup
 * runs under both isolation layers like every other query (ADR-0021). A token
 * whose workspace half is altered simply finds no grant.
 */
import { createHash, randomBytes } from 'node:crypto'

const TOKEN_PATTERN =
  /^([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\.([0-9a-f]{64})$/

export type ParsedDownloadToken = {
  readonly workspaceId: string
  readonly tokenHash: string
}

export function createDownloadToken(workspaceId: string): { token: string; tokenHash: string } {
  const secret = randomBytes(32).toString('hex')
  return {
    token: `${workspaceId}.${secret}`,
    tokenHash: createHash('sha256').update(secret).digest('hex'),
  }
}

export function parseDownloadToken(token: string): ParsedDownloadToken | null {
  const match = TOKEN_PATTERN.exec(token.trim().toLowerCase())
  if (!match?.[1] || !match[2]) return null
  return {
    workspaceId: match[1],
    tokenHash: createHash('sha256').update(match[2]).digest('hex'),
  }
}
