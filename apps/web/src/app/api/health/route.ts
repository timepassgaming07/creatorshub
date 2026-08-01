/**
 * Health endpoint.
 *
 * Reports whether this instance is serving. It deliberately does *not* check
 * downstream dependencies: a load balancer that pulls every instance out of
 * rotation because one shared database is briefly slow converts a degraded
 * service into an outage.
 *
 * A separate readiness endpoint that does check dependencies arrives with slice 1,
 * once there are dependencies to check.
 */
export const dynamic = 'force-dynamic'

export function GET(): Response {
  return Response.json(
    {
      status: 'ok',
      service: 'creatorhub-web',
      // Set by the platform at build time. Absent locally, which is fine — the
      // field is for correlating a deployed response with a commit.
      revision: process.env['VERCEL_GIT_COMMIT_SHA'] ?? 'local',
      uptimeSeconds: Math.floor(process.uptime()),
    },
    {
      status: 200,
      headers: { 'Cache-Control': 'no-store' },
    },
  )
}
