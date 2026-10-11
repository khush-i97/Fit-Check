import { useCallback, useEffect, useState } from 'react'
import './index.css'
import { api, listen, speak, type Episode, type HarnessState, type Look, type Reaction, type RuleEvent, type Status } from './api'

type Screen = 'gate' | 'detail' | 'rules' | 'voice' | 'wardrobe'

const MOODS = ['Confident', 'Chill', 'Bold', 'Cozy', 'Sharp']
const OCCASIONS = ['Office', 'Date', 'Friends', 'Weekend', 'Event']
const CATEGORIES = ['outer', 'top', 'bottom', 'shoes', 'bag', 'accessory']

function StatusPills({ status }: { status: Status | null }) {
  if (!status) return null
  const pills: [string, boolean][] = [
    [status.store === 'atlas' ? 'Atlas' : 'Atlas (local)', status.store === 'atlas'],
    ['Voyage', status.voyage],
    [status.llm === 'groq' ? 'Groq' : 'Claude', Boolean(status.llm)],
    ['ElevenLabs', status.voice],
  ]
  return (
    <div className="hidden md:flex gap-1.5">
      {pills.map(([label, on]) => (
        <span key={label} className={`text-[10px] px-2 py-0.5 rounded-full border ${on ? 'bg-emerald-50 border-emerald-200 text-emerald-700' : 'bg-white border-sand text-muted'}`}>
          {on ? '●' : '○'} {label}
        </span>
      ))}
    </div>
  )
}

function EventRow({ ev, ruleText }: { ev: RuleEvent; ruleText?: string }) {
  const tone = ev.op === 'add' ? 'bg-emerald-100 text-emerald-700' : ev.op === 'retire' ? 'bg-rose-100 text-rose-700' : 'bg-purple-100 text-purple-700'
  return (
    <div className="bg-white rounded-xl p-3 border border-sand text-sm">
      <div className="flex items-center gap-2 mb-1">
        <span className={`text-[10px] uppercase tracking-wider px-2 py-0.5 rounded-full ${tone}`}>{ev.op}</span>
        <span className="text-xs text-muted">{new Date(ev.at).toLocaleTimeString()}</span>
      </div>
      {ev.before && ev.op !== 'add' && (
        <p className="text-muted line-through decoration-rose-300">{ev.before.text} <span className="text-xs">w={ev.before.weight}</span></p>
      )}
      {ev.after && <p className="font-medium">{ev.after.text} <span className="text-xs text-muted font-normal">w={ev.after.weight}</span></p>}
      {!ev.after && !ev.before && ruleText && <p>{ruleText}</p>}
      <p className="text-xs text-muted mt-1 italic">Why: {ev.rationale}</p>
    </div>
  )
}

function EpisodeRow({ ep }: { ep: Episode }) {
  const icon = ep.reaction === 'wear' ? '✓' : ep.reaction === 'pass' ? '✕' : '✦'
  return (
    <p className="text-sm text-muted">
      <span className="text-ink">{icon} {ep.reaction}</span> · “{ep.lookTitle}” · {ep.mood}/{ep.occasion}
      {ep.score !== undefined && <span className="text-xs"> · match {ep.score.toFixed(2)}</span>}
      {ep.note && <span className="italic"> — {ep.note}</span>}
    </p>
  )
}

