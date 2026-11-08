# ReelGraph

A story graph for film: from a one-line logline to a pre-production package,
with every fact traced to its source line and every conflict flagged.

The current phase is the **continuity checker** proof of concept
(`docs/spec-continuity-poc.md`). It ingests a Fountain screenplay plus costume
and location sheets, extracts a story bible with any LLM, flags continuity
conflicts with exact citations, and shows the ripple effect of an edit. See
`ARCHITECTURE.md` for the full design and `DECISIONS.md` for every judgment
call.

## Quick start

```bash
npm install
cp .env.example .env    # add DATABASE_URL and the key(s) for the models you route to
npm test
npm run db:migrate      # create the tables (Postgres, or local PGlite if DATABASE_URL is unset)
npm run ingest          # parse + extract data/script.fountain and the sheets
npm run checks          # run the 8 continuity checks
npm run dev             # http://localhost:3000
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
| `npm run typecheck` / `npm test` | Types and the 91-test suite |

Add `--no-models` to any command to skip model calls.

## Deploying on Vercel

Set these environment variables in the Vercel project:

| Variable | Value |
|---|---|
| `DATABASE_URL` | Supabase **transaction pooler** string (port 6543), with the password URL-encoded (`@` → `%40`) |
| `OPEN_ROUTER_LLM_KEY` | your OpenRouter key |
| `MODEL_EXTRACT`, `MODEL_JUDGE`, `JUDGE_POLICY` | optional; without them an OpenRouter key routes both roles to the free-first default |

Run `npm run db:migrate` once from your machine (with the same `DATABASE_URL`)
before the first deploy and after any schema change. Functions run in `sin1`
to sit next to the database. Then open **Load script** in the app to upload a
screenplay, or load the bundled sample.

## The app

- **Load script**: upload a Fountain screenplay and optional costume and
  location sheets, or load the sample. Extraction and every check run on upload.
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
```

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
