/**
 * The audit log writer.
 *
 * Responsibilities: append one row per state change to money, entitlements, or
 * permissions, and read the history back for one workspace.
 * Dependencies: drizzle-orm, the repository base, node:crypto for the IP hash.
 *
 * This is the table that answers a dispute, a security question, or a regulator.
 * It cannot be reconstructed after the fact, which is why it exists in M1 rather
 * than when it is first needed, and why the constraints around it are enforced by
 * Postgres rather than by convention.
 *
 * **Append-only, and the database means it.** Migration 0005 revokes `UPDATE` and
 * `DELETE` from `creatorhub_app`, so this module could not offer an `update` or a
 * `delete` even if someone added one: the statement fails with 42501. There is
 * deliberately no soft-delete flag either, because a flag is an update.
 *
 * **The IP is hashed, never stored raw.** A log of who did what is not a reason
 * to hold an address indefinitely, and the hash is enough to answer "was this the
 * same person" without being able to answer "where do they live". The salt
 * rotates, which bounds how long two hashes remain comparable; that is the point
 * rather than a limitation.
 *
 * **Platform rows are not writable from here.** `audit_logs.workspace_id` is
 * nullable, because a platform-level action belongs to no workspace, and this
 * module cannot produce such a row: every write goes through `insertValues`, which
 * stamps the scope's workspace. That is deliberate. A platform write needs the
 * unscoped connection, and exposing it here would put the one code path that can
 * write an unattributable audit row inside the module every feature imports.
 */
import type { RequestId, UserId, WorkspaceContext, WorkspaceId } from '@creatorhub/contracts'
import { createHash } from 'node:crypto'

import { and, desc, eq, sql } from 'drizzle-orm'

import { insertValues, scoped, type RepositoryScope } from '../repository.js'
import { auditLogs } from '../schema/identity.js'

// ---------------------------------------------------------------------------
// What an entry says
// ---------------------------------------------------------------------------

/**
 * Who caused this.
 *
 * `user` is a person acting through the interface. `system` is a scheduled job or
 * a migration, and carries no actor id because there is no person to name.
 * `provider` is an inbound webhook, which matters because a provider-caused
 * refund and a creator-caused refund are the same row shape and very different
 * conversations later.
 */
export type AuditActorType = 'user' | 'system' | 'affiliate' | 'api_key' | 'provider'

/**
 * One thing that happened.
 *
 * `action` is dotted and past tense: `member.invited`, `order.refunded`. Past
 * tense because the row is written after the fact, and matching the permission
 * names in `packages/domain` so a denied `member.invite` and a successful
 * `member.invited` read as the same vocabulary.
 *
 * `metadata` is where the specifics go. Deliberately unstructured, because the
 * shape differs per action and a column per action is a migration per feature.
 * It must never carry a secret, a token, or a password: this table is read by
 * support.
 */
export type AuditEntry = {
  readonly actorType: AuditActorType

  /**
   * Who, when there is a who. Not a foreign key in the schema, deliberately: the
   * row has to survive the deletion of whoever caused it, and financial history
   * that disappears with a user is not evidence.
   */
  readonly actorId?: UserId

  readonly action: string

  readonly targetType?: string
  readonly targetId?: string

  readonly metadata?: Record<string, unknown>

  /** Raw, and hashed before it reaches the database. Never stored as given. */
  readonly ipAddress?: string

  readonly userAgent?: string
}

/** One row, as read back. */
export type AuditRecord = {
  readonly id: string
  readonly workspaceId: WorkspaceId | null
  readonly actorType: AuditActorType
  readonly actorId: UserId | null
  readonly action: string
  readonly targetType: string | null
  readonly targetId: string | null
  readonly metadata: Record<string, unknown>
  readonly userAgent: string | null
  readonly requestId: RequestId | null
  readonly occurredAt: Date
}

// ---------------------------------------------------------------------------
// Hashing the address
// ---------------------------------------------------------------------------

