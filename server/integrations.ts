import Anthropic from '@anthropic-ai/sdk'
import { z } from 'zod'

// ---- Voyage AI embeddings (retrieval over past looks + feedback) ----

export const EMBED_DIMS = 1024

export async function embed(text: string, inputType: 'document' | 'query'): Promise<number[] | null> {
  const key = process.env.VOYAGE_API_KEY
  if (!key) return null
  const res = await fetch('https://api.voyageai.com/v1/embeddings', {
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

// ---- Claude (look generation + harness self-rewrite) ----

const MODEL = process.env.CLAUDE_MODEL ?? 'claude-opus-5-5'
let client: Anthropic | null = null

export const hasClaude = () => Boolean(process.env.ANTHROPIC_API_KEY)

export async function claudeJSON<T extends z.ZodType>(opts: {
  system: string
  prompt: string
  schema: T
  effort?: 'low' | 'medium' | 'high'
}): Promise<z.infer<T>> {
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
