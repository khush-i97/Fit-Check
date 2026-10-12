import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

// ---- Voyage AI embeddings (retrieval over past looks + feedback) ----

export const EMBED_DIMS = 1024

export async function embed(text: string, inputType: 'document' | 'query'): Promise<number[] | null> {
  const key = process.env.VOYAGE_API_KEY
  if (!key) return null
  let res: Response
  try {
    res = await fetch(`${process.env.VOYAGE_BASE_URL || 'https://api.voyageai.com/v1'}/embeddings`, {
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ input: [text], model: process.env.VOYAGE_MODEL || 'voyage-4', input_type: inputType, output_dimension: EMBED_DIMS }),
    })
  } catch (err) {
    console.warn('[fit-gate] Voyage embed failed:', (err as Error).message)
    return null
  }
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

const MODEL = process.env.CLAUDE_MODEL || 'claude-opus-5-5'
let client: Anthropic | null = null

const FREE_PROVIDERS = [
  // Free tiers cap requests per model per day, so each provider lists fallbacks
  // tried in order on a quota (429) or overload (503) error.
  { name: 'gemini', key: 'GEMINI_API_KEY', url: 'https://generativelanguage.googleapis.com/v1beta/openai', models: ['gemini-3.8-flash', 'gemini-3.5-flash', 'gemini-3.5-flash-lite', 'gemini-3.1-flash-lite'] },
  { name: 'groq', key: 'GROQ_API_KEY', url: 'https://api.groq.com/openai/v1', models: ['llama-3.3-70b-versatile'] },
  { name: 'cerebras', key: 'CEREBRAS_API_KEY', url: 'https://api.cerebras.ai/v1', models: ['llama-3.3-70b'] },
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
  }, { timeout: 40_000, maxRetries: 0 })
  if (response.stop_reason === 'refusal') throw new Error('Claude declined the request')
  const text = response.content.flatMap(b => (b.type === 'text' ? [b.text] : [])).join('')
  return opts.schema.parse(JSON.parse(text))
}

async function openAICompatJSON<T extends z.ZodType>(opts: JSONRequest<T>): Promise<z.infer<T>> {
  const p = freeProvider()!
  const models = process.env.LLM_MODEL ? [process.env.LLM_MODEL, ...p.models] : [...p.models]
  const deadline = Date.now() + 50_000 // stay inside Vercel's 60s function limit
  const messages = [
    { role: 'system', content: `${opts.system}\n\nRespond with ONLY a JSON object matching this JSON Schema:\n${JSON.stringify(toJSONSchema(opts.schema))}` },
    { role: 'user', content: opts.prompt },
  ]
  const post = (b: object) => fetch(`${p.url}/chat/completions`, {
    method: 'POST',
    signal: AbortSignal.timeout(Math.max(deadline - Date.now(), 1_000)),
    headers: { Authorization: `Bearer ${process.env[p.key]}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(b),
  })
  let lastError = ''
  for (const model of models) {
    if (Date.now() > deadline - 2_000) break
    const body = { model, response_format: { type: 'json_object' }, temperature: 0.7, messages }
    let res = await post(body)
    // Some providers reject response_format; retry relying on the prompt alone.
    if (res.status === 400) {
      const { response_format: _rf, ...rest } = body
      res = await post(rest)
    }
    if (res.status === 429 || res.status === 503 || res.status === 404) {
      lastError = `${p.name}/${model} ${res.status}`
      console.warn(`[fit-gate] ${lastError}, trying next model`)
      continue
    }
    if (!res.ok) throw new Error(`${p.name}/${model} ${res.status}: ${await res.text()}`)
    const json = (await res.json()) as { choices: { message: { content: string } }[] }
    const text = json.choices[0].message.content.replace(/^```(?:json)?\s*|\s*```$/g, '')
    return opts.schema.parse(JSON.parse(text))
  }
  throw new Error(`all ${p.name} models unavailable (last: ${lastError || 'deadline'})`)
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
  const voice = process.env.ELEVENLABS_VOICE_ID || 'EXAVITQu4vr4xnSDxMaL'
  const res = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voice}?output_format=mp3_44100_128`, {
    method: 'POST',
    signal: AbortSignal.timeout(20_000),
    headers: { 'xi-api-key': key, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: process.env.ELEVENLABS_MODEL || 'eleven_flash_v2_5' }),
  })
  if (!res.ok) {
    console.warn('[fit-gate] ElevenLabs failed:', res.status, await res.text())
    return null
  }
  return res.arrayBuffer()
}
