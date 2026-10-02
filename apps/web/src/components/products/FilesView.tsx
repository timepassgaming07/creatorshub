'use client'

import { FileText, FolderOpen } from 'lucide-react'

import { Badge, EmptyState, PageHeader, Table, Td, Th } from '@/components/ds'
import { formatBytes, formatDate } from '@/lib/format'

export type FileRow = {
  readonly id: string
  readonly filename: string
  readonly mimeType: string
  readonly byteSize: string
  readonly scanStatus: string
  readonly createdAt: string
  readonly previewUrl: string | null
}

export function FilesView({ files }: { readonly files: readonly FileRow[] }) {
  const total = files.reduce((sum, f) => sum + Number(f.byteSize), 0)
  return (
    <div>
      <PageHeader
        title="Files"
        description={`Everything you have uploaded: product files and images. ${formatBytes(total)} in total.`}
      />
      {files.length === 0 ? (
        <EmptyState
          icon={<FolderOpen />}
          title="No files yet"
          description="Files you upload to products appear here, with their safety-scan status."
        />
      ) : (
        <Table>
          <thead>
            <tr>
              <Th>File</Th>
              <Th>Type</Th>
              <Th>Scan</Th>
              <Th align="right">Size</Th>
              <Th align="right">Uploaded</Th>
            </tr>
          </thead>
          <tbody>
            {files.map((file) => (
              <tr key={file.id}>
                <Td>
                  <span className="flex items-center gap-3">
                    <span className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-md border border-border-subtle bg-surface-sunken">
                      {file.previewUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element -- media route
                        <img src={file.previewUrl} alt="" className="size-full object-cover" />
                      ) : (
                        <FileText className="size-4 text-content-tertiary" aria-hidden="true" />
                      )}
                    </span>
                    <span className="truncate font-medium">{file.filename}</span>
                  </span>
                </Td>
                <Td className="text-content-secondary">{file.mimeType}</Td>
                <Td>
                  {file.scanStatus === 'clean' ? (
                    <Badge tone="positive">Clean</Badge>
                  ) : file.scanStatus === 'infected' ? (
                    <Badge tone="critical">Blocked</Badge>
                  ) : (
                    <Badge tone="caution">Pending</Badge>
                  )}
                </Td>
                <Td align="right">{formatBytes(file.byteSize)}</Td>
                <Td align="right" className="text-content-tertiary">
                  {formatDate(file.createdAt)}
                </Td>
              </tr>
            ))}
          </tbody>
        </Table>
      )}
    </div>
  )
}
