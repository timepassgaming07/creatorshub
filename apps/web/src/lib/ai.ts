/**
 * Which AI backs the copilot. Claude when ANTHROPIC_API_KEY is set; the
 * deterministic memory provider only where test adapters are allowed, so a
 * production deploy without a key shows no AI buttons rather than fake copy.
 */
import { createAiGateway, type AiGateway } from '@creatorhub/ai'

import { allowsTestAdapters, envValue } from './env'

export function isAiAvailable(): boolean {
  return Boolean(envValue('ANTHROPIC_API_KEY')) || allowsTestAdapters()
}

export function getAiGateway(): AiGateway | null {
  const key = envValue('ANTHROPIC_API_KEY')
  const model = envValue('ANTHROPIC_MODEL')
  if (key) {
    return createAiGateway({
      provider: 'anthropic',
      anthropicApiKey: key,
      ...(model ? { defaultModel: model } : {}),
    })
  }
  if (allowsTestAdapters()) return createAiGateway({ provider: 'memory' })
  return null
}
