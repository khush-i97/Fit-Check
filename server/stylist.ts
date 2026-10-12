import { z } from 'zod'
import { embed, hasVoice, llmJSON, llmProvider, type LLM } from './integrations.js'
import { imagesFor } from './seed.js'
import { getStore } from './store.js'
import type { Episode, Look, Reaction, Rule, RuleEvent, RuleOp, WardrobeItem } from './types.js'

// Guardrails on the self-modifying harness: the agent may rewrite its own
// rules, but only within these bounds.
const MAX_OPS_PER_SIGNAL = 2
const MAX_ACTIVE_RULES = 8
const MIN_WEIGHT_TO_KEEP = 0.15

const nowISO = () => new Date().toISOString()
const id = (p: string) => `${p}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`

const fmtRules = (rules: Rule[]) =>
  rules.map(r => `- [${r._id}] (w=${r.weight.toFixed(2)}, applies: ${r.applies}) ${r.text}`).join('\n') || '(none)'
const fmtWardrobe = (items: WardrobeItem[]) =>
  items.map(i => `- ${i._id}: ${i.name} [${i.category}, ${i.color}; ${i.tags.join(', ')}; worn ${i.timesWorn}x]`).join('\n')
const fmtEpisodes = (eps: Episode[]) =>
  eps.map(e => `- ${e.at.slice(0, 10)} ${e.reaction.toUpperCase()} "${e.lookTitle}" (${e.mood}/${e.occasion}): ${e.itemIds.join(', ')}${e.note ? ` — note: ${e.note}` : ''}`).join('\n') || '(no history yet)'

export async function status() {
  const store = await getStore()
  return {
    store: store.kind,
    llm: llmProvider(),
    voyage: Boolean(process.env.VOYAGE_API_KEY),
    voice: hasVoice(),
  }
}

// ---------------- Looks ----------------

const LooksSchema = z.object({
  looks: z.array(z.object({
    title: z.string(),
    description: z.string(),
    itemIds: z.array(z.string()),
    rulesApplied: z.array(z.string()),
    memoryNote: z.string(),
  })),
})

export async function generateLooks(mood: string, occasion: string) {
  const store = await getStore()
  const [items, rules] = await Promise.all([store.wardrobe(), store.rules()])
  const queryVec = await embed(`${mood} mood for ${occasion}`, 'query')
  const memories = await store.searchEpisodes(queryVec, 6)

  let drafts: z.infer<typeof LooksSchema>['looks']
  let engine: LLM | 'heuristic' = 'heuristic'
  if (llmProvider()) {
    try {
      const out = await llmJSON({
        schema: LooksSchema,
        system:
          'You are Fit Gate, a personal stylist agent. You build outfits ONLY from the user\'s wardrobe item ids. ' +
          'Your Style Rules are your own learned policy: obey high-weight rules strictly, low-weight rules loosely. ' +
          'Use past episodes (what the user wore or passed on) to avoid repeats of rejected combos and to lean into what worked.',
        prompt:
          `Mood: ${mood}\nOccasion: ${occasion}\n\nSTYLE RULES:\n${fmtRules(rules)}\n\nWARDROBE:\n${fmtWardrobe(items)}\n\n` +
          `RELEVANT MEMORY (retrieved):\n${fmtEpisodes(memories)}\n\n` +
          'Propose exactly 3 clearly different looks built for THIS mood and occasion: vary the key pieces across the three (no two looks sharing the same top and bottom), and prefer items whose tags match the occasion. Each: a short evocative title (2-4 words), one-line description, 3-5 itemIds ' +
          '(at most one per category), the rule ids you applied, and memoryNote: one sentence citing specific past episodes ' +
          'if any are relevant, otherwise what you will learn from this pick.',
      })
      drafts = out.looks
      engine = llmProvider()!
    } catch (err) {
      console.warn('[fit-gate] LLM looks failed, using heuristic:', (err as Error).message)
      drafts = heuristicLooks(mood, occasion, items, memories, rules)
    }
  } else {
    drafts = heuristicLooks(mood, occasion, items, memories, rules)
  }

  const byId = new Map(items.map(i => [i._id, i]))
  const activeRuleIds = new Set(rules.map(r => r._id))
  const images = imagesFor(mood, occasion)
  const looks: Look[] = drafts.slice(0, 3).map((d, i) => {
    const valid = d.itemIds.filter(x => byId.has(x))
    return {
      id: id('look'),
      title: d.title,
      mood,
      occasion,
      description: d.description,
      itemIds: valid,
      pieces: valid.map(x => ({ name: byId.get(x)!.category.toUpperCase(), item: byId.get(x)!.name })),
      rulesApplied: d.rulesApplied.filter(r => activeRuleIds.has(r)),
      memoryNote: d.memoryNote,
      image: images[i % images.length],
    }
  })
  return { looks, memories, engine }
}

