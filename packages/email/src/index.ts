/**
 * @creatorhub/email — Transactional Email Port, Adapters, Templates, and Service.
 *
 * Responsibilities:
 * 1. Transactional receipt and digital file delivery emails.
 * 2. Pluggable EmailProvider interface with Memory adapter for testing.
 * 3. Light-theme creator-styled HTML email rendering.
 */

export { MemoryEmailProvider, type RecordedEmail } from './adapters/memory.js'
export { LogEmailProvider } from './adapters/log.js'
export {
  EmailDeliveryError,
  ResendEmailProvider,
  type ResendProviderOptions,
} from './adapters/resend.js'
export {
  escapeHtml,
  renderActionEmail,
  type RenderActionEmailInput,
  type RenderedActionEmail,
} from './templates/action.js'
export type {
  EmailAddress,
  EmailProvider,
  SendEmailInput,
  SendEmailResult,
} from './port.js'
export {
  formatMinorCurrency,
  type FormatCurrencyOptions,
  type SendOrderReceiptPayload,
  TransactionalEmailService,
} from './service.js'
export {
  type DownloadLinkItem,
  type ReceiptItem,
  type RenderedEmail,
  type RenderReceiptEmailInput,
  renderReceiptEmail,
} from './templates/receipt.js'
