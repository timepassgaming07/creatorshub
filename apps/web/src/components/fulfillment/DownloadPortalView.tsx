/**
 * The download page a buyer opens from their email.
 *
 * Explains, in words, every state a link can be in: ready, used up, expired,
 * revoked by a refund, or still being scanned. The download button goes to
 * the download route, which counts one download and hands over a short-lived
 * file URL.
 */
import { CircleAlert, Clock, Download, FileDown, ShieldCheck } from 'lucide-react'

import { LogoMark } from '@/components/ds'
import type { FulfillmentDetails } from '@/lib/fulfillment-actions'
import { formatBytes, formatDate } from '@/lib/format'

const ERROR_COPY: Record<string, string> = {
  EXPIRED: 'This link has expired. Ask for fresh links from your order page or the email receipt.',
  EXHAUSTED: 'This link has been used the maximum number of times. Request fresh links from your order page.',
  REVOKED: 'Access to this file ended because the order was refunded.',
  UNAVAILABLE: 'The file is still being checked for safety. Try again in a few minutes.',
  NOT_FOUND: 'We could not find this download.',
  ERROR: 'The download could not start. Try again in a moment.',
}

export function DownloadPortalView({
  data,
  errorCode,
}: {
  readonly data: FulfillmentDetails
  readonly errorCode?: string | undefined
}) {
  const status = data.isRevoked
    ? { tone: 'critical', text: 'Access revoked after a refund' }
    : data.isExpired
      ? { tone: 'caution', text: 'Link expired' }
      : data.isExhausted
        ? { tone: 'caution', text: 'Download limit reached' }
        : data.isPendingScan
          ? { tone: 'info', text: 'Safety check in progress' }
          : { tone: 'positive', text: 'Ready to download' }

  return (
    <div className="flex min-h-dvh flex-col bg-surface-base">
      <main id="main" className="flex flex-1 items-center justify-center px-5 py-16">
        <div className="w-full max-w-md">
          <p className="mb-4 text-center text-[13px] font-medium tracking-wide text-content-tertiary uppercase">
            {data.workspaceName}
          </p>
          <div className="overflow-hidden rounded-3xl border border-border-subtle bg-surface-raised shadow-elevation-3">
            <div className="p-7">
              <div className="flex size-12 items-center justify-center rounded-2xl bg-accent-subtle text-accent">
                <FileDown className="size-6" aria-hidden="true" />
              </div>
              <h1 className="mt-5 text-xl font-semibold tracking-tight text-balance">{data.productTitle}</h1>
              <p className="mt-1 text-[14px] text-content-secondary">
                {data.originalFilename} · {formatBytes(data.byteSize)}
              </p>

              <p
                className={`mt-5 inline-flex items-center gap-2 rounded-full px-3 py-1 text-[13px] font-medium ${
                  status.tone === 'positive'
                    ? 'bg-positive-subtle text-positive'
                    : status.tone === 'critical'
                      ? 'bg-critical-subtle text-critical'
                      : status.tone === 'caution'
                        ? 'bg-caution-subtle text-caution'
                        : 'bg-info-subtle text-info'
                }`}
              >
                <span className="size-1.5 rounded-full bg-current" aria-hidden="true" />
                {status.text}
              </p>

              {errorCode && (
                <div role="alert" className="mt-5 flex items-start gap-2.5 rounded-xl bg-critical-subtle px-4 py-3 text-[14px]">
                  <CircleAlert className="mt-0.5 size-4 shrink-0 text-critical" aria-hidden="true" />
                  <p>{ERROR_COPY[errorCode] ?? ERROR_COPY['ERROR']}</p>
                </div>
              )}

              {data.canDownload ? (
                <a
                  href={`/api/fulfillment/download/${data.token}`}
                  className="mt-6 flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-accent font-semibold text-accent-content shadow-elevation-2 transition-colors hover:bg-accent-hover"
                >
                  <Download className="size-4" aria-hidden="true" />
                  Download file
                </a>
              ) : (
                <p className="mt-6 rounded-xl bg-surface-sunken px-4 py-3 text-[14px] text-content-secondary">
                  {data.isRevoked
                    ? ERROR_COPY['REVOKED']
                    : data.isPendingScan
                      ? ERROR_COPY['UNAVAILABLE']
                      : data.isExpired
                        ? ERROR_COPY['EXPIRED']
                        : ERROR_COPY['EXHAUSTED']}
                </p>
              )}
            </div>

            <dl className="grid grid-cols-2 border-t border-border-subtle text-[13px]">
              <div className="border-r border-border-subtle p-4">
                <dt className="text-content-tertiary">Downloads left</dt>
                <dd className="mt-0.5 font-semibold tabular-nums">
                  {data.remainingDownloads} of {data.maxDownloads}
                </dd>
              </div>
              <div className="p-4">
                <dt className="flex items-center gap-1.5 text-content-tertiary">
                  <Clock className="size-3.5" aria-hidden="true" />
                  Link valid until
                </dt>
                <dd className="mt-0.5 font-semibold">{formatDate(data.expiresAt)}</dd>
              </div>
            </dl>
          </div>

          {data.storefrontUrl && (
            <p className="mt-6 text-center text-[13px] text-content-secondary">
              <a href={data.storefrontUrl} className="underline underline-offset-2 hover:text-content-primary">
                Visit {data.workspaceName}
              </a>
            </p>
          )}
          <p className="mt-8 flex items-center justify-center gap-2 text-[12px] text-content-tertiary">
            <ShieldCheck className="size-3.5" aria-hidden="true" />
            Secure delivery by
            <LogoMark className="size-4" />
            CreatorHub
          </p>
        </div>
      </main>
    </div>
  )
}