export default function App() {
  const [screen, setScreen] = useState<Screen>('gate')
  const [status, setStatus] = useState<Status | null>(null)
  const [state, setState] = useState<HarnessState | null>(null)
  const [mood, setMood] = useState('Bold')
  const [occasion, setOccasion] = useState('Date')
  const [looks, setLooks] = useState<Look[]>([])
  const [looksMemory, setLooksMemory] = useState<Episode[]>([])
  const [engine, setEngine] = useState<string>('')
  const [loading, setLoading] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [selectedLook, setSelectedLook] = useState<Look | null>(null)
  const [note, setNote] = useState('')
  const [lastEvents, setLastEvents] = useState<RuleEvent[]>([])
  const [voiceText, setVoiceText] = useState('Ask me anything about your style — I remember what you wore and what you passed on.')
  const [voiceMemories, setVoiceMemories] = useState<Episode[]>([])
  const [question, setQuestion] = useState('')
  const [listening, setListening] = useState(false)
  const [newItem, setNewItem] = useState({ name: '', category: 'top', color: '', tags: '' })

  const refresh = useCallback(async () => {
    const [s, st] = await Promise.all([api.status(), api.state()])
    setStatus(s)
    setState(st)
  }, [])

  const run = async <T,>(label: string, fn: () => Promise<T>): Promise<T | undefined> => {
    setLoading(label)
    setError(null)
    try {
      return await fn()
    } catch (e) {
      setError((e as Error).message)
    } finally {
      setLoading(null)
    }
  }

  const styleMe = useCallback(async () => {
    const res = await run('Styling from your closet…', () => api.looks(mood, occasion))
    if (res) {
      setLooks(res.looks)
      setLooksMemory(res.memories)
      setEngine(res.engine)
    }
  }, [mood, occasion])

  useEffect(() => { refresh().catch(e => setError(e.message)) }, [refresh])

  const handleReaction = async (type: Reaction) => {
    if (!selectedLook) return
    const res = await run('Rewriting my rules…', () => api.react(selectedLook, type, note))
    if (!res) return
    setLastEvents(res.events)
    setVoiceText(res.stylistLine)
    setNote('')
    await refresh()
    setScreen('rules')
    speak(res.stylistLine)
    // Next looks should reflect the rewritten rules.
    setLooks([])
  }

  const askStylist = async (q: string) => {
    if (!q.trim()) return
    const res = await run('Searching your memory…', () => api.ask(q))
    if (!res) return
    setVoiceText(res.answer)
    setVoiceMemories(res.memories)
    speak(res.answer)
  }

  const startListening = () => {
    const ok = listen(t => { setQuestion(t); askStylist(t) }, () => setListening(false))
    if (ok) setListening(true)
    else setError('Speech recognition is not supported in this browser — type your question instead.')
  }

  const ruleText = (id: string) => [...(state?.rules ?? []), ...(state?.retired ?? [])].find(r => r._id === id)?.text ?? id
  const changedIds = new Set(lastEvents.map(e => e.ruleId))

  return (
    <div className="min-h-screen bg-cream text-ink">
      <header className="flex items-center justify-between px-4 md:px-6 py-4 border-b border-sand/80 gap-3">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 bg-ink text-cream flex items-center justify-center text-xs font-bold rounded">FG</div>
          <span className="font-display text-xl">Fit Gate</span>
        </div>
        <StatusPills status={status} />
        <nav className="flex gap-3 md:gap-4 text-sm text-muted">
          {([['gate', 'Today'], ['rules', 'Style Rules'], ['voice', 'Voice'], ['wardrobe', 'Wardrobe']] as const).map(([s, label]) => (
            <button key={s} onClick={() => setScreen(s)} className={screen === s ? 'text-ink font-medium' : ''}>{label}</button>
          ))}
        </nav>
      </header>

      {(loading || error) && (
        <div className={`text-center text-sm py-2 ${error ? 'bg-rose-50 text-rose-700' : 'bg-amber-50 text-amber-800'}`}>
          {error ?? loading}
        </div>
      )}

      <main className="max-w-5xl mx-auto px-4 py-6">
        {screen === 'gate' && (
          <div>
            <h1 className="font-display text-4xl md:text-5xl mb-2">Good morning —<br />what’s the vibe?</h1>
            <p className="text-muted mb-6">
              {state ? `${state.rules.length} active style rules · ${state.episodes.length} remembered outfits` : 'Loading your harness…'}
            </p>

            <div className="mb-4">
              <p className="text-xs uppercase tracking-wider text-muted mb-2">Mood</p>
              <div className="flex flex-wrap gap-2">
                {MOODS.map(m => (
                  <button key={m} onClick={() => setMood(m)} className={`px-4 py-2 rounded-full text-sm border transition ${mood === m ? 'bg-ink text-cream border-ink' : 'bg-white border-sand hover:border-ink/30'}`}>{m}</button>
                ))}
              </div>
            </div>

            <div className="mb-6">
              <p className="text-xs uppercase tracking-wider text-muted mb-2">Occasion</p>
              <div className="flex flex-wrap gap-2">
                {OCCASIONS.map(o => (
                  <button key={o} onClick={() => setOccasion(o)} className={`px-4 py-2 rounded-full text-sm border transition ${occasion === o ? 'bg-sand border-ink/20' : 'bg-white border-sand hover:border-ink/30'}`}>{o}</button>
                ))}
              </div>
            </div>

            <button onClick={styleMe} disabled={!!loading} className="mb-8 px-6 py-3 bg-ink text-cream rounded-full font-medium disabled:opacity-50">
              {looks.length ? 'Restyle me ↻' : 'Style me →'}
            </button>

            {looks.length > 0 && (
              <>
                <div className="grid md:grid-cols-3 gap-4">
                  {looks.map(look => (
                    <button key={look.id} onClick={() => { setSelectedLook(look); setScreen('detail') }} className="bg-white rounded-2xl overflow-hidden shadow-sm hover:shadow-md transition text-left border border-sand">
                      <div className="aspect-[4/5] bg-sand relative">
                        <img src={look.image} alt={look.title} className="w-full h-full object-cover" />
                        <div className="absolute top-3 left-3 bg-white/90 backdrop-blur px-2 py-1 rounded text-xs font-medium">{look.title}</div>
                        {look.rulesApplied.length > 0 && (
                          <div className="absolute bottom-3 left-3 bg-purple-100/95 text-purple-700 px-2 py-1 rounded-full text-[10px]">✦ {look.rulesApplied.length} rule{look.rulesApplied.length > 1 ? 's' : ''} applied</div>
                        )}
                      </div>
                      <div className="p-4">
                        <p className="text-xs text-muted mb-1">{look.pieces.map(p => p.item).join(' · ')}</p>
                        <p className="text-sm">{look.description}</p>
                        <p className="text-xs text-muted mt-2 italic">🧠 {look.memoryNote}</p>
                      </div>
                    </button>
                  ))}
                </div>
                <p className="text-xs text-muted mt-3">
                  Generated by {engine === 'claude' ? 'Claude' : engine === 'groq' ? 'Llama via Groq' : 'local heuristic'} from {state?.wardrobe.length ?? 0} wardrobe items, {state?.rules.length ?? 0} rules and {looksMemory.length} retrieved memories.
                </p>
              </>
            )}

            <div className="mt-8 flex justify-center">
              <button onClick={() => setScreen('voice')} className="w-16 h-16 rounded-full bg-gradient-to-br from-amber-100 to-amber-200 border-4 border-white shadow-lg flex items-center justify-center text-2xl">🎤</button>
            </div>
            <p className="text-center text-xs text-muted mt-2">Ask your stylist</p>
          </div>
        )}

        {screen === 'detail' && selectedLook && (
          <div className="max-w-md mx-auto">
            <button onClick={() => setScreen('gate')} className="text-sm text-muted mb-4">← Back</button>
            <h2 className="font-display text-3xl text-center mb-1">{selectedLook.title}</h2>
            <p className="text-center text-xs uppercase tracking-widest text-muted mb-6">{selectedLook.mood} · {selectedLook.occasion}</p>

            <div className="bg-white rounded-2xl p-6 mb-4 border border-sand">
              <img src={selectedLook.image} alt="" className="w-full max-h-80 object-contain mx-auto" />
              <div className="mt-4 space-y-2 text-sm">
                {selectedLook.pieces.map(p => (
                  <div key={p.item} className="flex justify-between text-muted">
                    <span className="uppercase text-xs">{p.name}</span>
                    <span>{p.item}</span>
                  </div>
                ))}
              </div>
            </div>

            {selectedLook.rulesApplied.length > 0 && (
              <div className="mb-4 text-xs">
                <p className="uppercase tracking-wider text-muted mb-1">Rules I followed</p>
                {selectedLook.rulesApplied.map(r => <p key={r} className="text-purple-700">✦ {ruleText(r)}</p>)}
              </div>
            )}
            <p className="text-xs text-muted italic mb-4">🧠 {selectedLook.memoryNote}</p>

            <input value={note} onChange={e => setNote(e.target.value)} placeholder="Optional: why? (e.g. too dark for daytime)" className="w-full mb-3 px-4 py-2 rounded-xl border border-sand bg-white text-sm" />
            <div className="flex gap-3">
              <button disabled={!!loading} onClick={() => handleReaction('wear')} className="flex-1 py-3 bg-ink text-cream rounded-xl font-medium disabled:opacity-50">✓ Wear it</button>
              <button disabled={!!loading} onClick={() => handleReaction('tweak')} className="flex-1 py-3 bg-sand rounded-xl font-medium disabled:opacity-50">✦ Tweak</button>
              <button disabled={!!loading} onClick={() => handleReaction('pass')} className="flex-1 py-3 border border-sand rounded-xl font-medium disabled:opacity-50">✕ Pass</button>
            </div>
            <p className="text-center text-xs text-muted mt-4">Your reaction is stored as memory and rewrites my rules</p>
          </div>
        )}

        {screen === 'rules' && (
          <div className="grid md:grid-cols-[3fr_2fr] gap-8">
            <div>
              <h2 className="font-display text-4xl mb-1">Style Rules</h2>
              <p className="text-muted mb-6">The policy I wrote for myself — and keep rewriting. ✦</p>
              {lastEvents.length > 0 && (
                <div className="mb-4 bg-purple-50 border border-purple-200 rounded-2xl p-4">
                  <p className="text-sm">🗣 {voiceText}</p>
                </div>
              )}
              <div className="space-y-3">
                {state?.rules.map(rule => (
                  <div key={rule._id} className={`bg-white rounded-2xl p-4 border transition ${changedIds.has(rule._id) ? 'border-purple-300 shadow-md ring-2 ring-purple-100' : 'border-sand'}`}>
                    <p className="font-medium">{rule.text}</p>
                    <div className="flex items-center gap-3 mt-2 text-xs text-muted">
                      <span>Applies to: {rule.applies}</span>
                      <span>v{rule.version}</span>
                      <span className={rule.origin === 'learned' ? 'text-purple-700' : ''}>{rule.origin}</span>
                    </div>
                    <div className="mt-2 h-1.5 bg-sand rounded-full overflow-hidden">
                      <div className="h-full bg-ink/70 transition-all duration-700" style={{ width: `${rule.weight * 100}%` }} />
                    </div>
                    {changedIds.has(rule._id) && <span className="inline-block mt-2 text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">Just updated · Adapting to you</span>}
                  </div>
                ))}
              </div>
              {!!state?.retired.length && (
                <details className="mt-6 text-sm text-muted">
                  <summary className="cursor-pointer">{state.retired.length} retired rule{state.retired.length > 1 ? 's' : ''}</summary>
                  {state.retired.map(r => <p key={r._id} className="line-through mt-1">{r.text}</p>)}
                </details>
              )}
            </div>

            <div>
              <h3 className="font-display text-2xl mb-1">Harness log</h3>
              <p className="text-xs text-muted mb-4">Every self-edit, with the signal that caused it. Guardrails: ≤2 edits per signal, ≤8 active rules, weak rules auto-retire.</p>
              <div className="space-y-2">
                {state?.events.length ? state.events.map((ev, i) => <EventRow key={i} ev={ev} ruleText={ruleText(ev.ruleId)} />) : <p className="text-sm text-muted">No edits yet — react to a look.</p>}
              </div>
            </div>
          </div>
        )}

        {screen === 'voice' && (
          <div className="max-w-md mx-auto text-center">
            <button onClick={startListening} className={`w-40 h-40 mx-auto mb-6 rounded-full bg-gradient-to-br from-amber-100 via-amber-200 to-amber-300 shadow-inner flex items-center justify-center text-5xl transition ${listening ? 'animate-pulse scale-105' : ''}`}>
              {listening ? '🎙️' : '✨'}
            </button>
            <div className="bg-white/80 backdrop-blur rounded-2xl p-5 mb-4 border border-sand text-left">
              <p className="text-lg">{voiceText}</p>
              {voiceMemories.length > 0 && (
                <div className="mt-3 pt-3 border-t border-sand space-y-1">
                  <p className="text-xs uppercase tracking-wider text-muted">Memories I used</p>
                  {voiceMemories.slice(0, 3).map(m => <EpisodeRow key={m._id} ep={m} />)}
                </div>
              )}
            </div>
            <form onSubmit={e => { e.preventDefault(); askStylist(question) }} className="flex gap-2">
              <input value={question} onChange={e => setQuestion(e.target.value)} placeholder="What worked for my last date?" className="flex-1 px-4 py-3 rounded-full border border-sand bg-white text-sm" />
              <button className="px-5 py-3 bg-ink text-cream rounded-full">Ask</button>
            </form>
            <p className="text-xs text-muted mt-3">Tap the orb to talk · {status?.voice ? 'ElevenLabs voice' : 'browser voice (add ELEVENLABS_API_KEY for ElevenLabs)'}</p>
          </div>
        )}

        {screen === 'wardrobe' && (
          <div>
            <h2 className="font-display text-3xl mb-2">Wardrobe</h2>
            <p className="text-muted mb-6">Long-horizon memory of what you own and what you’ve actually worn{status?.store === 'atlas' ? ' — stored in MongoDB Atlas' : ''}.</p>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {state?.wardrobe.map(item => (
                <div key={item._id} className="bg-white rounded-xl p-4 border border-sand text-sm">
                  <p className="font-medium">{item.name}</p>
                  <p className="text-xs text-muted mt-1">{item.category} · worn {item.timesWorn}×</p>
                </div>
              ))}
            </div>

            <form
              onSubmit={async e => {
                e.preventDefault()
                if (!newItem.name.trim()) return
                await run('Adding to closet…', () => api.addItem({ ...newItem, tags: newItem.tags.split(',').map(t => t.trim()).filter(Boolean) }))
                setNewItem({ name: '', category: 'top', color: '', tags: '' })
                refresh()
              }}
              className="mt-6 flex flex-wrap gap-2"
            >
              <input value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} placeholder="New item (e.g. Green Satin Skirt)" className="flex-1 min-w-48 px-4 py-2 rounded-xl border border-sand bg-white text-sm" />
              <select value={newItem.category} onChange={e => setNewItem({ ...newItem, category: e.target.value })} className="px-3 py-2 rounded-xl border border-sand bg-white text-sm">
                {CATEGORIES.map(c => <option key={c}>{c}</option>)}
              </select>
              <input value={newItem.tags} onChange={e => setNewItem({ ...newItem, tags: e.target.value })} placeholder="tags: bold, date" className="w-40 px-4 py-2 rounded-xl border border-sand bg-white text-sm" />
              <button className="px-5 py-2 bg-ink text-cream rounded-xl text-sm">Add</button>
            </form>

            <h3 className="font-display text-2xl mt-10 mb-3">Outfit memory</h3>
            <div className="space-y-1">
              {state?.episodes.length ? state.episodes.map(ep => <EpisodeRow key={ep._id} ep={ep} />) : <p className="text-sm text-muted">Nothing yet — wear or pass on a look.</p>}
            </div>

            <button onClick={async () => { await run('Resetting…', api.reset); setLooks([]); setLastEvents([]); refresh() }} className="mt-10 text-xs text-muted underline">Reset demo data</button>
          </div>
        )}
      </main>

      <footer className="text-center text-xs text-muted py-6 border-t border-sand">
        Fit Gate · Self-rewriting stylist harness · MongoDB Atlas · Voyage AI · Claude · ElevenLabs
      </footer>
    </div>
  )
}
