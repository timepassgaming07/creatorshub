/**
 * Buyer-Facing Digital Download Portal Component (Slice 6 §6.7).
 *
 * Designed with a modern, high-converting light-theme creator aesthetic:
 * 1. Warm neutral canvas, subtle card elevations, indigo & violet gradients, crisp typography.
 * 2. Real-time download limit tracker, remaining download counter, and expiration notice.
 * 3. Primary instant download action with progress & confirmation feedback.
 * 4. Graceful handling of expired, exhausted, or revoked states with creator support contact.
 */
'use client'

import React, { useState } from 'react'

export type DownloadPortalData = {
  readonly token: string
  readonly productTitle: string
  readonly workspaceName: string
  readonly originalFilename: string
  readonly mimeType: string
  readonly byteSize: string
  readonly maxDownloads: number
  readonly downloadCount: number
  readonly remainingDownloads: number
  readonly expiresAt: string
  readonly isExpired: boolean
  readonly isRevoked: boolean
  readonly isExhausted: boolean
  readonly canDownload: boolean
}

export type DownloadPortalViewProps = {
  readonly data: DownloadPortalData
  readonly storefrontUrl?: string
}

function formatBytes(bytesStr: string): string {
  const bytes = Number(bytesStr)
  if (isNaN(bytes) || bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`
}

function getFileIcon(mimeType: string, filename: string): string {
  if (mimeType.includes('pdf') || filename.endsWith('.pdf')) return '📄'
  if (mimeType.includes('zip') || mimeType.includes('tar') || mimeType.includes('rar')) return '📦'
  if (mimeType.includes('video') || filename.endsWith('.mp4') || filename.endsWith('.mov')) return '🎥'
  if (mimeType.includes('audio') || filename.endsWith('.mp3') || filename.endsWith('.wav')) return '🎵'
  if (mimeType.includes('image')) return '🖼️'
  return '📁'
}

export function DownloadPortalView({ data, storefrontUrl }: DownloadPortalViewProps) {
  const [downloading, setDownloading] = useState(false)
  const [downloadSuccess, setDownloadSuccess] = useState(false)
  const [remainingCount, setRemainingCount] = useState(data.remainingDownloads)

  const downloadUrl = `/api/fulfillment/download/${data.token}`
  const fileIcon = getFileIcon(data.mimeType, data.originalFilename)
  const formattedSize = formatBytes(data.byteSize)
  const expiryDate = new Date(data.expiresAt).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  })

  const progressPercent = Math.round(
    ((data.maxDownloads - remainingCount) / data.maxDownloads) * 100,
  )

  const handleDownloadClick = () => {
    setDownloading(true)
    // Decrement local remaining count optimistically
    if (remainingCount > 0) {
      setRemainingCount((prev) => Math.max(0, prev - 1))
    }

    setTimeout(() => {
      setDownloading(false)
      setDownloadSuccess(true)
    }, 1500)
  }

  return (
    <div className="min-h-screen bg-[#fafbfc] text-[#0f172a] flex flex-col items-center justify-center p-4 sm:p-6 lg:p-8 font-sans selection:bg-indigo-100 selection:text-indigo-900">
      {/* Background ambient lighting */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden -z-10">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[700px] h-[500px] bg-gradient-to-tr from-indigo-100/60 via-purple-100/40 to-pink-100/30 blur-3xl rounded-full opacity-70" />
      </div>

      <div className="w-full max-w-xl mx-auto">
        {/* Creator Branding Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white border border-slate-200/80 shadow-xs text-xs font-semibold text-slate-700 mb-3">
            <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>{data.workspaceName}</span>
            <span className="text-slate-300">&bull;</span>
            <span className="text-indigo-600 font-medium">Verified Delivery</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
            Your Digital Files are Ready
          </h1>
          <p className="text-sm text-slate-500 mt-1.5">
            Thank you for your purchase. You can download your asset below.
          </p>
        </div>

        {/* Main Fulfillment Card */}
        <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xl shadow-slate-900/5 overflow-hidden transition-all duration-300 hover:shadow-2xl hover:shadow-slate-900/10">
          
          {/* Card Top Banner */}
          <div className="p-6 sm:p-8 border-b border-slate-100 bg-gradient-to-b from-slate-50/50 to-white">
            <div className="flex items-start gap-4">
              <div className="w-14 h-14 rounded-2xl bg-indigo-50 border border-indigo-100/80 flex items-center justify-center text-2xl shadow-inner shrink-0">
                {fileIcon}
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="inline-flex items-center px-2.5 py-0.5 rounded-md text-xs font-medium bg-indigo-50 text-indigo-700 border border-indigo-100/80">
                    Digital Asset
                  </span>
                  <span className="text-xs text-slate-400">&bull;</span>
                  <span className="text-xs font-medium text-slate-500">{formattedSize}</span>
                </div>
                <h2 className="text-lg sm:text-xl font-bold text-slate-900 mt-1 truncate">
                  {data.productTitle}
                </h2>
                <p className="text-xs text-slate-400 truncate mt-0.5">
                  File: {data.originalFilename}
                </p>
              </div>
            </div>
          </div>

          {/* Download Status & Limits */}
          <div className="p-6 sm:p-8 space-y-6">
            
            {/* Active Download State */}
            {data.canDownload && (
              <>
                {/* Usage meter */}
                <div className="bg-slate-50/80 rounded-xl p-4 border border-slate-100">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-600 mb-2">
                    <span className="flex items-center gap-1.5">
                      <svg className="w-4 h-4 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                      </svg>
                      Downloads Remaining
                    </span>
                    <span className="font-semibold text-slate-900">
                      {remainingCount} of {data.maxDownloads} downloads left
                    </span>
                  </div>

                  <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden">
                    <div
                      className="bg-gradient-to-r from-indigo-500 to-indigo-600 h-full rounded-full transition-all duration-500 ease-out"
                      style={{ width: `${progressPercent}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between text-[11px] text-slate-400 mt-2.5">
                    <span>Expiring on {expiryDate}</span>
                    <span>Safe & Virus Checked</span>
                  </div>
                </div>

                {/* Primary Download CTA Button */}
                <div className="space-y-3">
                  <a
                    href={downloadUrl}
                    onClick={handleDownloadClick}
                    className={`w-full inline-flex items-center justify-center gap-2.5 py-3.5 px-6 rounded-xl font-semibold text-base text-white shadow-lg shadow-indigo-500/25 transition-all duration-200 ${
                      downloading
                        ? 'bg-indigo-400 cursor-wait'
                        : 'bg-gradient-to-r from-indigo-600 via-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 hover:shadow-indigo-500/35 hover:-translate-y-0.5 active:translate-y-0'
                    }`}
                  >
                    {downloading ? (
                      <>
                        <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                        </svg>
                        Preparing Your Download...
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5 text-indigo-200" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                        </svg>
                        Download Asset ({formattedSize})
                      </>
                    )}
                  </a>

                  {downloadSuccess && (
                    <div className="p-3 bg-emerald-50 border border-emerald-200/80 rounded-xl text-center text-xs font-medium text-emerald-800 animate-fadeIn">
                      🎉 Download started! Check your browser downloads folder.
                    </div>
                  )}
                </div>
              </>
            )}

            {/* Expired State */}
            {data.isExpired && !data.isRevoked && (
              <div className="p-6 bg-amber-50/80 border border-amber-200/80 rounded-xl text-center space-y-2">
                <div className="w-10 h-10 mx-auto rounded-full bg-amber-100 text-amber-700 flex items-center justify-center font-bold text-lg">
                  ⏰
                </div>
                <h3 className="text-base font-bold text-amber-950">Download Link Expired</h3>
                <p className="text-xs text-amber-800 max-w-sm mx-auto leading-relaxed">
                  This download link expired on {expiryDate}. If you need renewed access to your files, please contact the creator.
                </p>
              </div>
            )}

            {/* Exhausted Download Limit State */}
            {data.isExhausted && !data.isExpired && !data.isRevoked && (
              <div className="p-6 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-2">
                <div className="w-10 h-10 mx-auto rounded-full bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-lg">
                  🔒
                </div>
                <h3 className="text-base font-bold text-slate-900">Download Limit Reached</h3>
                <p className="text-xs text-slate-600 max-w-sm mx-auto leading-relaxed">
                  You have reached the maximum limit of {data.maxDownloads} downloads for this link. If you need additional download credits, please reach out to {data.workspaceName}.
                </p>
              </div>
            )}

            {/* Revoked State */}
            {data.isRevoked && (
              <div className="p-6 bg-rose-50/80 border border-rose-200/80 rounded-xl text-center space-y-2">
                <div className="w-10 h-10 mx-auto rounded-full bg-rose-100 text-rose-700 flex items-center justify-center font-bold text-lg">
                  🚫
                </div>
                <h3 className="text-base font-bold text-rose-950">Access Revoked</h3>
                <p className="text-xs text-rose-800 max-w-sm mx-auto leading-relaxed">
                  Access to this digital asset has been revoked due to an order refund or dispute.
                </p>
              </div>
            )}

            {/* Instructions / Guidance */}
            <div className="border-t border-slate-100 pt-5 space-y-2 text-xs text-slate-500">
              <div className="flex items-start gap-2">
                <span className="text-emerald-500 font-bold">✓</span>
                <span>Direct, high-speed download with no account or registration required.</span>
              </div>
              <div className="flex items-start gap-2">
                <span className="text-indigo-500 font-bold">✓</span>
                <span>A confirmation email with your download receipt has been sent to your inbox.</span>
              </div>
            </div>

          </div>

          {/* Card Footer */}
          <div className="px-6 py-4 bg-slate-50/80 border-t border-slate-100 flex items-center justify-between text-xs text-slate-400">
            <span>Powered by CreatorHub Fulfillment</span>
            {storefrontUrl && (
              <a
                href={storefrontUrl}
                className="text-indigo-600 hover:text-indigo-700 font-medium transition-colors"
              >
                &larr; Back to Store
              </a>
            )}
          </div>

        </div>

        {/* Support Help Text */}
        <div className="text-center mt-6 text-xs text-slate-400">
          Having trouble? Need help with your purchase?{' '}
          <a href="mailto:support@creatorhub.online" className="text-slate-600 hover:underline font-medium">
            Contact Support
          </a>
        </div>

      </div>
    </div>
  )
}
