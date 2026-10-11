import { handle } from '../server/router.js'

export const config = { maxDuration: 60 }

export function GET(req: Request) {
  return handle(req)
}

export function POST(req: Request) {
  return handle(req)
}
