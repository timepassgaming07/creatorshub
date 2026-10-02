'use client'

/**
 * Drag-and-drop uploader for product files and images.
 *
 * Each file goes straight from the browser to storage through a short-lived
 * signed URL (the app server never proxies the bytes when a bucket is
 * configured). Then the server verifies size and type, scans it, and attaches
 * it to the product. Progress is real, from the upload itself.
 */
import { useCallback, useRef, useState, type DragEvent } from 'react'
import { CheckCircle2, CircleAlert, RotateCcw, UploadCloud } from 'lucide-react'

import { cn } from '@/components/ds'
import {
  attachProductAssetAction,
  completeAssetUploadAction,
  initiateAssetUploadAction,
} from '@/lib/asset-actions'
import { formatBytes } from '@/lib/format'

type Role = 'deliverable' | 'cover_image' | 'gallery'

type Item = {
  readonly key: string
  readonly file: File
  progress: number
  state: 'uploading' | 'verifying' | 'done' | 'error'
  error?: string
}

const MAX_BYTES = 2 * 1024 * 1024 * 1024

function uploadWithProgress(
  url: string,
  file: File,
  headers: Readonly<Record<string, string>>,
  onProgress: (fraction: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest()
    xhr.open('PUT', url, true)
    for (const [key, value] of Object.entries(headers)) {
      // Browsers set Content-Length themselves and refuse it from script.
      if (key.toLowerCase() !== 'content-length') xhr.setRequestHeader(key, value)
    }
    xhr.upload.onprogress = (event) => {
      if (event.lengthComputable) onProgress(event.loaded / event.total)
    }
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve()
      else reject(new Error(`Upload failed (${String(xhr.status)}). Try again.`))
    }
    xhr.onerror = () => {
      reject(new Error('The connection dropped during upload. Try again.'))
    }
    xhr.send(file)
  })
}

export function FileDrop({
  workspaceId,
  productId,
  role,
  accept,
  multiple = true,
  label,
  hint,
  onUploaded,
  compact = false,
}: {
  readonly workspaceId: string
  readonly productId: string
  readonly role: Role
  readonly accept?: string
  readonly multiple?: boolean
  readonly label: string
  readonly hint: string
  readonly onUploaded: () => void
  readonly compact?: boolean
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)
  const [items, setItems] = useState<Item[]>([])

  const update = (key: string, patch: Partial<Item>) => {
    setItems((current) => current.map((item) => (item.key === key ? { ...item, ...patch } : item)))
  }

  const uploadOne = useCallback(
    async (item: Item) => {
      const { file, key } = item
      try {
        if (file.size === 0) throw new Error('This file is empty.')
        if (file.size > MAX_BYTES) throw new Error('Files can be up to 2 GB.')
        const mimeType = file.type || 'application/octet-stream'

        const started = await initiateAssetUploadAction(workspaceId, {
          filename: file.name,
          mimeType,
          byteSize: file.size,
        })
        if (!started.success) throw new Error(started.error.detail)

        await uploadWithProgress(started.data.uploadUrl, file, started.data.headers, (fraction) => {
          update(key, { progress: fraction })
        })

        update(key, { state: 'verifying', progress: 1 })
        const verified = await completeAssetUploadAction(workspaceId, started.data.assetId, file.size, mimeType)
        if (!verified.success) throw new Error(verified.error.detail)
        if (verified.data.scanStatus === 'infected') {
          throw new Error('This file failed the safety scan and was not attached.')
        }

        const attached = await attachProductAssetAction(workspaceId, productId, started.data.assetId, role)
        if (!attached.success) throw new Error(attached.error.detail)

        update(key, { state: 'done' })
        onUploaded()
      } catch (error) {
        update(key, { state: 'error', error: error instanceof Error ? error.message : 'Upload failed.' })
      }
    },
    [workspaceId, productId, role, onUploaded],
  )

  function accept_(files: FileList | null) {
    if (!files || files.length === 0) return
    const next: Item[] = [...files].slice(0, multiple ? 20 : 1).map((file) => ({
      key: `${file.name}-${String(file.size)}-${String(Date.now())}-${Math.random().toString(36).slice(2)}`,
      file,
      progress: 0,
      state: 'uploading',
    }))
    setItems((current) => [...current.filter((i) => i.state !== 'done'), ...next])
    for (const item of next) void uploadOne(item)
  }

  function onDrop(event: DragEvent) {
    event.preventDefault()
    setDragging(false)
    accept_(event.dataTransfer.files)
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault()
          setDragging(true)
        }}
        onDragLeave={() => {
          setDragging(false)
        }}
        onDrop={onDrop}
        className={cn(
          'flex w-full flex-col items-center justify-center rounded-xl border border-dashed text-center transition-colors',
          compact ? 'px-4 py-6' : 'px-6 py-10',
          dragging ? 'border-accent bg-accent-subtle' : 'border-border-default bg-surface-sunken/40 hover:border-border-control hover:bg-surface-sunken',
        )}
      >
        <span className="mb-3 flex size-10 items-center justify-center rounded-xl border border-border-subtle bg-surface-raised text-content-secondary shadow-elevation-1">
          <UploadCloud className="size-5" aria-hidden="true" />
        </span>
        <span className="text-body font-medium text-content-primary">{label}</span>
        <span className="mt-1 text-caption text-content-tertiary">{hint}</span>
      </button>
      <input
        ref={inputRef}
        type="file"
        className="sr-only"
        tabIndex={-1}
        aria-hidden="true"
        {...(accept ? { accept } : {})}
        multiple={multiple}
        onChange={(e) => {
          accept_(e.target.files)
          e.target.value = ''
        }}
      />

      {items.length > 0 && (
        <ul className="mt-3 space-y-2" aria-live="polite">
          {items.map((item) => (
            <li key={item.key} className="rounded-lg border border-border-subtle bg-surface-raised px-3.5 py-2.5">
              <div className="flex items-center gap-3">
                {item.state === 'done' ? (
                  <CheckCircle2 className="size-4 shrink-0 text-positive" aria-hidden="true" />
                ) : item.state === 'error' ? (
                  <CircleAlert className="size-4 shrink-0 text-critical" aria-hidden="true" />
                ) : (
                  <span className="size-4 shrink-0 animate-spin rounded-full border-2 border-border-default border-t-accent" aria-hidden="true" />
                )}
                <span className="min-w-0 flex-1 truncate text-body">{item.file.name}</span>
                <span className="shrink-0 text-caption text-content-tertiary tabular-nums">
                  {item.state === 'uploading'
                    ? `${String(Math.round(item.progress * 100))}%`
                    : item.state === 'verifying'
                      ? 'Scanning'
                      : item.state === 'done'
                        ? formatBytes(item.file.size)
                        : 'Failed'}
                </span>
                {item.state === 'error' && (
                  <button
                    type="button"
                    onClick={() => {
                      update(item.key, { state: 'uploading', progress: 0 })
                      void uploadOne({ ...item, state: 'uploading', progress: 0 })
                    }}
                    className="inline-flex items-center gap-1 text-caption font-medium text-accent hover:underline"
                  >
                    <RotateCcw className="size-3" aria-hidden="true" />
                    Retry
                  </button>
                )}
              </div>
              {item.state === 'uploading' && (
                <div className="mt-2 h-1 rounded-full bg-surface-sunken">
                  <div className="h-1 rounded-full bg-accent transition-[width]" style={{ width: `${String(item.progress * 100)}%` }} />
                </div>
              )}
              {item.error && <p className="mt-1.5 text-caption text-critical">{item.error}</p>}
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
