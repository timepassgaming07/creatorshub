/**
 * @creatorhub/telemetry — logging, metrics, and tracing.
 *
 * Responsibilities: give every other package one way to say what happened, with
 * secrets stripped before anything leaves the process.
 *
 * Redaction ships first because it is the piece that must exist *before* the
 * first log call, not after the first leak. Structured logging, metrics, and
 * tracing arrive with the slices that need them.
 */
export { REDACTED, isSensitiveKey, redact, redactString } from './redact.js'