function heuristicLooks(mood: string, occasion: string, items: WardrobeItem[], memories: Episode[], rules: Rule[]) {
  const passed = new Set(memories.filter(m => m.reaction === 'pass').flatMap(m => m.itemIds))
  const want = [mood.toLowerCase(), occasion.toLowerCase()]
  const skipRules = rules.filter(r => r.text.startsWith('Skip ') && r.text.toLowerCase().includes(occasion.toLowerCase()))
  const skipPenalty = (i: WardrobeItem) => skipRules.filter(r => r.text.includes(i.name)).reduce((s, r) => s + r.weight * 10, 0)
  const score = (i: WardrobeItem) => i.tags.filter(t => want.includes(t)).length * 2 - (passed.has(i._id) ? 3 : 0) - skipPenalty(i) + Math.random()
  const cats = ['outer', 'top', 'bottom', 'shoes', 'bag', 'accessory'] as const
  return [0, 1, 2].map(n => {
    const itemIds = cats
      .map(c => items.filter(i => i.category === c).sort((a, b) => score(b) - score(a))[n % 2])
      .filter((i): i is WardrobeItem => Boolean(i) && (n !== 2 || i.category !== 'outer'))
      .slice(0, 5)
      .map(i => i._id)
    return {
      title: ['Signature Edit', 'Easy Alternate', 'Wildcard'][n],
      description: `A ${mood.toLowerCase()} take for ${occasion.toLowerCase()}.`,
      itemIds,
      rulesApplied: skipRules.map(r => r._id),
      memoryNote: memories.length ? `Steering away from ${passed.size} pieces you recently passed on.` : 'First look for this vibe — your reaction will teach me.',
    }
  })
}

// ---------------- Reactions → recursive harness ----------------

const RewriteSchema = z.object({
  ops: z.array(z.object({
    op: z.enum(['add', 'update', 'retire']),
    ruleId: z.string().nullable(),
    text: z.string().nullable(),
    applies: z.string().nullable(),
    weight: z.number().nullable(),
    rationale: z.string(),
  })),
  stylistLine: z.string(),
})

