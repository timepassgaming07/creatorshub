/**
 * Claude, through the Anthropic Messages API.
 *
 * Structured calls use the SDK's zod output format, so the API constrains the
 * response to the schema and the SDK parses it; the gateway still validates
 * the result and retries once on a mismatch. Refusal fallbacks are on: if the
 * model declines, the API retries the same request on a fallback model inside
 * the same call. Usage from the response becomes the cost recorded per call.
 */
import Anthropic from '@anthropic-ai/sdk'
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod'
import { err, ok, type Result } from '@creatorhub/domain'

import {
  AiConfigurationError,
  AiError,
  AiModelUnavailableError,
  AiSchemaValidationError,
} from '../errors.js'
import type {
  AiGenerateOptions,
  AiGenerateTextOptions,
  AiProvider,
  AiResponse,
  AiTextResponse,
} from '../types.js'

export const DEFAULT_ANTHROPIC_MODEL = 'claude-opus-5-5'

/** List prices in micro-cents per token (1 cent = 1,000,000 micro-cents). */
const PRICES: Readonly<Record<string, { readonly input: number; readonly output: number }>> = {
  'claude-opus-5-5': { input: 400, output: 2000 },
  'claude-opus-5': { input: 500, output: 2500 },
  'claude-opus-4-8': { input: 500, output: 2500 },
  'claude-sonnet-5-5': { input: 200, output: 1000 },
  'claude-haiku-4-5': { input: 100, output: 500 },
}

function costOf(model: string, inputTokens: number, outputTokens: number): bigint {
  const price = PRICES[model] ?? PRICES[DEFAULT_ANTHROPIC_MODEL] ?? { input: 400, output: 2000 }
  return BigInt(inputTokens * price.input + outputTokens * price.output)
}

function mapError(error: unknown): AiError {
  if (
    error instanceof Anthropic.AuthenticationError ||
    error instanceof Anthropic.PermissionDeniedError
  ) {
    return new AiConfigurationError('The Anthropic API key was rejected. Check ANTHROPIC_API_KEY.')
  }
  if (error instanceof Anthropic.RateLimitError) {
    return new AiModelUnavailableError('The AI service is busy right now. Try again in a minute.')
  }
  if (error instanceof Anthropic.BadRequestError) {
    return new AiError(`The AI request was not accepted: ${error.message}`, 'AI_BAD_REQUEST')
  }
  if (error instanceof Anthropic.APIError) {
    return new AiModelUnavailableError('The AI service did not respond. Try again in a moment.')
  }
  return new AiModelUnavailableError(error instanceof Error ? error.message : 'Unknown AI failure')
}

const REFUSED = new AiError(
  'The AI declined to write this. Rephrase the details and try again.',
  'AI_REFUSED',
)

export class AnthropicAiProvider implements AiProvider {
  readonly providerType = 'anthropic' as const
  readonly defaultModel: string
  private readonly client: Anthropic

  constructor(options: {
    readonly apiKey: string
    readonly model?: string | undefined
    readonly client?: Anthropic
  }) {
    if (!options.apiKey && !options.client)
      throw new AiConfigurationError('ANTHROPIC_API_KEY is not set.')
    this.client =
      options.client ?? new Anthropic({ apiKey: options.apiKey, maxRetries: 2, timeout: 60_000 })
    this.defaultModel = options.model ?? DEFAULT_ANTHROPIC_MODEL
  }

  async generateStructured<T>(
    options: AiGenerateOptions<T>,
  ): Promise<Result<AiResponse<T>, AiError>> {
    const model = options.modelOverride ?? this.defaultModel
    try {
      const response = await this.client.beta.messages.parse({
        model,
        max_tokens: options.maxTokens ?? 8000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: options.systemPrompt,
        messages: [{ role: 'user', content: options.userPrompt }],
        // Short marketing copy and summaries do not need deep reasoning.
        output_config: { effort: 'low', format: betaZodOutputFormat(options.schema) },
      })
      if (response.stop_reason === 'refusal') return err(REFUSED)
      if (response.stop_reason === 'max_tokens') {
        return err(new AiSchemaValidationError('The AI response was cut off before it finished.'))
      }
      const parsed = response.parsed_output
      if (parsed === null || parsed === undefined) {
        return err(new AiSchemaValidationError('The AI response did not match the expected shape.'))
      }
      const promptTokens = response.usage.input_tokens
      const completionTokens = response.usage.output_tokens
      return ok({
        data: parsed as T,
        rawJson: JSON.stringify(parsed),
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        costMicroCents: costOf(response.model, promptTokens, completionTokens),
        model: response.model,
        provider: this.providerType,
      })
    } catch (error) {
      return err(mapError(error))
    }
  }

  async generateText(options: AiGenerateTextOptions): Promise<Result<AiTextResponse, AiError>> {
    const model = options.modelOverride ?? this.defaultModel
    try {
      const response = await this.client.beta.messages.create({
        model,
        max_tokens: options.maxTokens ?? 8000,
        betas: ['server-side-fallback-2026-07-01'],
        fallbacks: 'default',
        system: options.systemPrompt,
        messages: [{ role: 'user', content: options.userPrompt }],
        output_config: { effort: 'low' },
      })
      if (response.stop_reason === 'refusal') return err(REFUSED)
      const text = response.content
        .flatMap((block) => (block.type === 'text' ? [block.text] : []))
        .join('')
        .trim()
      const promptTokens = response.usage.input_tokens
      const completionTokens = response.usage.output_tokens
      return ok({
        text,
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        costMicroCents: costOf(response.model, promptTokens, completionTokens),
        model: response.model,
        provider: this.providerType,
      })
    } catch (error) {
      return err(mapError(error))
    }
  }
}
