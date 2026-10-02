/**
 * Browser side of an upload: ask for a signed URL, send the bytes straight to
 * storage with real progress, then have the server verify and scan the file.
 * Returns the asset id once the file is safe to use.
 */
import { completeAssetUploadAction, initiateAssetUploadAction } from './asset-actions'

export const MAX_UPLOAD_BYTES = 2 * 1024 * 1024 * 1024

function putWithProgress(
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

export async function uploadAsset(
  workspaceId: string,
  file: File,
  onProgress: (fraction: number) => void = () => undefined,
  onVerifying: () => void = () => undefined,
): Promise<string> {
  if (file.size === 0) throw new Error('This file is empty.')
  if (file.size > MAX_UPLOAD_BYTES) throw new Error('Files can be up to 2 GB.')
  const mimeType = file.type || 'application/octet-stream'

  const started = await initiateAssetUploadAction(workspaceId, {
    filename: file.name,
    mimeType,
    byteSize: file.size,
  })
  if (!started.success) throw new Error(started.error.detail)

  await putWithProgress(started.data.uploadUrl, file, started.data.headers, onProgress)

  onVerifying()
  const verified = await completeAssetUploadAction(
    workspaceId,
    started.data.assetId,
    file.size,
    mimeType,
  )
  if (!verified.success) throw new Error(verified.error.detail)
  if (verified.data.scanStatus === 'infected') {
    throw new Error('This file failed the safety scan and was not attached.')
  }
  return started.data.assetId
}
