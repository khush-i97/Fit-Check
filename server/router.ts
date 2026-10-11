import { speak } from './integrations.js'
import { getStore } from './store.js'
import { ask, generateLooks, harnessState, react, status } from './stylist.js'
import type { Category, Look, Reaction } from './types.js'

const json = (data: unknown, init: number = 200) =>
  new Response(JSON.stringify(data), { status: init, headers: { 'Content-Type': 'application/json' } })

// Single entry point shared by the Vercel function (api/index.ts) and the
// Vite dev middleware (vite.config.ts).
export async function handle(req: Request): Promise<Response> {
  const url = new URL(req.url)
  const route = url.searchParams.get('route') || url.pathname.replace(/^\/api\/?/, '')
  const body: Record<string, any> = req.method === 'POST' ? ((await req.json().catch(() => ({}))) as Record<string, any>) : {}
  try {
    switch (`${req.method} ${route}`) {
      case 'GET status':
        return json(await status())
      case 'GET state':
        return json(await harnessState())
      case 'POST looks':
        return json(await generateLooks(String(body.mood ?? 'Bold'), String(body.occasion ?? 'Date')))
      case 'POST react':
        return json(await react(body.look as Look, body.reaction as Reaction, String(body.note ?? '')))
      case 'POST ask':
        return json(await ask(String(body.question ?? 'What should I wear today?')))
      case 'POST speak': {
        const audio = await speak(String(body.text ?? '').slice(0, 600))
        return audio ? new Response(audio, { headers: { 'Content-Type': 'audio/mpeg' } }) : new Response(null, { status: 204 })
      }
      case 'POST wardrobe': {
        const name = String(body.name ?? '').trim()
        if (!name) return json({ error: 'name required' }, 400)
        const store = await getStore()
        const item = {
          _id: name.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Date.now().toString(36),
          name,
          category: (body.category ?? 'top') as Category,
          color: String(body.color ?? ''),
          tags: Array.isArray(body.tags) ? body.tags.map(String) : [],
          timesWorn: 0,
        }
        await store.addWardrobeItem(item)
        return json(item)
      }
      case 'POST reset':
        await (await getStore()).reset()
        return json({ ok: true })
      default:
        return json({ error: `no route ${req.method} /api/${route}` }, 404)
    }
  } catch (err) {
    console.error('[fit-gate]', err)
    return json({ error: (err as Error).message }, 500)
  }
}
