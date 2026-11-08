# Story Bible: Film Continuity Checker (Proof of Concept)

## What we are building
A web app that ingests ONE screenplay (Fountain format) plus two small hand-made sheets (costumes, locations), extracts a structured "story bible" with an LLM, and runs continuity checks that flag conflicts with the exact source line cited. A change-impact view shows what is affected downstream when a scene is edited.

This is a proof of concept to demo to production houses. Evaluation comes first. Generative features (voice edits, storyboard help) are explicitly OUT of scope for this phase.

## Core principles
1. **Never say "you are wrong."** Findings are phrased as "here is a conflict between X and Y," and the user can accept, dismiss as intentional, or flag for follow-up.
2. **Every extracted fact must carry a source pointer** (document, scene number, line number, quoted snippet under 25 words). No pointer, no fact.
3. **Precision over recall.** A false alarm costs more trust than a missed edge case. Tune for precision first.
4. **Deterministic rules first, LLM for fuzzy judgment only.** The LLM extracts facts and judges ambiguous conflicts. Code decides everything that can be decided with code.
5. **Measure everything** against the seeded-error evaluation set. No check ships without a precision/recall number.

## Tech stack
- TypeScript everywhere, Next.js (App Router), Tailwind for styling
- SQLite via `better-sqlite3` with Drizzle ORM (migrations checked in)
- Zod for all schema validation, including LLM outputs
- Anthropic SDK (`@anthropic-ai/sdk`), structured output through tool use, model read from `ANTHROPIC_MODEL` env var (default `claude-sonnet-5-5`)
- Vitest for tests
- Fountain parsing: use `fountain-js` if it handles scene headings, character cues, dialogue, and parentheticals with line numbers; otherwise write a small parser in `src/lib/fountain.ts`
- No auth, no multi-tenancy, no cloud deploy in this phase. Local only.

## Repo structure
```
/
  CLAUDE.md
  .env.example              # ANTHROPIC_API_KEY, ANTHROPIC_MODEL
  data/
    script.fountain         # the one screenplay
    costumes.csv            # character, story_day, scene_range, costume, state
    locations.csv           # location_name, aliases, int_ext, notes
    eval/
      script.seeded.fountain
      seeded_errors.yaml    # ground truth manifest of planted errors
  src/
    app/                    # Next.js pages and API routes
    lib/
      fountain.ts           # parse script into scenes with line numbers
      extract/              # LLM extraction pipeline
        prompts.ts
        schema.ts           # Zod schemas for extracted facts
        run.ts
      db/                   # Drizzle schema, migrations, queries
      checks/               # one file per check plus index.ts registry
      impact/               # change-impact engine
      eval/                 # scoring harness
    components/
  scripts/
    ingest.ts               # parse + extract + store
    run-checks.ts
    run-eval.ts
  tests/
```

## Data model (SQLite)
- `documents` (id, kind: script | costume_sheet | location_sheet, version, raw_text)
- `scenes` (id, doc_id, number, heading, int_ext, location_raw, time_of_day, start_line, end_line, text)
- `entities` (id, kind: character | location | prop | costume, canonical_name, aliases_json)
- `facts` (id, scene_id nullable, kind, subject_entity_id, predicate, object_value, story_day nullable, source_doc_id, source_line, source_snippet, confidence, extracted_at)
  - kinds: `appears_in`, `wears`, `located_at`, `time_of_day`, `story_day`, `has_prop`, `prop_state`, `learns_fact`, `references_fact`, `relationship`
- `findings` (id, check_id, severity, title, explanation, fact_ids_json, status: open | dismissed_intentional | follow_up, created_at)
- `dismissals` (id, finding_signature, reason, created_at) so dismissed findings do not reappear

Entity resolution: normalize character names (ALL-CAPS cues, "JOHN (V.O.)", nicknames) to canonical entities. Store aliases. Log every merge so it can be audited.

## Extraction pipeline
Process the script **one scene at a time**, with a rolling summary of prior scenes passed as context (characters introduced, current story day, known facts). For each scene, call the model with a tool whose input schema is the Zod-derived JSON schema for:
- characters present (name, speaking or silent)
- location and int/ext and time of day
- story day (explicit mention, or "same day / next day / unknown" with reasoning)
- costume or clothing mentions per character, including state (torn, wet, bloody)
- props introduced, used, or destroyed, with state
- facts a character learns, and references to facts a character already knows
- stated relationships

Rules for the prompt:
- Extract only what is stated or strongly implied by the text of THAT scene. Do not invent.
- Every item must include `source_line` and a short `source_snippet` copied from the scene.
- Output `unknown` rather than guessing.
- Validate with Zod; on failure retry once with the validation error appended, then log and skip the scene.
- Cache extraction results by hash of (scene text + prompt version + model) so re-runs are free.

Also parse `costumes.csv` and `locations.csv` deterministically into facts with `source_doc_id` set to the sheet. No LLM needed for those.

## Continuity checks (v1)
Each check lives in `src/lib/checks/<name>.ts`, exports `{ id, title, run(db): Finding[] }`, and is registered in `index.ts`. Every finding includes severity (high | medium | low), a plain-language explanation, and the fact IDs involved so the UI can highlight source lines.