export async function react(look: Look, reaction: Reaction, note = '') {
  const store = await getStore()
  const at = nowISO()
  const text = `${reaction} on "${look.title}" for a ${look.mood} ${look.occasion}: ${look.pieces.map(p => p.item).join(', ')}. ${note}`.trim()
  const episode: Episode = {
    _id: id('ep'),
    at,
    mood: look.mood,
    occasion: look.occasion,
    lookTitle: look.title,
    itemIds: look.itemIds,
    reaction,
    note,
    text,
  }
  const embedding = await embed(text, 'document')
  if (embedding) episode.embedding = embedding
  await store.insertEpisode(episode)
  if (reaction === 'wear') await store.markWorn(look.itemIds, at)

  const rules = await store.rules()
  const similar = (await store.searchEpisodes(embedding, 8)).filter(e => e._id !== episode._id)

  let ops: RuleOp[]
  let stylistLine: string
  let engine: LLM | 'heuristic' = 'heuristic'
  if (llmProvider()) {
    try {
      const out = await llmJSON({
        schema: RewriteSchema,
        effort: 'medium',
        system:
          'You are the self-improvement loop of Fit Gate, a stylist agent. You maintain your OWN Style Rules — the policy ' +
          'that steers future outfit generation. Given a new hard signal (wear/tweak/pass) and similar past episodes, decide ' +
          `whether to add, update (rewrite text and/or change weight 0..1), or retire rules. At most ${MAX_OPS_PER_SIGNAL} ops. ` +
          'Prefer generalizing patterns across episodes over overfitting to one event. A "wear" should reinforce rules that ' +
          'produced the look (raise weight); a "pass" should weaken or refine them, or add a specific avoidance rule. ' +
          'Rules must be concrete and actionable (name colors, categories, occasions). Return [] ops if nothing should change.',
        prompt:
          `NEW SIGNAL: ${reaction.toUpperCase()}\nLook: "${look.title}" (${look.mood}/${look.occasion})\nItems: ${look.itemIds.join(', ')}\n` +
          `Rules that produced it: ${look.rulesApplied.join(', ') || '(none)'}\nUser note: ${note || '(none)'}\n\n` +
          `CURRENT RULES:\n${fmtRules(rules)}\n\nSIMILAR PAST EPISODES:\n${fmtEpisodes(similar)}\n\n` +
          'Also write stylistLine: one warm, spoken sentence (max 25 words) telling the user what you learned, citing past episodes if relevant.',
      })
      ops = out.ops
      stylistLine = out.stylistLine
      engine = llmProvider()!
    } catch (err) {
      console.warn('[fit-gate] LLM rewrite failed, using heuristic:', (err as Error).message)
      ;({ ops, stylistLine } = heuristicRewrite(look, reaction, rules, similar))
    }
  } else {
    ;({ ops, stylistLine } = heuristicRewrite(look, reaction, rules, similar))
  }

  const events = await applyOps(ops, rules, episode._id, at)
  return { episode: { ...episode, embedding: undefined }, events, stylistLine, engine, rules: await store.rules() }
}

function heuristicRewrite(look: Look, reaction: Reaction, rules: Rule[], similar: Episode[]) {
  const ops: RuleOp[] = []
  const combo = `${look.mood.toLowerCase()} + ${look.occasion.toLowerCase()}`
  const priorPasses = similar.filter(e => e.reaction === 'pass' && e.occasion === look.occasion).length
  for (const rid of look.rulesApplied.slice(0, 1)) {
    const r = rules.find(x => x._id === rid)
    if (r && !r.text.startsWith('Skip ')) ops.push({ op: 'update', ruleId: rid, text: null, applies: null, weight: r.weight + (reaction === 'wear' ? 0.15 : -0.2), rationale: `${reaction} on a look this rule produced` })
  }
  if (reaction === 'pass') {
    const lead = look.pieces[0]?.item ?? 'this pairing'
    const prefix = `Skip ${lead} for ${combo} days`
    const existing = rules.find(r => r.text.startsWith(prefix))
    if (existing) {
      ops.push({ op: 'update', ruleId: existing._id, text: `${prefix} (passed ${priorPasses + 1}x)`, applies: null, weight: existing.weight + 0.2, rationale: 'Repeated rejection — strengthening avoidance' })
    } else {
      ops.push({ op: 'add', ruleId: null, text: prefix, applies: look.occasion, weight: 0.4, rationale: 'Direct rejection signal' })
    }
  } else if (reaction === 'wear' && !look.rulesApplied.length) {
    ops.push({ op: 'add', ruleId: null, text: `${look.pieces.slice(0, 2).map(p => p.item).join(' + ')} works for ${combo}`, applies: look.occasion, weight: 0.5, rationale: 'Worn without an existing rule backing it' })
  }
  const stylistLine =
    reaction === 'pass' ? `Noted — I'll stop pushing that ${combo} energy${priorPasses ? `; that's ${priorPasses + 1} passes now` : ''}.`
    : reaction === 'wear' ? `Locked in. I'll remember this ${look.mood.toLowerCase()} look worked for ${look.occasion.toLowerCase()}.`
    : `Got it — I'll keep the bones of this look and adjust the details next time.`
  return { ops, stylistLine }
}

