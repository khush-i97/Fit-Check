export type Category = 'outer' | 'top' | 'bottom' | 'shoes' | 'bag' | 'accessory'
export type Reaction = 'wear' | 'tweak' | 'pass'

export interface WardrobeItem {
  _id: string
  name: string
  category: Category
  color: string
  tags: string[]
  timesWorn: number
  lastWorn?: string
}

export interface Rule {
  _id: string
  text: string
  applies: string
  weight: number // confidence 0..1; the harness raises/lowers it from signals
  status: 'active' | 'retired'
  origin: 'seed' | 'learned'
  version: number
  updatedAt: string
}

export interface RuleEvent {
  _id?: string
  ruleId: string
  op: 'add' | 'update' | 'retire'
  before: Pick<Rule, 'text' | 'applies' | 'weight'> | null
  after: Pick<Rule, 'text' | 'applies' | 'weight'> | null
  rationale: string
  episodeId: string
  at: string
}

export interface Episode {
  _id: string
  at: string
  mood: string
  occasion: string
  lookTitle: string
  itemIds: string[]
  reaction: Reaction
  note: string
  text: string
  embedding?: number[]
  score?: number
}

export interface Look {
  id: string
  title: string
  mood: string
  occasion: string
  description: string
  itemIds: string[]
  pieces: { name: string; item: string }[]
  rulesApplied: string[]
  memoryNote: string
  image: string
}

export interface RuleOp {
  op: 'add' | 'update' | 'retire'
  ruleId: string | null
  text: string | null
  applies: string | null
  weight: number | null
  rationale: string
}