/**
 * SHA-256 over salt and address.
 *
 * Not Argon2id, and that is a considered difference from password hashing. A
 * password hash defends a secret against an attacker with the database; this
 * defends against holding an address longer than it is needed for, and the
 * attacker who matters is us. The salt is what makes the hash unguessable, and
 * a fast hash is right here because the write path runs on every audited action.
 *
 * The salt rotates, so two rows written either side of a rotation do not compare
 * equal even for the same address. That bounds correlation to one salt period,
 * which is the intended privacy property and the reason the salt is a parameter
 * rather than a constant.
 */
export function hashIpAddress(ipAddress: string, salt: string): string {
  return createHash('sha256').update(`${salt}:${ipAddress}`).digest('hex')
}

/**
 * The salt, and the one thing this module reads from the environment.
 *
 * Absent means no hashing is possible, and the honest response is to refuse
 * rather than to fall back to an unsalted hash, which would be reversible by
 * anyone with a list of IPv4 addresses.
 */
export class AuditSaltMissingError extends Error {
  constructor() {
    super(
      'AUDIT_IP_SALT is not set, so an IP address cannot be hashed. ' +
        'Set it to at least 32 random characters. An unsalted hash of an IP address is reversible.',
    )
    this.name = 'AuditSaltMissingError'
  }
}

const MINIMUM_SALT_LENGTH = 32

function requireSalt(salt: string | undefined): string {
  if (salt === undefined || salt.length < MINIMUM_SALT_LENGTH) {
    throw new AuditSaltMissingError()
  }

  return salt
}

// ---------------------------------------------------------------------------
// Writing
// ---------------------------------------------------------------------------

/**
 * How the writer gets its salt.
 *
 * A function rather than a string, so rotation does not require reconstructing
 * anything: the next write reads the current salt. Passed in rather than read
 * from `process.env` here, because a repository that reads the environment cannot
 * be tested without mutating process state.
 */
export type AuditOptions = {
  readonly currentSalt: () => string | undefined
}

/**
 * Append one entry for the current workspace.
 *
 * Returns the id, so a caller can reference the entry from a response or a second
 * log line without a follow-up query.
 *
 * `requestId` comes from the `WorkspaceContext` rather than the entry, which is
 * what makes every row written while serving one request correlatable. A caller
 * cannot supply a different one, and that is the point: a forged correlation id
 * would make the log lie about causation.
 */
export async function writeAuditLog(
  scope: RepositoryScope,
  options: AuditOptions,
  entry: AuditEntry,
): Promise<string> {
  const rows = await scope.tx
    .insert(auditLogs)
    .values(
      insertValues(scope, {
        actorType: entry.actorType,
        action: entry.action,
        requestId: scope.context.requestId,

        ...(entry.actorId === undefined ? {} : { actorId: entry.actorId }),
        ...(entry.targetType === undefined ? {} : { targetType: entry.targetType }),
        ...(entry.targetId === undefined ? {} : { targetId: entry.targetId }),
        ...(entry.metadata === undefined ? {} : { metadata: entry.metadata }),
        ...(entry.userAgent === undefined ? {} : { userAgent: entry.userAgent }),

        // Hashed here rather than by the caller, so no call site has the
        // opportunity to pass the raw value through by mistake.
        ...(entry.ipAddress === undefined
          ? {}
          : { ipHash: hashIpAddress(entry.ipAddress, requireSalt(options.currentSalt())) }),
      }),
    )
    .returning({ id: auditLogs.id })

  return rows[0]?.id ?? ''
}

// ---------------------------------------------------------------------------
// Reading
// ---------------------------------------------------------------------------

/** How many entries a single read returns at most. */
const DEFAULT_LIMIT = 100
const MAXIMUM_LIMIT = 1000

/**
 * The workspace's history, newest first.
 *
 * Ordered by `occurred_at` descending, which is also the partition key, so the
 * planner reads the most recent partition first and stops. Unbounded reads are
 * not offered: the table grows without limit by design, and a query that would
 * have returned a year of history is a timeout rather than an answer.
 *
 * Reading requires `audit.view`, which only owners and admins hold. That check
 * belongs to the caller and the policy module, not here: a repository that
 * enforced permissions would put authorisation in two places.
 */