async function applyOps(ops: RuleOp[], rules: Rule[], episodeId: string, at: string) {
  const store = await getStore()
  const byId = new Map(rules.map(r => [r._id, r]))
  const events: RuleEvent[] = []
  const snap = (r: Rule | undefined) => (r ? { text: r.text, applies: r.applies, weight: r.weight } : null)
  const clamp = (w: number) => Math.round(Math.max(0, Math.min(1, w)) * 100) / 100
  let activeCount = rules.length

  for (const op of ops.slice(0, MAX_OPS_PER_SIGNAL)) {
    let before: Rule | undefined
    let after: Rule | undefined
    let kind = op.op
    if (op.op === 'add') {
      if (!op.text || activeCount >= MAX_ACTIVE_RULES) continue
      after = { _id: id('r'), text: op.text, applies: op.applies ?? 'All occasions', weight: clamp(op.weight ?? 0.5), status: 'active', origin: 'learned', version: 1, updatedAt: at }
      activeCount++
    } else {
      before = op.ruleId ? byId.get(op.ruleId) : undefined
      if (!before) continue // guardrail: can only touch rules that exist
      after = { ...before, version: before.version + 1, updatedAt: at }
      if (op.op === 'update') {
        after.text = op.text ?? before.text
        after.applies = op.applies ?? before.applies
        after.weight = clamp(op.weight ?? before.weight)
        if (after.weight < MIN_WEIGHT_TO_KEEP) { after.status = 'retired'; kind = 'retire' }
      } else {
        after.status = 'retired'
      }
      activeCount -= after.status === 'retired' ? 1 : 0
      byId.set(after._id, after)
    }
    await store.upsertRule(after)
    const ev: RuleEvent = { ruleId: after._id, op: kind, before: snap(before), after: after.status === 'retired' ? null : snap(after), rationale: op.rationale, episodeId, at }
    await store.logRuleEvent(ev)
    events.push(ev)
  }
  return events
}

// ---------------- Memory Q&A (voice) ----------------

const AskSchema = z.object({ answer: z.string() })

export async function ask(question: string) {
  const store = await getStore()
  const [rules, vec] = await Promise.all([store.rules(), embed(question, 'query')])
  const memories = await store.searchEpisodes(vec, 6)
  let answer: string
  if (llmProvider()) {
    try {
      const out = await llmJSON({
        schema: AskSchema,
        system: 'You are Fit Gate, a warm, concise personal stylist speaking aloud. Answer in at most 2 short sentences (under 45 words). Ground your answer in the user\'s actual history and your current rules; cite specifics.',
        prompt: `Question: ${question}\n\nSTYLE RULES:\n${fmtRules(rules)}\n\nRELEVANT MEMORY:\n${fmtEpisodes(memories)}`,
      })
      answer = out.answer
    } catch (err) {
      console.warn('[fit-gate] LLM ask failed:', (err as Error).message)
      answer = fallbackAnswer(memories, rules)
    }
  } else {
    answer = fallbackAnswer(memories, rules)
  }
  return { answer, memories }
}

function fallbackAnswer(memories: Episode[], rules: Rule[]) {
  const worn = memories.find(m => m.reaction === 'wear')
  const passed = memories.find(m => m.reaction === 'pass')
  if (!worn && !passed) return `I'm still learning you. Right now I'm leaning on "${rules[0]?.text ?? 'my defaults'}".`
  return [worn && `You wore "${worn.lookTitle}" for ${worn.occasion.toLowerCase()} and it landed.`, passed && `You passed on "${passed.lookTitle}", so I'm steering away from that.`].filter(Boolean).join(' ')
}

export async function harnessState() {
  const store = await getStore()
  const [rules, retired, events, episodes, wardrobe] = await Promise.all([
    store.rules(),
    store.rules(true).then(rs => rs.filter(r => r.status === 'retired')),
    store.ruleEvents(30),
    store.recentEpisodes(20),
    store.wardrobe(),
  ])
  return { rules, retired, events, episodes, wardrobe }
}
