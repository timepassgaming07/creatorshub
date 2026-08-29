'use client'

/**
 * Asset Uploader Component with Live Progress and Failure Recovery (Item 3.8).
 *
 * Responsibilities:
 * - Drag-and-drop & file picker interface with size and format checks.
 * - Direct upload to storage with XMLHttpRequest progress tracking.
 * - Clear visual states: Idle, Initiating, Uploading (X%), Scanning/Verifying, Succeeded, Failed.
 * - Automatic and manual retry on network disconnects.
 * - Real-time feedback for infected or rejected files.
 */
import { useRef, useState, type DragEvent, type ReactNode } from 'react'
import { Button, useToast } from '@creatorhub/ui'

import {
  completeAssetUploadAction,
  initiateAssetUploadAction,
  type CompleteUploadResponse,
} from '@/lib/asset-actions'

export type AssetUploaderProps = {
  readonly workspaceId: string
  readonly onUploadComplete?: (asset: CompleteUploadResponse) => void
  readonly accept?: string
  readonly maxByteSize?: number // default 5GB
  readonly label?: string
  readonly description?: string
}

type UploadState =
  | { readonly status: 'idle' }
  | { readonly status: 'initiating'; readonly filename: string }
  | {
      readonly status: 'uploading'
      readonly filename: string
      readonly percent: number
      readonly loadedBytes: number
      readonly totalBytes: number
    }
  | { readonly status: 'scanning'; readonly filename: string }
  | { readonly status: 'success'; readonly asset: CompleteUploadResponse }
  | {
      readonly status: 'error'
      readonly filename: string
      readonly error: string
      readonly retryable: boolean
    }

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i] ?? 'B'}`
}

export function AssetUploader({
  workspaceId,
  onUploadComplete,
  accept,
  maxByteSize = 5 * 1024 * 1024 * 1024, // 5GB
  label = 'Upload asset or deliverable',
  description = 'Direct presigned upload with automated security and malware inspection.',
}: AssetUploaderProps): ReactNode {
  const toast = useToast()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const activeXhrRef = useRef<XMLHttpRequest | null>(null)
  const lastFileRef = useRef<File | null>(null)

  const [state, setState] = useState<UploadState>({ status: 'idle' })
  const [isDragOver, setIsDragOver] = useState(false)

  const handleCancel = () => {
    if (activeXhrRef.current) {
      activeXhrRef.current.abort()
      activeXhrRef.current = null
    }
    setState({ status: 'idle' })
  }

  const startUpload = async (file: File) => {
    lastFileRef.current = file

    if (file.size <= 0) {
      setState({
        status: 'error',
        filename: file.name,
        error: 'The selected file is empty (0 bytes).',
        retryable: false,
      })
      return
    }

    if (file.size > maxByteSize) {
      setState({
        status: 'error',
        filename: file.name,
        error: `File exceeds maximum permitted size of ${formatBytes(maxByteSize)}.`,
        retryable: false,
      })
      return
    }

    setState({ status: 'initiating', filename: file.name })

    // Step 1: Initiate upload on server to get presigned URL
    const initRes = await initiateAssetUploadAction(workspaceId, {
      filename: file.name,
      mimeType: file.type || 'application/octet-stream',
      byteSize: file.size,
    })

    if (!initRes.success) {
      setState({
        status: 'error',
        filename: file.name,
        error: initRes.error.detail,
        retryable: true,
      })
      toast.show({
        title: initRes.error.title,
        description: initRes.error.detail,
        variant: 'critical',
      })
      return
    }

    const { assetId, uploadUrl, headers } = initRes.data

    // Step 2: Upload via XMLHttpRequest with real-time progress
    setState({
      status: 'uploading',
      filename: file.name,
      percent: 0,
      loadedBytes: 0,
      totalBytes: file.size,
    })

    const xhr = new XMLHttpRequest()
    activeXhrRef.current = xhr

    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) {
        const percent = Math.round((event.loaded / event.total) * 100)
        setState({
          status: 'uploading',
          filename: file.name,
          percent,
          loadedBytes: event.loaded,
          totalBytes: event.total,
        })
      }
    }

    xhr.onload = async () => {
      activeXhrRef.current = null
      if (xhr.status >= 200 && xhr.status < 300) {
        // Step 3: Trigger server-side verification and malware scan
        setState({ status: 'scanning', filename: file.name })

        const compRes = await completeAssetUploadAction(
          workspaceId,
          assetId,
          file.size,
          file.type || 'application/octet-stream',
        )

        if (!compRes.success) {
          setState({
            status: 'error',
            filename: file.name,
            error: compRes.error.detail,
            retryable: true,
          })
          toast.show({
            title: compRes.error.title,
            description: compRes.error.detail,
            variant: 'critical',
          })
          return
        }

        if (compRes.data.scanStatus === 'infected') {
          setState({
            status: 'error',
            filename: file.name,
            error: `Security Scan Alert: ${compRes.data.scanReason ?? 'File failed safety checks.'}`,
            retryable: false,
          })
          toast.show({
            title: 'Malware Detected',
            description: 'This file contains suspicious signatures and cannot be delivered.',
            variant: 'critical',
          })
          return
        }

        setState({ status: 'success', asset: compRes.data })
        toast.show({
          title: 'Upload complete',
          description: `'${file.name}' verified and scanned clean.`,
          variant: 'success',
        })
        onUploadComplete?.(compRes.data)
      } else {
        setState({
          status: 'error',
          filename: file.name,
          error: `Storage upload failed with HTTP status ${xhr.status.toString()}.`,
          retryable: true,
        })
      }
    }

    xhr.onerror = () => {
      activeXhrRef.current = null
      setState({
        status: 'error',
        filename: file.name,
        error: 'Network connection dropped during upload.',
        retryable: true,
      })
      toast.show({
        title: 'Upload Disconnected',
        description: 'Connection lost. You can retry the upload immediately.',
        variant: 'critical',
      })
    }

    xhr.open('PUT', uploadUrl, true)
    for (const [key, val] of Object.entries(headers)) {
      xhr.setRequestHeader(key, val)
    }
    xhr.send(file)
  }

  const handleRetry = () => {
    if (lastFileRef.current) {
      void startUpload(lastFileRef.current)
    }
  }

  const handleFileChange = (files: FileList | null) => {
    const file = files?.[0]
    if (file) {
      void startUpload(file)
    }
  }

  const handleDragOver = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    setIsDragOver(true)
  }

  const handleDragLeave = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    setIsDragOver(false)
  }

  const handleDrop = (e: DragEvent<HTMLButtonElement>) => {
    e.preventDefault()
    setIsDragOver(false)
    handleFileChange(e.dataTransfer.files)
  }

  return (
    <div className="space-y-4">
      {state.status === 'idle' && (
        <button
          type="button"
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`w-full cursor-pointer rounded-xl border-2 border-dashed p-8 text-center transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
            isDragOver
              ? 'border-indigo-500 bg-indigo-50/50 dark:border-indigo-400 dark:bg-indigo-950/20'
              : 'border-neutral-300 bg-neutral-50 hover:bg-neutral-100/70 dark:border-neutral-700 dark:bg-neutral-900/50 dark:hover:bg-neutral-800/50'
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept={accept}
            className="hidden"
            onChange={(e) => {
              handleFileChange(e.target.files)
            }}
          />
          <div className="mx-auto flex size-12 items-center justify-center rounded-full bg-indigo-50 text-indigo-600 dark:bg-indigo-950/50 dark:text-indigo-400">
            <svg
              className="size-6"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
              />
            </svg>
          </div>
          <h3 className="mt-3 text-sm font-semibold text-neutral-900 dark:text-neutral-100">
            {label}
          </h3>
          <p className="mt-1 text-xs text-neutral-500 dark:text-neutral-400">{description}</p>
          <p className="mt-2 text-xs text-neutral-400">
            Max size: {formatBytes(maxByteSize)} · Drag and drop or browse
          </p>
        </button>
      )}

      {state.status === 'initiating' && (
        <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 text-center space-y-3">
          <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Preparing upload for <span className="font-semibold">{state.filename}</span>...
          </div>
          <div className="text-xs text-neutral-500 animate-pulse">
            Requesting presigned storage channel
          </div>
        </div>
      )}

      {state.status === 'uploading' && (
        <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 space-y-4">
          <div className="flex items-center justify-between text-sm">
            <div className="font-medium text-neutral-900 dark:text-neutral-100 truncate max-w-xs sm:max-w-md">
              {state.filename}
            </div>
            <div className="font-semibold text-indigo-600 dark:text-indigo-400">
              {state.percent}%
            </div>
          </div>

          {/* Progress bar */}
          <div className="w-full bg-neutral-200 rounded-full h-2.5 dark:bg-neutral-700 overflow-hidden">
            <div
              className="bg-indigo-600 h-2.5 rounded-full transition-all duration-150 ease-out"
              style={{ width: `${state.percent.toString()}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-xs text-neutral-500 dark:text-neutral-400">
            <div>
              {formatBytes(state.loadedBytes)} / {formatBytes(state.totalBytes)}
            </div>
            <Button variant="ghost" size="small" onClick={handleCancel}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      {state.status === 'scanning' && (
        <div className="rounded-xl border border-neutral-200 bg-white p-6 dark:border-neutral-800 dark:bg-neutral-900 text-center space-y-3">
          <div className="flex justify-center">
            <div className="size-6 animate-spin rounded-full border-2 border-indigo-600 border-t-transparent" />
          </div>
          <div className="text-sm font-medium text-neutral-900 dark:text-neutral-100">
            Scanning <span className="font-semibold">{state.filename}</span> for safety...
          </div>
          <p className="text-xs text-neutral-500 dark:text-neutral-400">
            Verifying magic bytes, content structure, and malware signatures.
          </p>
        </div>
      )}

      {state.status === 'success' && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-6 dark:border-emerald-900/50 dark:bg-emerald-950/20 space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex size-6 items-center justify-center rounded-full bg-emerald-100 text-emerald-700 dark:bg-emerald-900 dark:text-emerald-300">
                ✓
              </span>
              <div className="text-sm font-medium text-emerald-950 dark:text-emerald-200 truncate">
                {state.asset.filename}
              </div>
            </div>
            <span className="inline-flex items-center rounded-full bg-emerald-100 px-2.5 py-0.5 text-xs font-semibold text-emerald-800 dark:bg-emerald-900/80 dark:text-emerald-300">
              Clean & Verified
            </span>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              size="small"
              onClick={() => {
                setState({ status: 'idle' })
              }}
            >
              Upload Another
            </Button>
          </div>
        </div>
      )}

      {state.status === 'error' && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-6 dark:border-red-900/50 dark:bg-red-950/20 space-y-4">
          <div className="flex items-start gap-3">
            <span className="inline-flex size-6 shrink-0 items-center justify-center rounded-full bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300">
              !
            </span>
            <div>
              <h4 className="text-sm font-semibold text-red-900 dark:text-red-300">
                Upload Failed: {state.filename}
              </h4>
              <p className="mt-1 text-xs text-red-700 dark:text-red-400">{state.error}</p>
            </div>
          </div>
          <div className="flex justify-end gap-3 pt-2">
            <Button
              variant="secondary"
              size="small"
              onClick={() => {
                setState({ status: 'idle' })
              }}
            >
              Dismiss
            </Button>
            {state.retryable && (
              <Button variant="primary" size="small" onClick={handleRetry}>
                Retry Upload
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
