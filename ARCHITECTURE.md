# ReelGraph architecture

ReelGraph turns a story into a production-ready package: from a one-line
logline, through the screenplay, to the pre-production assets a film needs
(breakdowns, costume plot, location list, prop list, shot list, schedule,
budget top sheet). Every step is done by an **agent** that works through
**tools** against one shared **story graph**, and every claim it makes points
back to the source line it came from.

The first shipped slice is the **continuity checker** described in
`docs/spec-continuity-poc.md`. It is the evaluation core everything else
depends on: generated material is only as useful as our ability to check it.

---

## 1. Principles

1. **Provenance or it doesn't exist.** Every fact stores document, line,
   snippet, confidence, and the model (or deterministic stage) that produced it.
2. **Code decides what code can decide.** Parsing, day arithmetic, garment
   comparison, prop lifecycles, and graph walks are deterministic. Models
   extract facts and judge only the fuzzy cases, on candidate pairs that code
   picked out first.
3. **Precision over recall.** A false alarm costs more trust than a miss.
   Every check has a measured precision and recall against a seeded eval set.
4. **Nothing fails silently.** Each agent run is logged (`agent_runs`); every
   skip, retry, validation failure, or low-confidence fallback is logged as a
   `pipeline_issue` and shown in the UI.
5. **Model-agnostic.** Any agent role can run on any provider: Anthropic,
   OpenAI, Gemini, or open-weight models through OpenRouter, Groq, Together,
   Fireworks, DeepSeek, Mistral, or locally through Ollama, LM Studio, or vLLM.
   Judges can run as a cross-model ensemble for extra precision.
6. **Findings are conflicts, not verdicts.** "Scene 12 and the costume sheet
   disagree", never "you are wrong". Users accept, dismiss as intentional, or
   flag for follow-up, and dismissals persist across re-runs.

## 2. Layers

```
┌──────────────────────────────────────────────────────────────────────┐
│ UI (Next.js App Router)   script pane · findings · impact · eval      │
├──────────────────────────────────────────────────────────────────────┤
│ Orchestrator              stage DAG, incremental re-runs, run ledger  │
├──────────────────────────────────────────────────────────────────────┤
│ Agents                    one per stage; typed input → typed output   │
│   ├─ deterministic tools  parser, sheet loader, day resolver, checks  │
│   └─ model tools          extract(scene), judge(pair), generate(...)  │
├──────────────────────────────────────────────────────────────────────┤
│ Model gateway             provider adapters, role routing, fallback,  │
│                           ensembles, schema validation, response cache│
├──────────────────────────────────────────────────────────────────────┤
│ Story graph (Postgres)    documents · scenes · entities · facts ·     │
│                           findings · dismissals · runs · issues       │
└──────────────────────────────────────────────────────────────────────┘
```

| Layer | Code |
|---|---|
| Story graph | `src/lib/db/` (Drizzle schema + checked-in migrations) |
| Model gateway | `src/lib/llm/` |
| Agent runtime | `src/lib/agents/` |
| Parsing | `src/lib/fountain.ts`, `src/lib/sheets.ts` |
| Extraction agent | `src/lib/extract/` |
| Continuity checks | `src/lib/checks/` (one file per check + registry) |
| Change impact | `src/lib/impact/` |
| Evaluation | `src/lib/eval/`, `data/eval/` |

## 3. The story graph

A property graph stored in relational tables:

- **Nodes:** `entities` (character, location, prop, costume) and `scenes`.
- **Edges:** `facts` — `subject --predicate--> object`, scoped to a scene and
  story day, carrying provenance (`source_doc_id`, `source_line`,
  `source_snippet`, `confidence`, `extracted_by`).
- **Derived:** `findings` (check output) with a stable `signature` so
  `dismissals` survive re-runs.
- **Operational:** `llm_cache`, `agent_runs`, `pipeline_issues`,
  `entity_merges` (audit of every alias folded into a canonical entity).