1. **costume_sheet_mismatch** (deterministic): script says a character wears X in a scene; the costume sheet says Y for that story day or scene range.
2. **costume_state_carryover** (deterministic + LLM): a damage or wear state (torn, wet, bloody) appears and is missing from the next scene with no change of clothes between.
3. **impossible_costume_change** (deterministic): costume differs between consecutive scenes with no time gap or change scene in between.
4. **timeline_order** (deterministic): story days contradict scene order with no flashback marker.
5. **time_of_day_conflict** (deterministic + LLM): heading says NIGHT but dialogue or action implies morning, or the reverse.
6. **location_consistency** (LLM judge on candidate pairs): same location described incompatibly across scenes, or script location not found in the location sheet.
7. **character_knowledge** (LLM judge): a character references information before the scene in which they learned it.
8. **prop_lifecycle** (deterministic): prop used before introduction or after destruction, or in two places on the same story day.

For LLM-judged checks, first generate candidate pairs deterministically (same entity, nearby scenes) and only send those to the model. Require the model to answer with `conflict: true|false`, a confidence, and a one-sentence reason. Only surface findings with confidence at or above a configurable threshold (default 0.7).

## Change-impact engine
Input: an edited version of the script (upload a new `.fountain`) or an edit to one scene's text.
1. Re-parse and re-extract only the scenes whose text hash changed.
2. Diff the new facts against the stored facts.
3. For each changed or removed fact, walk the graph to find dependent facts and artifacts: later scenes featuring the same entity, costume sheet rows, location sheet rows.
4. Re-run all checks and diff findings (new, resolved, unchanged).
5. Output an impact report: "You changed scene 12. This touches: costume row for CHARACTER on day 3, scene 15 (same location), and creates 1 new finding."

Keep prior versions so the diff is always available.

## UI (keep it simple)
- Left pane: script text, scene by scene, with line numbers. Right pane: findings list grouped by severity.
- Clicking a finding scrolls to and highlights the source lines (and the sheet row, if relevant).
- Per finding: Dismiss as intentional (with optional reason) and Flag for follow-up.
- Tab for "Readiness report": counts by severity and check, open versus dismissed, and a one-page printable summary.
- Tab for "Impact": upload an edited script and see the ripple report.
- Tab for "Eval" (dev only): shows precision, recall, and the list of missed and false-alarm findings against the seeded manifest.

## Evaluation harness
- `data/eval/seeded_errors.yaml` lists each planted error: id, check_id it should trigger, scene numbers, description of what was changed.
- Create the seeded script by copying `script.fountain` and planting 20 to 30 errors spread across all checks. Prefer subtle, realistic errors (a costume swapped, a prop reappearing, a character referencing something early).
- `scripts/run-eval.ts` runs ingest and checks on the seeded script, matches findings to planted errors (same check and overlapping scenes), and prints precision, recall, and per-check breakdown to the console and to `data/eval/last_run.json`.
- Also run checks on the CLEAN script and report the false-alarm count. A clean script with many findings means the checks are too noisy.
- Target for the demo: precision at or above 0.8 and recall at or above 0.6 overall, with the deterministic checks near-perfect.

## Milestones (build in this order, commit after each)
**M0: Scaffold.** Next.js app, SQLite and Drizzle set up, env handling, Vitest running, one passing smoke test.
*Acceptance:* `npm run dev` serves a page; `npm test` passes.

**M1: Parse.** Fountain parser produces scenes with heading, int/ext, location, time of day, and line ranges. Load costume and location CSVs.
*Acceptance:* script's scene count and headings match a manual count; tests cover headings, dialogue, and edge cases (INT./EXT., "CONTINUOUS", V.O.).

**M2: Extract.** LLM extraction per scene with caching, Zod validation, source pointers, and entity resolution.
*Acceptance:* every fact has a source line; a spot check of 10 scenes shows no hallucinated facts; re-running costs zero API calls.

**M3: Deterministic checks.** Checks 1, 3, 4, and 8 with unit tests using small fixtures.
*Acceptance:* each check has passing positive and negative tests.

**M4: Eval harness and seeded script.** Build the seeded script and manifest, plus `run-eval.ts`.
*Acceptance:* the harness prints precision and recall for the deterministic checks.

**M5: LLM-judged checks.** Checks 2, 5, 6, and 7 with candidate generation and thresholds. Tune against the eval set.
*Acceptance:* overall precision at or above 0.8 on the seeded script; low false-alarm count on the clean script.

**M6: UI.** Script and findings panes, highlighting, dismissals, readiness report.
*Acceptance:* a non-technical person can open the app, click a finding, and understand the conflict without help.

**M7: Change-impact.** Edited-script upload, diff, ripple report.
*Acceptance:* editing one scene produces a correct list of affected facts and findings.

## Working rules for Claude Code
- Work one milestone at a time. Before starting a milestone, state the plan in a few lines; after finishing, run tests and summarize what changed.
- Write tests alongside code, especially for checks, using tiny hand-built fixtures.
- Never hardcode the API key. Read from env. Never log full script text to external services beyond the model calls.
- Keep prompts in `prompts.ts` with a `PROMPT_VERSION` constant that feeds the cache key.
- Prefer small, pure functions. Checks must be pure functions of the database state.
- If a requirement is ambiguous, pick the simplest option, note the assumption in a `DECISIONS.md` file, and continue.
- Do not add features outside this document (no auth, no generation, no multi-script support) without being asked.

## Out of scope for this phase
Generative edits and voice control, storyboard generation, multi-user collaboration, scheduling and budget data, production deployment, and support for Final Draft or PDF input.

## First step
Start at M0. Then confirm the screenplay and the two CSVs are in `data/`, and if they are not, create small placeholder versions (one 10-scene Fountain script with a costume sheet and a location sheet) so development can proceed.
