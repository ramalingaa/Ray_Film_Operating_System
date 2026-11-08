@AGENTS.md

# ReelGraph — working rules

- Product spec for the current phase: `docs/spec-continuity-poc.md`. System design: `ARCHITECTURE.md`. Ambiguity log: `DECISIONS.md`.
- Work one milestone at a time (M0–M7 in the spec). State the plan first; run `npm test` and `npm run typecheck` before committing; commit after each milestone.
- Every fact needs a source pointer (document, line, snippet ≤ 25 words). No pointer, no fact.
- Deterministic code first; models only for extraction and fuzzy judgment on code-generated candidates. Precision over recall.
- Never swallow errors: log to `agent_runs` / `pipeline_issues`.
- Checks are pure functions of `BibleState`. Each check has positive and negative tests with tiny fixtures.
- Prompts live in `src/lib/extract/prompts.ts`; bump `PROMPT_VERSION` when a prompt changes (it keys the cache).
- Never hardcode API keys; read from env. Never log script text anywhere except model calls.
- If a requirement is ambiguous, choose the simplest option and record it in `DECISIONS.md`.
