import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

// Serves /api/* in dev with the same handler Vercel runs in production.
function apiDev(): Plugin {
  return {
    name: 'fit-gate-api',
    configureServer(server) {
      server.middlewares.use('/api', async (req, res) => {
        const { handle } = await server.ssrLoadModule('/server/router.ts')
        const chunks: Buffer[] = []
        for await (const c of req) chunks.push(c as Buffer)
        const request = new Request(`http://localhost/api${req.url}`, {
          method: req.method,
          headers: req.headers as Record<string, string>,
          body: chunks.length ? Buffer.concat(chunks) : undefined,
        })
        const response: Response = await handle(request)
        res.statusCode = response.status
        response.headers.forEach((v, k) => res.setHeader(k, v))
        res.end(Buffer.from(await response.arrayBuffer()))
      })
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  Object.assign(process.env, loadEnv(mode, process.cwd(), ''))
  return { plugins: [react(), apiDev()] }
})
