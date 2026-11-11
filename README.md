# Ray Studio

A story graph for film: from a one-line logline to a pre-production package,
with every fact traced to its source line and every conflict flagged.

A production moves through six chapters, like a real team would. Each one is
tested, explained line by line, and approved by a person before the next one
opens:

| Chapter | You provide | It tests | You decide |
|---|---|---|---|
| I. The Story | A story, treatment or logline (revise and re-test freely) | Logline elements, the 15 beats, setups, strengths, producer questions | Lock the story |
| II. The Screenplay | "Write it from my story", or your own (Fountain, Final Draft, text) | Pages and running time, structure and scene cards, the 8 continuity checks | Lock the script |
| III. The Breakdown | — | Cast, wardrobe, props, extras, vehicles, stunts, weapons, effects, minors; department alerts | Approve |
| IV. The Places | — | Sets, interior/exterior and day/night needs, sheet coverage | Approve |
| V. The Schedule | — | Draft stripboard, day-out-of-days, turnaround, child-hours and holding-day checks | Approve |
| VI. The Budget | — | Rough top sheet; every line shows quantity × rate and its source | Greenlight |

Start from a story (chapter I) or from a screenplay (chapter II). Reopening a
chapter resets the chapters after it.

Every finding cites the document and line it comes from. See
`docs/spec-production-pipeline.md`, `ARCHITECTURE.md` and `DECISIONS.md`.

## Quick start

```bash
npm install
cp .env.example .env    # add DATABASE_URL and the key(s) for the models you route to
npm test
npm run db:migrate      # create the tables (Postgres, or local PGlite if DATABASE_URL is unset)
npm run ingest          # parse + extract data/script.fountain and the sheets
npm run checks          # run the 8 continuity checks
npm run dev             # http://localhost:3000
npm run worker          # optional: keeps agents working when no page is open
```

Without any model key, everything still runs: the parser, the sheets and the
deterministic checks work, and the app tells you which steps were skipped.

| Command | What it does |
|---|---|
| `npm run ingest -- --script path.fountain` | Parse and extract a script (only new or changed scenes call a model) |
| `npm run checks [-- name.fountain]` | Run all checks on the latest version of a script |
| `npm run impact -- --script edited.fountain` | Save an edited script as the next version and print what it touches |
| `npm run impact -- --from 1 --to 2` | Compare any two stored versions |
| `npm run eval` | Score the checks against 20 planted errors in `data/eval/` |
| `npm run typecheck` / `npm test` | Types and the test suite |

Add `--no-models` to any command to skip model calls.

## Deploying on Vercel

Set these environment variables in the Vercel project:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase **transaction pooler** string (port 6543), with the password URL-encoded (`@` → `%40`) |
| `OPEN_ROUTER_LLM_KEY` | your OpenRouter key |
| `CRON_SECRET`, `AGENT_WORKER_ENABLED` | only when you activate the background agent worker (see below) |
| `MODEL_EXTRACT`, `MODEL_JUDGE`, `JUDGE_POLICY`, `MODEL_AGENT` | optional; without them an OpenRouter key routes every role to the free-first default (set `MODEL_AGENT` to a model that supports tool calling) |

Every Vercel build migrates the database first (the `vercel-build` script runs
`scripts/migrate.ts --deploy`, then `next build`), so the schema always matches
the code. A failed migration fails the build. Preview builds migrate the
database their `DATABASE_URL` points at too. Functions run in `sin1` to sit
next to the database.

The background agent worker (`/api/cron/agent`) is **asleep**: agents work
while their project page is open. To activate it, set
`AGENT_WORKER_ENABLED=1` and `CRON_SECRET`, then schedule calls to the route,
for example by adding to `vercel.json` (per-minute crons need Vercel Pro;
Hobby rejects deployments with crons that run more than once a day):

```json
"crons": [{ "path": "/api/cron/agent", "schedule": "* * * * *" }]
``` Then open **Load script** in the app to upload a
screenplay, or load the bundled sample.

## The app

- **Landing page** (`/`): what the product is and who it is for.
- **Workspace** (`/projects`): your projects on the left. A new project asks
  only for its name; everything else happens in a chat with the project's
  **agent**. Paste a logline or a story, or attach a screenplay (Fountain,
  Final Draft or text) and costume and location sheets (CSV). With only a
  rough idea, the agent helps you shape a short story first. Then it works
  through every chapter on autopilot: it runs the tests, reads each report,
  fixes what it can, approves the chapter, and moves on until the production
  is greenlit. The project page shows the conversation, with every tool call
  and its result, beside the reports produced so far. Message the agent at
  any time, or stop and resume it.
- **Chapter-by-chapter view** (`/runs/[id]`): approve, reopen and revise
  chapters by hand.
- **Review**: the script with line numbers next to the findings, grouped by
  severity. Click a finding to see the conflict in plain language and the exact
  lines it comes from. Dismiss it as intentional (with a reason) or flag it for
  follow-up. Both are remembered across re-runs and new versions.
- **Readiness report**: counts by severity and check, plus a printable summary.
- **Impact**: edit a scene or upload a new draft and see the scenes, sheet rows
  and findings it affects.
- **Pipeline health**: every agent run and every skipped or dropped item.
- **Eval** (dev only): precision, recall, misses and false alarms.

## Models

Every step names its models in `.env` as `provider:model`:

```
MODEL_EXTRACT=anthropic:claude-sonnet-5
MODEL_JUDGE=anthropic:claude-sonnet-5,openai:gpt-5,openrouter:qwen/qwen3-235b-a22b
JUDGE_POLICY=unanimous
MODEL_AGENT=anthropic:claude-sonnet-5
```

`MODEL_AGENT` runs the project agent and must support tool calling. Without
it (and without any model key), a scripted agent takes the same steps in the
standard order.

To run everything through OpenRouter, put the key in `.env` (git-ignored) as
`OPEN_ROUTER_LLM_KEY` or `OPENROUTER_API_KEY`:

```
OPEN_ROUTER_LLM_KEY=sk-or-...
MODEL_EXTRACT=openrouter:nvidia/nemotron-3.5-super-vl:free,openrouter:deepseek/deepseek-v4.1-flash
MODEL_JUDGE=openrouter:anthropic/claude-sonnet-5.5,openrouter:tencent/hy4,openrouter:google/gemini-3.8-flash
JUDGE_POLICY=majority
```

Providers: `anthropic`, `openai`, `gemini`, `openrouter`, `groq`, `together`,
`deepseek`, `mistral`, `fireworks`, `xai`, and local `ollama`, `lmstudio`,
`vllm`. Extra models in a list are fallbacks for extraction, and co-judges for
judging (`primary`, `majority` or `unanimous`).
