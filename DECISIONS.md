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
16. **Eval uses its own database** (local PGlite in `data/eval/pglite`, gitignored), so eval
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
25. **Pages read the database at request time** (`connection()` inside `<Suspense>`),
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
31. **OpenRouter reads `OPENROUTER_API_KEY` or `OPEN_ROUTER_LLM_KEY`**, first
    non-empty wins. OpenRouter is reached through the existing OpenAI-compatible
    adapter (its API is OpenAI-compatible), not `@openrouter/sdk`, so every
    model call keeps going through one gateway with the same retry, fallback,
    validation, caching and `agent_runs` logging. Requests carry OpenRouter's
    app-attribution headers. Extraction asks for at most 8,000 output tokens,
    because OpenRouter reserves credit for `max_tokens` up front.
32. **No CrewAI.** CrewAI is a Python framework and this codebase is
    TypeScript. Bringing it in would mean a second runtime and a second place
    where model calls happen, outside the ledger and cache. The in-house agent
    runtime (`src/lib/agents/runtime.ts`) already plays that role: each agent
    has a name, a version, typed input/output, and a logged run, and all model
    traffic goes through `ModelGateway`. Revisit if a Python service is added.
33. **Default OpenRouter routing in `.env` is free-first** because the
    account has no purchased credit:
    `nvidia/nemotron-3.5-super-vl:free` (50 free requests/day), then
    `deepseek/deepseek-v4.1-flash`, then `tencent/hy4` as paid fallbacks.
    With credit, put a stronger judge first and use `JUDGE_POLICY=majority`.
34. **Postgres replaces SQLite** so the app can run on Vercel, whose file
    system is read-only and not shared between instances. Supabase is
    reached through its transaction pooler (port 6543, `prepare: false`),
    because the direct `db.<ref>.supabase.co` host is IPv6-only and Vercel
    functions connect over IPv4. Tests and offline runs use PGlite with the
    same migrations. Queries that relied on SQLite's implicit insertion order
    now say `ORDER BY` explicitly.
35. **The web server never migrates a remote database.** Run
    `npm run db:migrate` (or any CLI command, which migrates first) after a
    schema change. This keeps concurrent cold starts from racing on DDL.
36. **Row-level security on every table, no policies.** Supabase exposes the
    `public` schema through its REST API to anyone with the publishable key.
    With RLS on and no policies, that API sees nothing. The app connects as
    the table owner and is unaffected.
37. **Vercel functions run in `sin1` (Singapore)**, next to the Supabase
    project in `ap-southeast-1`, because ingest makes many sequential
    queries. Loading a script happens in the browser on `/load`; its server
    actions may run for up to 300 seconds (the Hobby-plan ceiling).
38. **With no `MODEL_EXTRACT` / `MODEL_JUDGE` set, an OpenRouter key alone is
    enough:** both roles default to the free-first OpenRouter list. An
    Anthropic key, if present, still takes precedence.
39. **Screenplay or story is decided by code.** Two or more Fountain scene
    headings, or one heading with dialogue, means a screenplay; anything else
    is a story. Final Draft (`.fdx`) is converted to Fountain by code.
    PDF and Word import are not supported yet: text extraction from PDFs loses
    screenplay layout and needs its own careful parser.
40. **A story becomes a generated scene outline**, not a full screenplay. The
    Adaptation agent returns structured scenes (heading parts, action, a quoted
    story excerpt); code renders the Fountain. No invented dialogue. Scenes
    whose excerpt is not in the story are reported. The outline is labelled
    generated wherever it appears.
41. **Runs advance in steps driven by the run page** (and a first step started
    on the server with `after()`), each within a 200-second budget, under a
    lease so only one step works on a run at a time. No queue service yet:
    closing the page pauses a run, reopening resumes it. Extraction and judge
    answers are cached, so resuming never repeats a model call.
42. **A run's script is stored under its title** (`<title-slug>.fountain`).
    Re-running the same title with changed text creates the next version, so
    the Impact page can compare drafts across runs.
