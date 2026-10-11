import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

// ---- Voyage AI embeddings (retrieval over past looks + feedback) ----

export const EMBED_DIMS = 1024

export async function embed(text: string, inputType: 'document' | 'query'): Promise<number[] | null> {
  const key = process.env.VOYAGE_API_KEY
  if (!key) return null
  const res = await fetch(`${process.env.VOYAGE_BASE_URL ?? 'https://api.voyageai.com/v1'}/embeddings`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ input: [text], model: process.env.VOYAGE_MODEL ?? 'voyage-3.5', input_type: inputType, output_dimension: EMBED_DIMS }),
  })
  if (!res.ok) {
    console.warn('[fit-gate] Voyage embed failed:', res.status, await res.text())
    return null
  }
  const json = (await res.json()) as { data: { embedding: number[] }[] }
  return json.data[0].embedding
}

// ---- LLM (look generation + harness self-rewrite) ----
// Claude when ANTHROPIC_API_KEY is set; otherwise the first free
// OpenAI-compatible provider with a key; otherwise callers use heuristics.

const MODEL = process.env.CLAUDE_MODEL ?? 'claude-opus-5-5'
let client: Anthropic | null = null

const FREE_PROVIDERS = [
  { name: 'gemini', key: 'GEMINI_API_KEY', url: 'https://generativelanguage.googleapis.com/v1beta/openai', model: 'gemini-2.5-flash' },
  { name: 'groq', key: 'GROQ_API_KEY', url: 'https://api.groq.com/openai/v1', model: 'llama-3.3-70b-versatile' },
  { name: 'cerebras', key: 'CEREBRAS_API_KEY', url: 'https://api.cerebras.ai/v1', model: 'llama-3.3-70b' },
] as const

export type LLM = 'claude' | (typeof FREE_PROVIDERS)[number]['name']

const freeProvider = () => FREE_PROVIDERS.find(p => process.env[p.key])

export const llmProvider = (): LLM | null =>
  process.env.ANTHROPIC_API_KEY ? 'claude' : freeProvider()?.name ?? null

interface JSONRequest<T extends z.ZodType> {
  system: string
  prompt: string
  schema: T
  effort?: 'low' | 'medium' | 'high'
}

export function llmJSON<T extends z.ZodType>(opts: JSONRequest<T>): Promise<z.infer<T>> {
  return llmProvider() === 'claude' ? claudeJSON(opts) : openAICompatJSON(opts)
}

async function claudeJSON<T extends z.ZodType>(opts: JSONRequest<T>): Promise<z.infer<T>> {
  client ??= new Anthropic()
  const response = await client.beta.messages.create({
    model: MODEL,
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    system: opts.system,
    output_config: {
      effort: opts.effort ?? 'low',
      format: { type: 'json_schema', schema: toJSONSchema(opts.schema) },
    },
    messages: [{ role: 'user', content: opts.prompt }],
  })
  if (response.stop_reason === 'refusal') throw new Error('Claude declined the request')
  const text = response.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('')
  return opts.schema.parse(JSON.parse(text))
}

async function openAICompatJSON<T extends z.ZodType>(opts: JSONRequest<T>): Promise<z.infer<T>> {
  const p = freeProvider()!
  const body = {
    model: process.env.LLM_MODEL ?? p.model,
    response_format: { type: 'json_object' },
    temperature: 0.7,
    messages: [
      { role: 'system', content: `${opts.system}\n\nRespond with ONLY a JSON object matching this JSON Schema:\n${JSON.stringify(toJSONSchema(opts.schema))}` },
      { role: 'user', content: opts.prompt },
    ],
  }
  const post = (b: object) => fetch(`${p.url}/chat/completions`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${process.env[p.key]}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(b),
  })
  let res = await post(body)
  // Some providers reject response_format; retry relying on the prompt alone.
  if (res.status === 400) {
    const { response_format: _rf, ...rest } = body
    res = await post(rest)
  }
  if (!res.ok) throw new Error(`${p.name} ${res.status}: ${await res.text()}`)
  const json = (await res.json()) as { choices: { message: { content: string } }[] }
  const text = json.choices[0].message.content.replace(/^```(?:json)?\s*|\s*```$/g, '')
  return opts.schema.parse(JSON.parse(text))
}

function toJSONSchema(schema: z.ZodType) {
  const json = z.toJSONSchema(schema) as Record<string, unknown>
  delete json.$schema
  return json
}

// ---- ElevenLabs text-to-speech (stylist voice) ----

export const hasVoice = () => Boolean(process.env.ELEVENLABS_API_KEY)

export async function speak(text: string): Promise<ArrayBuffer | null> {
  const key = process.env.ELEVENLABS_API_KEY
  if (!key) return null
  const voice = process.env.ELEVENLABS_VOICE_ID ?? 'EXAVITQu4vr4xnSDxMaL'
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL ?? 'eleven_flash_v2_5' }),
  })
  if (!res.ok) {
    console.warn('[fit-gate] ElevenLabs failed:', res.status, await res.text())
    return null
  }
  return res.arrayBuffer()
}
