/**
 * AI Domain Errors (Slice 10 §10.4, §10.5, §10.6).
 *
 * Explicit error types for typed error handling via Result<T, AiError>.
 */
export class AiError extends Error {
  readonly code: string
  readonly retryable: boolean

  constructor(message: string, code = 'AI_ERROR', retryable = false) {
    super(message)
    this.name = 'AiError'
    this.code = code
    this.retryable = retryable
  }
}

export class AiModelUnavailableError extends AiError {
  constructor(message = 'AI model service is currently unavailable or unreachable.') {
    super(message, 'AI_MODEL_UNAVAILABLE', true)
    this.name = 'AiModelUnavailableError'
  }
}

export class AiQuotaExceededError extends AiError {
  constructor(message = 'Workspace monthly AI generation token quota has been exceeded.') {
    super(message, 'AI_QUOTA_EXCEEDED', false)
    this.name = 'AiQuotaExceededError'
  }
}

export class AiSchemaValidationError extends AiError {
  readonly validationIssues: readonly unknown[]

  constructor(message: string, issues: readonly unknown[] = []) {
    super(message, 'AI_SCHEMA_VALIDATION_FAILED', true)
    this.name = 'AiSchemaValidationError'
    this.validationIssues = issues
  }
}

export class AiConfigurationError extends AiError {
  constructor(message: string) {
    super(message, 'AI_CONFIGURATION_ERROR', false)
    this.name = 'AiConfigurationError'
  }
}
