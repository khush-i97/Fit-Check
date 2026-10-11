import { MongoClient, type Db } from 'mongodb'
import { SEED_RULES, SEED_WARDROBE } from './seed.js'
import type { Episode, Rule, RuleEvent, WardrobeItem } from './types.js'

// Persistence layer. MongoDB Atlas when MONGODB_URI is set; otherwise an
// in-process store so the demo still runs without credentials.
export interface Store {
  kind: 'atlas' | 'memory'
  wardrobe(): Promise<WardrobeItem[]>
  addWardrobeItem(item: WardrobeItem): Promise<void>
  markWorn(itemIds: string[], at: string): Promise<void>
  rules(includeRetired?: boolean): Promise<Rule[]>
  upsertRule(rule: Rule): Promise<void>
  ruleEvents(limit: number): Promise<RuleEvent[]>
  logRuleEvent(ev: RuleEvent): Promise<void>
  insertEpisode(ep: Episode): Promise<void>
  recentEpisodes(limit: number): Promise<Episode[]>
  searchEpisodes(vector: number[] | null, limit: number): Promise<Episode[]>
  reset(): Promise<void>
}

export const VECTOR_INDEX = 'episodes_vector'

function cosine(a: number[], b: number[]) {
  let dot = 0, na = 0, nb = 0
  for (let i = 0; i < a.length; i++) { dot += a[i] * b[i]; na += a[i] * a[i]; nb += b[i] * b[i] }
  return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1)
}

const stripEmbedding = ({ embedding: _e, ...rest }: Episode): Episode => rest

class MemoryStore implements Store {
  kind = 'memory' as const
  private items = structuredClone(SEED_WARDROBE)
  private ruleDocs = structuredClone(SEED_RULES)
  private events: RuleEvent[] = []
  private episodes: Episode[] = []

  async wardrobe() { return this.items }
  async addWardrobeItem(item: WardrobeItem) { this.items.push(item) }
  async markWorn(ids: string[], at: string) {
    for (const it of this.items) if (ids.includes(it._id)) { it.timesWorn++; it.lastWorn = at }
  }
  async rules(includeRetired = false) {
    return this.ruleDocs.filter(r => includeRetired || r.status === 'active').sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }
  async upsertRule(rule: Rule) {
    const i = this.ruleDocs.findIndex(r => r._id === rule._id)
    if (i >= 0) this.ruleDocs[i] = rule
    else this.ruleDocs.push(rule)
  }
  async ruleEvents(limit: number) { return this.events.slice(-limit).reverse() }
  async logRuleEvent(ev: RuleEvent) { this.events.push(ev) }
  async insertEpisode(ep: Episode) { this.episodes.push(ep) }
  async recentEpisodes(limit: number) { return this.episodes.slice(-limit).reverse().map(stripEmbedding) }
  async searchEpisodes(vector: number[] | null, limit: number) {
    if (!vector) return this.recentEpisodes(limit)
    return this.episodes
      .filter(e => e.embedding)
      .map(e => ({ ...stripEmbedding(e), score: cosine(vector, e.embedding!) }))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit)
  }
  async reset() {
    this.items = structuredClone(SEED_WARDROBE)
    this.ruleDocs = structuredClone(SEED_RULES)
    this.events = []
    this.episodes = []
  }
}

class AtlasStore implements Store {
  kind = 'atlas' as const
  constructor(private db: Db) {}

  private get w() { return this.db.collection<WardrobeItem>('wardrobe') }
  private get r() { return this.db.collection<Rule>('rules') }
  private get ev() { return this.db.collection<RuleEvent>('rule_events') }
  private get ep() { return this.db.collection<Episode>('episodes') }

  async seedIfEmpty() {
    if ((await this.w.estimatedDocumentCount()) === 0) await this.w.insertMany(SEED_WARDROBE)
    if ((await this.r.estimatedDocumentCount()) === 0) await this.r.insertMany(SEED_RULES)
  }

  async wardrobe() { return this.w.find().sort({ category: 1 }).toArray() }
  async addWardrobeItem(item: WardrobeItem) { await this.w.insertOne(item) }
  async markWorn(ids: string[], at: string) {
    await this.w.updateMany({ _id: { $in: ids } }, { $inc: { timesWorn: 1 }, $set: { lastWorn: at } })
  }
  async rules(includeRetired = false) {
    return this.r.find(includeRetired ? {} : { status: 'active' }).sort({ updatedAt: -1 }).toArray()
  }
  async upsertRule(rule: Rule) { await this.r.replaceOne({ _id: rule._id }, rule, { upsert: true }) }
  async ruleEvents(limit: number) {
    return this.ev.find({}, { projection: { _id: 0 } }).sort({ at: -1 }).limit(limit).toArray()
  }
  async logRuleEvent(ev: RuleEvent) { await this.ev.insertOne(ev) }
  async insertEpisode(ep: Episode) { await this.ep.insertOne(ep) }
  async recentEpisodes(limit: number) {
    return this.ep.find({}, { projection: { embedding: 0 } }).sort({ at: -1 }).limit(limit).toArray()
  }
  async searchEpisodes(vector: number[] | null, limit: number) {
    if (!vector) return this.recentEpisodes(limit)
    try {
      return await this.ep.aggregate<Episode>([
        { $vectorSearch: { index: VECTOR_INDEX, path: 'embedding', queryVector: vector, numCandidates: limit * 20, limit } },
        { $project: { embedding: 0, score: { $meta: 'vectorSearchScore' } } },
      ]).toArray()
    } catch (err) {
      // Index not built yet (run `npm run setup:atlas`) — degrade to recency.
      console.warn('[fit-gate] $vectorSearch failed, using recency:', (err as Error).message)
      return this.recentEpisodes(limit)
    }
  }
  async reset() {
    await Promise.all([this.w.deleteMany({}), this.r.deleteMany({}), this.ev.deleteMany({}), this.ep.deleteMany({})])
    await this.seedIfEmpty()
  }
}

let storePromise: Promise<Store> | null = null

export function getStore(): Promise<Store> {
  storePromise ??= (async () => {
    const uri = process.env.MONGODB_URI
    if (!uri) {
      console.warn('[fit-gate] MONGODB_URI not set — using in-memory store')
      return new MemoryStore()
    }
    const client = new MongoClient(uri, { appName: 'fit-gate' })
    await client.connect()
    const store = new AtlasStore(client.db(process.env.MONGODB_DB ?? 'fitgate'))
    await store.seedIfEmpty()
    return store
  })()
  return storePromise
}
