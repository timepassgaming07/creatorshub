/**
 * AI Provider Types & Interfaces (Slice 10 §10.4, §10.5).
 */
import type { ZodType } from 'zod'
import type { Result } from '@creatorhub/domain'
import type { AiPromptId, AiProviderType } from '@creatorhub/contracts'

import type { AiError } from './errors.js'

export type AiGenerateOptions<T> = {
  readonly promptId: AiPromptId
  readonly systemPrompt: string
  readonly userPrompt: string
  readonly schema: ZodType<T>
  readonly temperature?: number
  readonly maxTokens?: number
  readonly modelOverride?: string
}

export type AiGenerateTextOptions = {
  readonly systemPrompt: string
  readonly userPrompt: string
  readonly temperature?: number
  readonly maxTokens?: number
  readonly modelOverride?: string
}

export type AiResponse<T> = {
  readonly data: T
  readonly rawJson: string
  readonly promptTokens: number
  readonly completionTokens: number
  readonly totalTokens: number
  readonly costMicroCents: bigint
  readonly model: string
  readonly provider: AiProviderType
}

export type AiTextResponse = {
  readonly text: string
  readonly promptTokens: number
  readonly completionTokens: number
  readonly totalTokens: number
  readonly costMicroCents: bigint
  readonly model: string
  readonly provider: AiProviderType
}

export type AiProvider = {
  readonly providerType: AiProviderType
  readonly defaultModel: string

  generateStructured<T>(
    options: AiGenerateOptions<T>,
  ): Promise<Result<AiResponse<T>, AiError>>

  generateText(
    options: AiGenerateTextOptions,
  ): Promise<Result<AiTextResponse, AiError>>
}

export type AiGatewayConfig = {
  readonly provider?: AiProviderType
  readonly openAiApiKey?: string
  readonly anthropicApiKey?: string
  readonly geminiApiKey?: string
  readonly defaultModel?: string
}
