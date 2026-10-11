// Creates the Atlas Vector Search index over episodic memory.
// Usage: MONGODB_URI=... npm run setup:atlas
import { MongoClient } from 'mongodb'
import { EMBED_DIMS } from '../server/integrations.js'
import { getStore, VECTOR_INDEX } from '../server/store.js'

const uri = process.env.MONGODB_URI
if (!uri) throw new Error('MONGODB_URI is required')

await getStore() // seeds wardrobe + rules if empty
const client = await new MongoClient(uri).connect()
const episodes = client.db(process.env.MONGODB_DB || 'fitgate').collection('episodes')
const existing = await episodes.listSearchIndexes(VECTOR_INDEX).toArray()
if (existing.length) {
  console.log(`index ${VECTOR_INDEX} already exists (${String((existing[0] as Record<string, unknown>).status ?? '')})`)
} else {
  if ((await client.db(process.env.MONGODB_DB || 'fitgate').listCollections({ name: 'episodes' }).toArray()).length === 0) {
    await client.db(process.env.MONGODB_DB || 'fitgate').createCollection('episodes')
  }
  await episodes.createSearchIndex({
    name: VECTOR_INDEX,
    type: 'vectorSearch',
    definition: { fields: [{ type: 'vector', path: 'embedding', numDimensions: EMBED_DIMS, similarity: 'cosine' }] },
  })
  console.log(`created vector index ${VECTOR_INDEX} on episodes.embedding (${EMBED_DIMS} dims)`)
}
await client.close()
process.exit(0)
