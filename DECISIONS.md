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