43. **Page lengths are estimates** from Fountain (about 55 lines per page,
    action wrapped at 60 characters, dialogue at 35), shown in eighths and
    labelled as estimates. One page ≈ one minute of screen time.
44. **The old Load page is replaced by the Analyze home page**; the
    latest-script review moved to `/review`.
45. **The story read is one whole-script model call**, cached, with every
    citation verified against the script by code; unverifiable beats, cards
    and setups are dropped and listed. Beat positions are measured by code as
    a share of the script from the first scene heading to the last line.
46. **Beat ranges are generous and short-form aware.** Under 30 pages the
    15-beat timings are guidance only and beat findings are low severity.
    Missing protagonist or goal is high; other unclear logline elements are
    medium.
47. **A stage that needs a model is skipped, not failed, when none is
    configured** (it reports why), so code-only stages still run.
48. **Breakdown elements come from the same per-scene read** (a new
    `breakdown` field, prompt `extract-v3`), not a second model pass. Bumping
    the prompt version re-reads every scene once.
49. **Minors are decided by code** from ages stated the screenplay way
    ("YOUNG MAYA (8)"); "(30s)" is a decade, not a minor. Night and dawn/dusk
    exteriors come from scene headings. Department alerts are fixed rules in
    `src/lib/breakdown/rules.ts`, each citing the lines that triggered it.
50. **A scene's cast is everyone who speaks, is present, wears something or
    holds something in it**, so silent characters with wardrobe are counted.
51. **Locations group scenes by resolved location entity** (INT and EXT of
    the same place are one set). Flags: missing from the sheet, needed by day
    and night, and one-off sets of a quarter page or less.
52. **The draft schedule is a heuristic, not an optimizer**: day work and
    night work on separate days (days first, so no night-to-day turnaround),
    scenes grouped by set (largest first), packed to a page budget per day
    (`SCHEDULE_PAGES_PER_DAY`, default 5). CONTINUOUS and MOMENTS LATER
    inherit the previous scene's day or night. A constraint solver (cast
    availability, stop dates, weather cover) is a later step.
53. **Holding days** are the days between a performer's first and last work
    day on which they do not work; they are reported and costed as paid.
54. **The budget is a rough top sheet with placeholder rates** (short or
    feature tier by page count), overridable with `BUDGET_RATES` JSON. Every
    line shows quantity × rate and the scenes or days behind it. Prep, wrap,
    travel, insurance, legal, music and marketing are excluded and say so.
55. **A child is identified once but counted everywhere they work**: the
    studio teacher and the night-work check follow the child's name through
    every scene, not only the scene where their age is stated.
56. **A production moves through six chapters in order**: Story, Screenplay,
    Breakdown, Locations, Schedule, Budget (`src/lib/stages/chapters.ts`). A
    chapter's stages run only when every earlier chapter is approved; a person
    approves each one. Approval is allowed with open high-priority notes (the
    gate says how many): the tool informs, people decide.
57. **Starting from a story begins at chapter I; starting from a screenplay
    begins at chapter II** with chapter I marked skipped. The classifier, not
    the button pressed, decides which: a screenplay pasted as a "story" starts
    at chapter II.
58. **Chapter I tests the prose story itself** (logline elements, which beats
    are present and where, setups, strengths, producer questions). Citations
    are verified against the story text. Under 400 words, beat positions are
    not measured.
59. **Chapter II asks how the screenplay is made**: written from the story
    (adaptation agent) or provided by the user. Either can be revised and
    re-tested while the chapter is open; editing the story clears a screenplay
    that was written from it.
60. **Reopening a chapter un-approves it and clears every later chapter's
    results**, as a real story change ripples downstream. Its own results stay
    for review.
61. **A partly read screenplay fails its chapter.** If any scene could not be
    read by any model (for example an exhausted quota), the continuity step
    fails with the count, so the chapter cannot be approved on incomplete
    tests. Retrying re-reads only the missing scenes.
62. **The look is an original storybook theme** (night sky, parchment, gold,
    Cormorant Garamond with Nunito Sans), with light and dark modes. No
    third-party characters, logos or brand fonts.