export async function listAuditLog(
  scope: RepositoryScope,
  options: { limit?: number; action?: string } = {},
): Promise<AuditRecord[]> {
  const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAXIMUM_LIMIT)

  const rows = await scope.tx
    .select()
    .from(auditLogs)
    .where(
      scoped(
        scope,
        auditLogs,
        options.action === undefined ? undefined : eq(auditLogs.action, options.action),
      ),
    )
    .orderBy(desc(auditLogs.occurredAt))
    .limit(limit)

  return rows.map(toRecord)
}

/**
 * Everything recorded about one target, newest first.
 *
 * The question a dispute actually asks: what happened to this order, in what
 * order, and who did it. `targetType` is required alongside the id, because ids
 * are UUIDv7 and unique but the pair is what an index exists for.
 */
export async function listAuditLogForTarget(
  scope: RepositoryScope,
  targetType: string,
  targetId: string,
  options: { limit?: number } = {},
): Promise<AuditRecord[]> {
  const limit = Math.min(options.limit ?? DEFAULT_LIMIT, MAXIMUM_LIMIT)

  const rows = await scope.tx
    .select()
    .from(auditLogs)
    .where(
      scoped(
        scope,
        auditLogs,
        and(eq(auditLogs.targetType, targetType), eq(auditLogs.targetId, targetId)),
      ),
    )
    .orderBy(desc(auditLogs.occurredAt))
    .limit(limit)

  return rows.map(toRecord)
}

// ---------------------------------------------------------------------------
// Partition maintenance
// ---------------------------------------------------------------------------

/**
 * How many months ahead partitions are kept.
 *
 * Three, so a job that fails for two months running still leaves a working write
 * path. The failure this guards against is not the job erroring loudly; it is the
 * job being quietly removed and nobody noticing until the first of a month.
 */
const MONTHS_AHEAD = 3

/**
 * Make sure the next few months have partitions.
 *
 * Called by a scheduled job. Idempotent, because the function in migration 0005
 * uses `CREATE TABLE IF NOT EXISTS`, so a job that runs twice or resumes after a
 * failure does no harm and needs no state of its own.
 *
 * Takes the transaction rather than a scope: creating a partition is not a
 * tenant-scoped operation, and the row-level policies have nothing to say about
 * DDL.
 */
export async function ensureAuditPartitions(
  scope: RepositoryScope,
  monthsAhead = MONTHS_AHEAD,
): Promise<number> {
  for (let offset = 0; offset <= monthsAhead; offset += 1) {
    // The function is SECURITY DEFINER and owned by the migrator, which is what
    // lets the application role create a partition without being able to create
    // tables generally. See migration 0005.
    await scope.tx.execute(
      sql`select create_audit_log_partition((date_trunc('month', now()) + make_interval(months => ${offset}))::date)`,
    )
  }

  return monthsAhead + 1
}

// ---------------------------------------------------------------------------
// Mapping
// ---------------------------------------------------------------------------

type AuditRow = typeof auditLogs.$inferSelect

function toRecord(row: AuditRow): AuditRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId as WorkspaceId | null,
    actorType: row.actorType,
    actorId: row.actorId as UserId | null,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId,
    metadata: row.metadata as Record<string, unknown>,
    userAgent: row.userAgent,
    requestId: row.requestId as RequestId | null,
    occurredAt: row.occurredAt,
  }
}

/**
 * The context an audit write needs, restated for the reader.
 *
 * Not a new type, just a note: `WorkspaceContext` already carries `workspaceId`,
 * `requestId`, and an optional `actorId`, and it carries all three precisely
 * because this table needs all three. That is why it is an object rather than
 * three parameters, and why the actor is optional on it.
 */
export type AuditContext = WorkspaceContext