**Why Postgres and not a graph database (yet).** The traversals we need
(scene → entity → later scenes → sheet rows) are two or three hops and run
fine as indexed joins or recursive CTEs. Production uses Supabase Postgres
through its transaction pooler (`DATABASE_URL`). Without `DATABASE_URL`, the
same schema and migrations run on PGlite (Postgres compiled to WASM,
in-process): in memory for tests, on disk under `data/pglite` for offline
work. One SQL dialect everywhere. Row-level security is enabled on every
table with no policies, so Supabase's public REST API cannot read or write
them; only the server's own connection can. `pgvector` for semantic search
over facts is available on the same database, and Neo4j/Memgraph for deep
traversals remains a storage addition, not a rewrite. We revisit this when
traversals go deeper than about four hops across many films.

## 4. Model gateway

- A model is addressed as `<provider>:<model-id>`, for example
  `anthropic:claude-sonnet-5`, `openai:gpt-5`, `gemini:gemini-3-pro`,
  `openrouter:qwen/qwen3-235b-a22b`, `ollama:llama4`.
- `anthropic` uses the official Anthropic SDK with structured outputs.
  All other providers go through one OpenAI-compatible adapter with JSON-schema
  response format, which covers OpenAI, Gemini, and essentially every hosted or
  local open-weight server.
- **Roles** (`MODEL_EXTRACT`, `MODEL_JUDGE`, later `MODEL_WRITE`, ...) map to
  an ordered list of models. Extraction falls back down the list on errors.
  Judging can run as an ensemble (`JUDGE_POLICY=unanimous|majority|primary`).
- Every response is validated with Zod. On failure the call is retried once
  with the validation error appended; then the stage logs a `pipeline_issue`
  and skips that unit of work.
- Responses are cached by `hash(input + prompt version + model)`, so re-runs
  cost nothing and are reproducible.

## 5. Agents

An agent is a named, versioned unit with a typed input, a typed output, and a
declared set of tools. The orchestrator gives it an `AgentContext` (database,
model gateway, ledger). Every run is written to `agent_runs`.

We use bounded agents: code decides the control flow, and the model makes
the judgments inside each step. Free-running tool loops, where the model picks
its next tool, are reserved for the generative writers' room stages (section
6), and even those write only through validated graph tools.

## 6. The full pipeline (target)

Each stage is an agent that reads from and writes to the story graph. Gates
are evaluation checkpoints: a stage's output is not consumed downstream until
its checks pass, or a human accepts the findings.

| # | Stage | Agent | Output in graph | Gate |
|---|---|---|---|---|
| 1 | Logline intake | Development | premise, genre, tone, theme | logline lint |
| 2 | World and characters | Character / World | character bible, relationships, locations | consistency |
| 3 | Structure | Story Architect | beat sheet (15 beats), act breaks | structure checks |
| 4 | Treatment | Treatment Writer | scene list with story days | timeline checks |
| 5 | Screenplay | Screenwriter (per scene) | Fountain draft, versioned | **continuity checks (this PoC)** |
| 6 | Script breakdown | Breakdown | cast, extras, props, wardrobe, SFX, vehicles per scene | coverage vs script |
| 7 | Department sheets | Wardrobe / Locations / Props | costume plot, location list, prop list | sheet vs script checks |
| 8 | Visual development | Lookbook / Storyboard | shot list, storyboard prompts | shot-scene coverage |
| 9 | Scheduling | 1st AD | stripboard, day-out-of-days | cast/location conflicts |
| 10 | Budget | Line Producer | budget top sheet | schedule ↔ budget consistency |

Stages 1 to 4 and 6 to 10 come after the PoC. The PoC accepts a hand-written
script and hand-made sheets, so the evaluation layer is proven before
generation is layered on top.

## 7. Change impact

Editing a scene re-parses the script, re-extracts only scenes whose text hash
changed, diffs facts, walks the graph from changed facts to dependents (later
scenes with the same entity, sheet rows, same-location scenes), re-runs checks,
and reports new, resolved, and unchanged findings. Earlier document versions
are kept, so any two versions can be diffed.

## 8. Evaluation

`data/eval/script.seeded.fountain` plants 20 to 30 realistic errors listed in
`seeded_errors.yaml`. `npm run eval` reports precision and recall per check,
plus the false-alarm count on the clean script. Demo target: precision ≥ 0.8
and recall ≥ 0.6 overall, with the deterministic checks near-perfect.
