# Fit Gate

A daily outfit stylist built as a **self-rewriting agent harness** with **long-horizon wardrobe memory**.

Built for the Harness Engineering & Model Wrangling #SFTechWeek Hackathon (Recursive Harnessing + Long Horizon Engineering).

## How it works

```
mood + occasion ──► retrieve similar past episodes (Voyage embeddings → Atlas $vectorSearch)
                ──► Claude builds 3 looks from wardrobe docs, obeying the current Style Rules
user reacts (Wear / Tweak / Pass + optional note)
                ──► episode stored with embedding (episodic memory)
                ──► Claude reads the signal + similar episodes and edits its OWN rule documents
                     (add / update text+weight / retire), each edit logged with its rationale
                ──► next generation runs on the rewritten policy
```

**Recursive harness.** Style Rules are documents in the `rules` collection. They are the agent's own policy, and the agent edits them. Every edit goes to `rule_events` with before/after values and the episode that caused it, so the evolution can be audited and shown live in the UI.

**Guardrails on self-modification** (`server/stylist.ts`):
- At most 2 edits per signal.
- At most 8 active rules.
- The agent can only update or retire rules that exist.
- Weights are clamped to 0..1, and a rule auto-retires when its weight drops below 0.15.

**Long-horizon memory.**
- `episodes`: every reaction, embedded with Voyage `voyage-3.5` (1024 dims).
- `wardrobe`: owned items, wear counts, and when each was last worn.
- Retrieval uses Atlas Vector Search.

## Collections (MongoDB Atlas, db `fitgate`)

| collection    | what                                                        |
| ------------- | ----------------------------------------------------------- |
| `wardrobe`    | items: category, color, tags, timesWorn, lastWorn           |
| `rules`       | Style Rules: text, applies, weight, version, origin, status |
| `rule_events` | harness log: op, before, after, rationale, episodeId        |
| `episodes`    | reactions plus Voyage embedding (vector index `episodes_vector`) |

## Run locally

```bash
npm install
cp .env.example .env   # fill in whatever keys you have
npm run setup:atlas    # once: seeds data + creates the vector index (needs MONGODB_URI)
npm run dev
```

Every integration is optional and degrades gracefully. The status pills in the header show what is live:

| missing key          | fallback                                    |
| -------------------- | ------------------------------------------- |
| `MONGODB_URI`        | in-process store (resets on restart)        |
| `VOYAGE_API_KEY`     | recency-based recall instead of vector search |
| `ANTHROPIC_API_KEY`  | `GROQ_API_KEY` (free Llama 3.3 70B), else a deterministic heuristic stylist and rule editor |
| `ELEVENLABS_API_KEY` | browser speech synthesis                    |

Speech-to-text uses the browser Web Speech API (Chrome or Safari).

## Deploy (Vercel)

`api/index.ts` is a single Node function. `vercel.json` routes `/api/*` to it, and the same router runs in dev through the Vite middleware in `vite.config.ts`.

```bash
vercel                 # set the env vars from .env.example in the Vercel project
```

In Atlas Network Access, allow Vercel's egress (or `0.0.0.0/0` for the hackathon).

## 60-second demo script

1. **Today**: pick Bold + Date, then Style me. Point at the "🧠" memory note and the "rules applied" badge.
2. Open a look, type "too dark for a date", and press **Pass**.
3. **Style Rules** opens and the stylist speaks. The rule that just changed is highlighted, and the Harness log shows the before/after diff and why.
4. Back to **Today**, then Restyle. The new looks cite the new rule and avoid the rejected pieces.
5. Open **Voice**, tap the orb, and ask "what worked for my last date?". The answer is grounded in the retrieved episodes shown under it.