63. **The studio UI follows the approved design canvas** ("ReelGraph — Studio
    UI Design"): ink and ivory, gold only for the one next action on a screen,
    one colour and icon per stage (`src/components/journey/stage-look.tsx`),
    Cormorant Garamond for display and Inter for the interface. The home page
    offers two doors (story, screenplay) and draws the six stages as one
    connected journey; `/new` is a focused start page; a production is a
    workspace with a connected stage rail, a stage header with a live check
    summary, a working view that shows each test as it runs, and a single
    decision bar. A single light theme (dark variants only under `.dark`).
64. **Pages scroll as documents** (not inside a fixed-height `<main>`) so
    navigation resets scroll and the back button restores it.
65. **Whole-document agents are logged like every other agent run.** The
    story read, adaptation and structure read used to call models without an
    `agent_runs` record; `cachedGenerate` now records each call (model, cache
    hit, tokens, failure).
66. **OpenRouter requests ask for no hidden reasoning by default**
    (`reasoning: { enabled: false }`, override with `OPENROUTER_REASONING`).
    Measured: DeepSeek spent 3,874 of 4,000 output tokens reasoning and
    returned nothing, even at "low" effort. If a provider rejects the field,
    the request is retried without it. Output caps were cut to what answers
    need (6,000 for whole-document reads, 4,000 per scene), which also fits
    accounts near their credit limit.
67. **Transient provider errors are retried on the same model** (OpenRouter's
    in-flight credit hold, 502/503/504, dropped connections), twice with a
    short wait. Daily quotas and empty balances are not retried; they go to
    the next model.
68. **Whole-document answers must be complete, not just schema-valid.** The
    structure read must cover at least 80% of scenes and place five beats; the
    story read must name a character and find three beats. An incomplete answer
    is not cached; the model is asked once more with the gap spelled out, then
    the stage fails. (Seen: a valid but empty structure read accepted as done.)
69. **Scene numbers are given to the model in the margin** (`[scene 6]`), and
    a scene card that quotes a different scene is dropped. (Seen: cards
    shifted by one scene from scene 6 on.)
70. **A production is checked only against its own sheets.** Checks used the
    latest sheet in the whole database, so a production without sheets was
    flagged against another production's location sheet.
71. **Ages are read from prose too** ("SAMI, a ten-year-old boy", "in her
    forties"), case-sensitive on the capitalised character name, and a child
    is flagged in every scene they appear in, not only where the age is
    stated. (Seen: a 10-year-old at night not flagged.)
72. **Placeholder values are not facts** ("none", "unknown", "n/a"): such
    costumes, props, breakdown items, characters and prop holders are dropped
    and logged, even with a real quote.
73. **Story beat positions use where the quote sits within its line**, since
    prose often keeps a whole paragraph on one line; stories under 1,500 words
    are short-film material and beat notes are low priority.
74. **Run records (`npm run produce`) hold reports only**, never the script or
    story text, and stay out of git (`data/runs/`).
75. **Charts use the validated categorical palette** (not the stage colours,
    which fail colour-blind separation as a series palette), carry legends and
    hover titles, and pair every relationship line with a numbered text list.
76. **Every project is driven by an agent** (product decision, chosen by the
    owner). The agent is a free-running tool loop: the model decides the next
    tool, and the pipeline's stages and chapter gates are its tools
    (`src/lib/agent/tools.ts`). Stages still do the work deterministically
    and keep every citation; the agent reads their reports and decides.
77. **Autopilot.** The agent approves chapters itself when their tests have
    run, naming open high-severity notes in its approval. The user can message
    it, stop it or resume it at any time, and can still approve or reopen
    chapters by hand in the chapter-by-chapter view (`/runs/[id]`).
78. **One agent model role, any provider.** `MODEL_AGENT` lists tool-calling
    models (`provider:model`, first that answers wins, the rest are
    fallbacks). Unset, it defaults the same way as the other roles. Tool
    calling uses Anthropic's native tool use, and the chat-completions `tools`
    field for every OpenAI-compatible provider (OpenRouter included).
79. **No agent model → scripted agent.** Without a usable `MODEL_AGENT`, a
    scripted policy (`scriptedDecision`) makes the same tool calls in the
    standard order: run the chapter, read its last report, approve; write the
    screenplay from the story when asked; retry a failed stage once, then ask
    the user. It says plainly that it cannot read messages.
80. **The transcript is the state.** Every message, tool call and tool result
    is a row in `agent_events`; each turn rebuilds the model conversation from
    them (`toChatMessages`). A call whose result was lost gets a stand-in
    "interrupted" result, a user message sent mid-call is placed after the
    results, and older tool results are trimmed to keep the context small.
81. **Agent turns are time-boxed like stage steps** (200 s, under the 300 s
    function limit) and hold their own lease (`runs.agent_locked_until`),
    separate from the stage lease, because the agent's tools take the stage
    lease themselves. The workspace page calls the next turn while it is
    open; closing it pauses the agent between turns.
82. **The agent may revise the user's story at most twice per project**, only
    to fix gaps the story report names, keeping the author's events,
    characters and voice. Beyond that it asks the user.
83. **Agent tool calls are not cached** (they depend on the live project
    state), so the agent's prompt lives in `src/lib/agent/prompt.ts` and has
    no `PROMPT_VERSION`. Each model call is still logged in `agent_runs`
    (`project-agent@1`), and every failed tool call in `pipeline_issues`.
84. **Approving with open notes is the intended behaviour** (owner's
    decision). The goal is to get anyone from an idea to a complete first
    pre-production plan they can see and revise, not to block on every note.
    The agent names open high-severity notes when it approves; the person
    reviews and reopens what they want changed.
85. **Background work is a Postgres queue run by Vercel Cron** (owner's
    choice). The queue is the `runs` table: a project with agent status
    "running" and a free lease is a waiting job. `/api/cron/agent` runs every
    minute and takes one agent turn on each waiting project, three at a time
    (`AGENT_WORKER_CONCURRENCY`). A turn that crashes leaves its lease to
    expire and is picked up again. The open workspace page still runs turns
    directly, so it moves faster while you watch; the shared lease keeps the
    page and the worker apart. Per-minute cron needs Vercel Pro; on Hobby,
    crons run once a day, so the page is what moves work along.
86. **The cron route needs `CRON_SECRET` in production** and refuses to run
    without it, so nobody else can start model calls on the project's keys.
    Locally, `npm run worker` runs the same queue in a loop.
87. **The landing page is at `/` and the workspace at `/projects`.** The
    landing page is static (no database) and pitches people and the AI
    working together; `/new` redirects to the workspace.
88. **The background worker is asleep until the owner activates it.** The
    Vercel project is on Hobby, which rejects crons that run more than once a
    day, so `vercel.json` has no schedule and the route does nothing unless
    `AGENT_WORKER_ENABLED=1`. Until then agents run while their project page
    is open. Activating means setting the variable plus `CRON_SECRET` and
    adding a schedule (README, "Deploying on Vercel").
89. **The product is named Ray Studio** (owner's choice), replacing the
    working name ReelGraph in the UI, page titles, agent prompt and docs. The
    repository keeps its name; sample scripts keep their placeholder credits.
90. **Every Vercel build applies database migrations before compiling**
    (owner's choice), via the `vercel-build` script. A deploy once shipped
    code that read new columns before anyone had migrated Supabase, and every
    workspace page failed. Builds without DATABASE_URL skip the step; a failed
    migration fails the build. Migrations are additive, so a preview build
    migrating a shared database is safe for the running production code.
91. **Projects start as a chat** (owner's decision). The only form asks for
    the project's name; the story, screenplay, sheets and notes arrive as
    chat messages and attached files (`agent_events` keeps each file's text).
    The agent takes them in with `adopt_material`, which classifies the text
    (story, Fountain, Final Draft) and recognises CSV sheets by name or
    header, or shapes a story with the person and saves it with
    `write_story` once they agree. A project has no material until then
    (`inputText` is empty) and no stage can run. The model sees each
    attachment's name, size and first 1,500 characters, not the whole file.
    Samples open the same way: a new project and a first message with the
    files attached.

