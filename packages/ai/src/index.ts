/**
 * Public exports for @creatorhub/ai (Slice 10 §10.4).
 */
export {
  AiConfigurationError,
  AiError,
  AiModelUnavailableError,
  AiQuotaExceededError,
  AiSchemaValidationError,
} from './errors.js'

export {
  AiGateway,
  createAiGateway,
} from './gateway.js'

export {
  MemoryAiProvider,
} from './providers/memory.js'

export { AnthropicAiProvider, DEFAULT_ANTHROPIC_MODEL } from './providers/anthropic.js'

export {
  analyticsInsightsPrompt,
  emailCampaignPrompt,
  productCopyPrompt,
  seoMetadataPrompt,
  storefrontCopyPrompt,
  type AnalyticsInsightsInput,
  type EmailCampaignInput,
  type ProductCopyInput,
  type PromptTemplate,
  type SeoMetadataInput,
  type StorefrontCopyInput,
} from './prompts/registry.js'

export type {
  AiGatewayConfig,
  AiGenerateOptions,
  AiGenerateTextOptions,
  AiProvider,
  AiResponse,
  AiTextResponse,
} from './types.js'
