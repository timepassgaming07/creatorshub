import type Anthropic from '@anthropic-ai/sdk'
import { describe, expect, it, vi } from 'vitest'
import { z } from 'zod'

import { AnthropicAiProvider } from './anthropic.js'

const schema = z.object({ title: z.string() })

function fakeClient(response: Record<string, unknown> | Error) {
  const call = vi.fn((_params: unknown) =>
    response instanceof Error ? Promise.reject(response) : Promise.resolve(response),
  )
  const client = { beta: { messages: { parse: call, create: call } } } as unknown as Anthropic
  return { client, call }
}

const base = {
  model: 'claude-opus-5-5',
  stop_reason: 'end_turn',
  usage: { input_tokens: 1000, output_tokens: 200 },
  content: [{ type: 'text', text: 'Hello' }],
}

describe('AnthropicAiProvider', () => {
  it('returns parsed output with token usage and cost', async () => {
    const { client, call } = fakeClient({ ...base, parsed_output: { title: 'Golden Hour' } })
    const provider = new AnthropicAiProvider({ apiKey: 'test', client })
    const result = await provider.generateStructured({
      promptId: 'product_copy' as never,
      systemPrompt: 'sys',
      userPrompt: 'write',
      schema,
    })
    expect(result.ok).toBe(true)
    if (!result.ok) return
    expect(result.value.data).toEqual({ title: 'Golden Hour' })
    expect(result.value.totalTokens).toBe(1200)
    // 1000 × 400 + 200 × 2000 micro-cents
    expect(result.value.costMicroCents).toBe(800_000n)
    const params = call.mock.calls[0]?.[0] as Record<string, unknown>
    expect(params['fallbacks']).toBe('default')
    expect(params).not.toHaveProperty('temperature')
  })

  it('reports a refusal instead of empty output', async () => {
    const { client } = fakeClient({ ...base, stop_reason: 'refusal', parsed_output: null })
    const result = await new AnthropicAiProvider({ apiKey: 'test', client }).generateText({
      systemPrompt: 's',
      userPrompt: 'u',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.code).toBe('AI_REFUSED')
  })

  it('treats an unparseable response as a schema error, which the gateway retries', async () => {
    const { client } = fakeClient({ ...base, parsed_output: null })
    const result = await new AnthropicAiProvider({ apiKey: 'test', client }).generateStructured({
      promptId: 'product_copy' as never,
      systemPrompt: 's',
      userPrompt: 'u',
      schema,
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.name).toBe('AiSchemaValidationError')
  })

  it('maps a network failure to an unavailable error', async () => {
    const { client } = fakeClient(new Error('socket hang up'))
    const result = await new AnthropicAiProvider({ apiKey: 'test', client }).generateText({
      systemPrompt: 's',
      userPrompt: 'u',
    })
    expect(result.ok).toBe(false)
    if (!result.ok) expect(result.error.retryable).toBe(true)
  })
})
