'use client'

/**
 * Domain and DNS Settings Manager for Storefront Studio (Item 4.8).
 *
 * Responsibilities:
 * - Subdomain customization and validation against reserved words and format constraints.
 * - Custom domain setup flow: initiation, DNS TXT challenge token and CNAME record instructions.
 * - Real-time DNS verification trigger and status indicators.
 * - One-click clipboard copy for DNS record parameters.
 * - Custom domain detachment and teardown.
 */
import { useState, type SyntheticEvent } from 'react'
import type { CustomDomainChallenge, CustomDomainStatus } from '@creatorhub/contracts'
import { Button } from '@creatorhub/ui'

type DomainSettingsProps = {
  readonly workspaceId: string
  readonly subdomain: string
  readonly onSubdomainChange: (val: string) => void
  readonly customDomain: string | null
  readonly customDomainStatus: CustomDomainStatus
  readonly domainChallenge: CustomDomainChallenge | null
  readonly onInitiateDomain: (domain: string) => Promise<void>
  readonly onVerifyDomain: () => Promise<void>
  readonly onRemoveDomain: () => Promise<void>
  readonly disabled?: boolean
}

export function DomainSettings({
  subdomain,
  onSubdomainChange,
  customDomain,
  customDomainStatus,
  domainChallenge,
  onInitiateDomain,
  onVerifyDomain,
  onRemoveDomain,
  disabled = false,
}: DomainSettingsProps) {
  const [domainInput, setDomainInput] = useState(customDomain ?? '')
  const [connecting, setConnecting] = useState(false)
  const [verifying, setVerifying] = useState(false)
  const [removing, setRemoving] = useState(false)
  const [copiedField, setCopiedField] = useState<string | null>(null)

  const handleCopy = async (text: string, fieldName: string) => {
    try {
      await navigator.clipboard.writeText(text)
      setCopiedField(fieldName)
      setTimeout(() => {
        setCopiedField(null)
      }, 2000)
    } catch {
      // Ignore clipboard write failures
    }
  }

  const handleConnect = async (e: SyntheticEvent) => {
    e.preventDefault()
    if (!domainInput.trim()) return
    setConnecting(true)
    try {
      await onInitiateDomain(domainInput.trim())
    } finally {
      setConnecting(false)
    }
  }

  const handleVerify = async () => {
    setVerifying(true)
    try {
      await onVerifyDomain()
    } finally {
      setVerifying(false)
    }
  }

  const handleRemove = async () => {
    setRemoving(true)
    try {
      await onRemoveDomain()
      setDomainInput('')
    } finally {
      setRemoving(false)
    }
  }

  return (
    <div className="space-y-8">
      {/* Subdomain Configuration */}
      <div>
        <label
          htmlFor="subdomain-input"
          className="block text-sm font-medium text-neutral-900 dark:text-neutral-100"
        >
          Storefront Subdomain
        </label>
        <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
          Your free CreatorHub hosted web address. Accessible worldwide over HTTPS.
        </p>

        <div className="mt-3 flex rounded-lg shadow-sm">
          <div className="relative flex flex-grow items-stretch focus-within:z-10">
            <input
              id="subdomain-input"
              type="text"
              value={subdomain}
              disabled={disabled}
              onChange={(e) => {
                onSubdomainChange(e.target.value.toLowerCase())
              }}
              placeholder="sarah-designs"
              className="block w-full rounded-l-lg border border-r-0 border-neutral-300 bg-white px-3 py-2 text-sm font-mono text-neutral-900 focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
          </div>
          <span className="inline-flex items-center rounded-r-lg border border-l-0 border-neutral-300 bg-neutral-50 px-3 text-sm font-mono text-neutral-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400">
            .creatorhub.com
          </span>
        </div>
      </div>

      <div className="border-t border-neutral-200 dark:border-neutral-800" />

      {/* Custom Domain Management */}
      <div>
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
              Custom Domain
            </h3>
            <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">
              Connect your own apex domain or subdomain (e.g.,{' '}
              <span className="font-mono">store.yourbrand.com</span>).
            </p>
          </div>

          {customDomain && (
            <span
              className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-semibold uppercase tracking-wide ${
                customDomainStatus === 'verified'
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300'
                  : customDomainStatus === 'pending'
                    ? 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300'
                    : 'bg-red-100 text-red-800 dark:bg-red-950/60 dark:text-red-300'
              }`}
            >
              {customDomainStatus === 'verified' && (
                <svg className="h-3 w-3" fill="currentColor" viewBox="0 0 20 20">
                  <path
                    fillRule="evenodd"
                    d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                    clipRule="evenodd"
                  />
                </svg>
              )}
              {customDomainStatus}
            </span>
          )}
        </div>

        {!customDomain ? (
          <form
            onSubmit={(e) => {
              void handleConnect(e)
            }}
            className="mt-4 flex gap-3"
          >
            <input
              type="text"
              value={domainInput}
              disabled={disabled || connecting}
              onChange={(e) => {
                setDomainInput(e.target.value.toLowerCase())
              }}
              placeholder="store.yourbrand.com"
              aria-label="Custom Domain"
              className="block flex-1 rounded-lg border border-neutral-300 bg-white px-3 py-2 text-sm font-mono text-neutral-900 shadow-sm focus:border-neutral-900 focus:outline-none focus:ring-1 focus:ring-neutral-900 dark:border-neutral-700 dark:bg-neutral-900 dark:text-neutral-100"
            />
            <Button
              type="submit"
              disabled={disabled || connecting || !domainInput.trim()}
              loading={connecting}
            >
              Connect Domain
            </Button>
          </form>
        ) : (
          <div className="mt-4 space-y-4">
            <div className="flex items-center justify-between rounded-lg border border-neutral-200 bg-neutral-50 px-4 py-3 dark:border-neutral-800 dark:bg-neutral-900">
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-medium text-neutral-900 dark:text-neutral-100">
                  {customDomain}
                </span>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="small"
                  onClick={() => {
                    void handleVerify()
                  }}
                  disabled={disabled || verifying}
                  loading={verifying}
                >
                  Verify DNS
                </Button>
                <Button
                  variant="danger"
                  size="small"
                  onClick={() => {
                    void handleRemove()
                  }}
                  disabled={disabled || removing}
                  loading={removing}
                >
                  Disconnect
                </Button>
              </div>
            </div>

            {/* DNS Instructions Card */}
            {domainChallenge && customDomainStatus !== 'verified' && (
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 dark:border-amber-900/50 dark:bg-amber-950/20">
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900 dark:text-amber-300">
                  Required DNS Records
                </h4>
                <p className="mt-1 text-xs text-amber-800 dark:text-amber-400">
                  Add these records to your domain registrar (Cloudflare, Namecheap, GoDaddy, etc.):
                </p>

                <div className="mt-3 space-y-3">
                  {/* TXT Record */}
                  <div className="rounded-lg bg-white p-3 shadow-xs dark:bg-neutral-900">
                    <div className="flex items-center justify-between text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      <span>1. TXT Verification Record</span>
                      <button
                        type="button"
                        onClick={() => {
                          void handleCopy(
                            `${domainChallenge.txtRecord.host} ${domainChallenge.txtRecord.value}`,
                            'txt',
                          )
                        }}
                        className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                      >
                        {copiedField === 'txt' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-mono">
                      <div>
                        <span className="text-neutral-400">Host:</span>
                        <div className="truncate text-neutral-900 dark:text-neutral-100">
                          {domainChallenge.txtRecord.host}
                        </div>
                      </div>
                      <div>
                        <span className="text-neutral-400">Value:</span>
                        <div className="truncate text-neutral-900 dark:text-neutral-100">
                          {domainChallenge.txtRecord.value}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* CNAME Record */}
                  <div className="rounded-lg bg-white p-3 shadow-xs dark:bg-neutral-900">
                    <div className="flex items-center justify-between text-xs font-semibold text-neutral-700 dark:text-neutral-300">
                      <span>2. CNAME Routing Record</span>
                      <button
                        type="button"
                        onClick={() => {
                          void handleCopy(
                            `${domainChallenge.cnameRecord.host} ${domainChallenge.cnameRecord.target}`,
                            'cname',
                          )
                        }}
                        className="text-neutral-500 hover:text-neutral-900 dark:hover:text-white"
                      >
                        {copiedField === 'cname' ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-2 text-xs font-mono">
                      <div>
                        <span className="text-neutral-400">Host:</span>
                        <div className="truncate text-neutral-900 dark:text-neutral-100">
                          {domainChallenge.cnameRecord.host}
                        </div>
                      </div>
                      <div>
                        <span className="text-neutral-400">Target:</span>
                        <div className="truncate text-neutral-900 dark:text-neutral-100">
                          {domainChallenge.cnameRecord.target}
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
