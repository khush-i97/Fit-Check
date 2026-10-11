import type { Episode, Look, Reaction, Rule, RuleEvent, WardrobeItem } from '../server/types.ts'

export type { Episode, Look, Reaction, Rule, RuleEvent, WardrobeItem }

export interface Status { store: 'atlas' | 'memory'; claude: boolean; voyage: boolean; voice: boolean }
export interface HarnessState { rules: Rule[]; retired: Rule[]; events: RuleEvent[]; episodes: Episode[]; wardrobe: WardrobeItem[] }
export interface LooksResult { looks: Look[]; memories: Episode[]; engine: 'claude' | 'heuristic' }
export interface ReactResult { episode: Episode; events: RuleEvent[]; stylistLine: string; engine: 'claude' | 'heuristic'; rules: Rule[] }

async function call<T>(path: string, body?: unknown): Promise<T> {
  const res = await fetch(`/api/${path}`, body === undefined ? undefined : {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error((await res.json().catch(() => ({}))).error ?? res.statusText)
  return res.json()
}

export const api = {
  status: () => call<Status>('status'),
  state: () => call<HarnessState>('state'),
  looks: (mood: string, occasion: string) => call<LooksResult>('looks', { mood, occasion }),
  react: (look: Look, reaction: Reaction, note: string) => call<ReactResult>('react', { look, reaction, note }),
  ask: (question: string) => call<{ answer: string; memories: Episode[] }>('ask', { question }),
  addItem: (item: { name: string; category: string; color: string; tags: string[] }) => call<WardrobeItem>('wardrobe', item),
  reset: () => call<{ ok: true }>('reset', {}),
}

let currentAudio: HTMLAudioElement | null = null

// ElevenLabs via /api/speak; falls back to the browser voice when no key is set.
export async function speak(text: string) {
  currentAudio?.pause()
  window.speechSynthesis?.cancel()
  try {
    const res = await fetch('/api/speak', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ text }) })
    if (res.status === 200) {
      currentAudio = new Audio(URL.createObjectURL(await res.blob()))
      await currentAudio.play()
      return 'elevenlabs'
    }
  } catch { /* fall through to browser voice */ }
  if ('speechSynthesis' in window) {
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(text))
    return 'browser'
  }
  return 'none'
}

type Recognition = { lang: string; interimResults: boolean; onresult: (e: { results: ArrayLike<ArrayLike<{ transcript: string }>> }) => void; onerror: () => void; onend: () => void; start: () => void }

export function listen(onText: (t: string) => void, onEnd: () => void): boolean {
  const w = window as unknown as { SpeechRecognition?: new () => Recognition; webkitSpeechRecognition?: new () => Recognition }
  const Ctor = w.SpeechRecognition ?? w.webkitSpeechRecognition
  if (!Ctor) return false
  const rec = new Ctor()
  rec.lang = 'en-US'
  rec.interimResults = false
  rec.onresult = e => onText(e.results[0][0].transcript)
  rec.onerror = onEnd
  rec.onend = onEnd
  rec.start()
  return true
}
