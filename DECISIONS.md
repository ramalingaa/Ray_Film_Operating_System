# Decisions

Assumptions made where the spec was ambiguous. Newest at the bottom.

1. **Default model is `claude-sonnet-5`.** The spec names `claude-sonnet-5-5`,
   which is not a published model id. Sonnet 5 is the current Sonnet.
   Override with `ANTHROPIC_MODEL` or `MODEL_EXTRACT` / `MODEL_JUDGE`.
2. **Multi-provider gateway** (beyond the spec's Anthropic-only stack), because
   the product goal is to run every stage on any model, open or closed.
   Anthropic goes through `@anthropic-ai/sdk`. Every other provider goes
   through one OpenAI-compatible adapter (`openai` SDK with a custom
   `baseURL`).
3. **Own Fountain parser** in `src/lib/fountain.ts` instead of `fountain-js`.
   We need exact source line numbers for every element, which `fountain-js`
   does not expose.
4. **Checks run on a loaded snapshot.** The spec says `run(db)`. Checks
   receive a `BibleState` loaded from the database by `loadState(db, docId)`,
   which keeps them pure functions of database state and lets unit tests use
   tiny in-memory fixtures with no SQLite at all.
5. **Story days are resolved in code.** The model reports each scene's day
   relation (`explicit N`, `same_day`, `next_day`, `later`, `unknown`).
   `resolveStoryDays` turns that into absolute days. An explicit
   `DAY N` / `SUPER: DAY N` in the text is also detected by the parser
   (confidence 1.0).
6. **Garment comparison uses a slot taxonomy** (outerwear, full body, top,
   bottom, footwear, headwear, accessory). Two descriptions conflict only when
   they fill the same slot with a different garment, or the same garment in
   explicitly different colours. A garment the sheet does not mention is not a
   conflict, because the sheet is often incomplete (precision first).
7. **Same-place-same-day prop conflicts** apply only to props the extractor
   marks as fixed in place (a piano, a mural). Hand props legitimately travel
   with characters.
8. **Impossible costume change** fires only when the next scene featuring the
   character is the next scene in the script and its time of day is
   `CONTINUOUS`, `MOMENTS LATER`, `SECONDS LATER`, `SAME`, or `SAME TIME`.
   Other cases are left to `costume_state_carryover` and human review.
9. **The extraction cache key leaves out the rolling summary.** It is
   hash(scene text + prompt version + extract model list), as the spec says.
   Editing scene 3 therefore does not re-extract scene 7, even though its
   context summary changed. This matches the impact engine's "re-extract only
   changed scenes" rule.
10. **The rolling summary is built in code** from earlier extractions
    (characters, last costume per character, props, learned facts, story day),
    not by a model. It is cheaper and reproducible.
11. **Model source pointers are verified, not trusted.** A snippet must occur
    in the scene (ignoring case and punctuation). A wrong line number is
    corrected to the real line. An unverifiable item is dropped and logged as a
    `verify` pipeline issue.
12. **`CONTINUOUS` / `MOMENTS LATER` / `LATER` headings pin a scene to the
    previous scene's story day** with confidence 1, whatever the model says.
13. **Ingest runs without models** (`--no-models`, or when no credentials are
    configured). Cues, headings, explicit days and sheet rows still become
    facts, and a warning issue records that model extraction did not run.
14. **Eval manifest has an optional `also_checks` list.** One planted swap can
    legitimately break two checks (a tuxedo in a CONTINUOUS scene contradicts
    both the costume sheet and the previous scene). Findings from an
    `also_checks` entry count as hits for precision, but are not required for
    recall.
15. **Eval matching is one-to-one and greedy**: largest scene overlap first,
    required checks before optional ones. Errors whose check is not
    implemented yet are reported as out of scope rather than counted as misses.
16. **Eval uses its own database** (`data/eval/eval.db`, gitignored), so eval
    runs never mix with the working story bible. Model responses are cached
    there too, so re-running the eval is free.
17. **The harness test drives a scripted fake extractor** that returns what a
    careful extractor would read. It shows that, given correct facts, the
    deterministic checks catch every planted error they own with zero false
    alarms. Real-model numbers come from `npm run eval` with a key configured.
18. **Judged checks are split into pure candidate generation plus a judge
    agent.** `candidates(state)` stays a pure function of the snapshot; only
    the runner (now async) calls models. Without a judge model, candidates are
    counted as "not judged" and logged, never silently turned into findings.
19. **Judge policies.** `primary`: the first judge that answers decides, and
    later judges are fallbacks. `majority` / `unanimous`: every judge votes,
    and a judge that fails is logged and left out of the vote. A vote counts as
    "conflict" only at or above `JUDGE_CONFIDENCE_THRESHOLD` (default 0.7).
    The reported confidence is the lowest among the agreeing votes.
20. **Deterministic parts of judged checks**: a location missing from the
    location sheet (medium) and an INT/EXT that disagrees with the sheet (low)
    are decided in code. `INT/EXT` on either side is compatible with both.
21. **Candidate rules.** Costume state carryover: the character's next scene,
    same story day or a no-gap time, same garment, now undamaged, no
    change-into. Time of day: heading bucket vs implied bucket, with
    CONTINUOUS/LATER inheriting the previous heading, and only clearly
    incompatible pairs (dusk vs evening never conflicts). Knowledge: a
    reference before a later "learns" by the same character that shares a
    content word. Location: each described scene vs the sheet notes and vs the
    previous described scene at that place.
22. **Extraction prompt v2** adds `location_details` (physical facts about a
    place). This bumps `PROMPT_VERSION`, which invalidates cached extractions.
23. **The UI shows the most recently ingested script** (highest document id).
    Picking a script or version in the UI is part of M7 (change impact).
24. **Dismissing or flagging applies to the finding's signature**, so the same
    conflict stays dismissed in later versions of the script and after
    re-runs. Reopening removes the dismissal.
25. **Pages read SQLite at request time** (`connection()` inside `<Suspense>`),
    as required with Cache Components enabled. Mutations are server actions
    that call `refresh()`.
26. **The eval page exists only outside production** (`notFound()` when
    `NODE_ENV=production`), per the spec's "dev only".
27. **Change impact matches scenes by scene number.** Inserting a scene without
    explicit `#n#` numbers renumbers every later scene, which then shows as
    changed. Use Fountain scene numbers for stable diffs across drafts.
28. **Facts are compared by content** (kind, subject, predicate, value,
    scene), not by story day. Story-day moves are reported separately as day
    shifts, so one removed `SUPER: DAY 2` reads as "scenes 6–10 move to day 1"
    rather than as dozens of changed facts.
29. **The graph walk stays narrow on purpose.** Later scenes are listed only
    for entities whose own facts changed. Costume rows are listed only when
    they cover an affected scene or story day. Same-location scenes are listed
    for scenes whose text changed.
30. **An edit always creates a new document version**, even if it restores an
    earlier text. Every version is kept, and any two can be compared.
