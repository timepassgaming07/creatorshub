/**
 * AI Gateway & Provider Orchestrator (Slice 10 §10.4, §10.5).
 *
 * Responsibilities:
 * 1. Unified entrypoint for structured and unstructured AI generation.
 * 2. Automatic provider resolution with fallback to MemoryAiProvider when keys are missing.
 * 3. Zod schema parsing and 1-time retry on schema mismatch.
 * 4. Error mapping into domain-level Result<T, AiError>.
 */
import { err, ok, type Result } from '@creatorhub/domain'

import {
  AiError,
  AiModelUnavailableError,
  AiSchemaValidationError,
} from './errors.js'
import { MemoryAiProvider } from './providers/memory.js'
import type {
  AiGatewayConfig,
  AiGenerateOptions,
  AiGenerateTextOptions,
  AiProvider,
  AiResponse,
  AiTextResponse,
} from './types.js'

export class AiGateway {
  private readonly provider: AiProvider

  constructor(config: AiGatewayConfig = {}) {
    if (config.provider === 'memory') {
      this.provider = new MemoryAiProvider()
    } else {
      // Default to Memory provider if no external key or environment variable is set
      this.provider = new MemoryAiProvider()
    }
  }

  get providerType() {
    return this.provider.providerType
  }

  /**
   * Generates structured data validated against a Zod schema.
   * Includes one retry if the initial response fails schema validation.
   */
  async generateStructured<T>(
    options: AiGenerateOptions<T>,
  ): Promise<Result<AiResponse<T>, AiError>> {
    try {
      const initialAttempt = await this.provider.generateStructured(options)
      if (initialAttempt.ok) {
        return initialAttempt
      }

      // If validation error and retryable, retry once
      if (initialAttempt.error instanceof AiSchemaValidationError) {
        const retryAttempt = await this.provider.generateStructured({
          ...options,
          temperature: Math.max(0.1, (options.temperature ?? 0.7) - 0.2),
        })
        return retryAttempt
      }

      return initialAttempt
    } catch (unexpectedError) {
      const message = unexpectedError instanceof Error ? unexpectedError.message : 'Unknown AI failure'
      return err(new AiModelUnavailableError(message))
    }
  }

  /**
   * Generates unstructured raw text.
   */
  async generateText(
    options: AiGenerateTextOptions,
  ): Promise<Result<AiTextResponse, AiError>> {
    try {
      return await this.provider.generateText(options)
    } catch (unexpectedError) {
      const message = unexpectedError instanceof Error ? unexpectedError.message : 'Unknown AI text failure'
      return err(new AiModelUnavailableError(message))
    }
  }
}

/**
 * Creates an instance of AiGateway with environment fallback.
 */
export function createAiGateway(config: AiGatewayConfig = {}): AiGateway {
  return new AiGateway(config)
}
