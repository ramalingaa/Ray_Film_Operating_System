# Spec: production pipeline (M8–M12)

Goal: one entry point. A user uploads a file or pastes text — a screenplay or a
story — and a **run** takes it through every pre-production stage, each with
its own report. Every finding cites its source line. Code decides what code
can decide; models only extract and judge, and their citations are verified.

## Input

- Upload: `.fountain`, `.txt`, `.md`, `.fdx` (Final Draft XML). Or paste text.
- Optional costume and location sheets (CSV), as today.
- The intake stage classifies the text: **screenplay** (Fountain scene
  headings found) or **story** (prose, treatment, logline).
- A story is adapted by the *Adaptation* agent into a scene-by-scene Fountain
  outline (headings + action lines, no invented dialogue). The outline is
  stored as the run's script and is labelled *generated* everywhere it shows.

## Stages

| # | Stage | Who decides | Report |
|---|---|---|---|
| 1 | Intake | code (+ Adaptation agent for stories) | input type, title, scenes, pages, running time, format warnings |
| 2 | Story | Story Analyst agent (one call), code verifies citations and beat positions | logline elements, 15 beats mapped to scenes, beat timing checks, scene report cards, scenes where nothing changes |
| 3 | Continuity | existing extraction + 8 checks | findings by severity (existing review UI) |
| 4 | Breakdown | extraction agent (extended), code | elements per scene by category, page eighths, department alerts (minors, animals, stunts, weapons, water, fire, intimacy, VFX, night exteriors) |
| 5 | Locations | code | sets with INT/EXT, day/night, scenes, pages; flags (night exteriors, mixed day/night sets, not on sheet) |
| 6 | Schedule | code (greedy heuristic) | draft stripboard by shoot day, day-out-of-days, checks (night→day turnaround, minors at night, paid holding days, overlong days) |
| 7 | Budget | code + editable rate card | rough top sheet; every line shows its quantity × rate and the assumption behind it |

## Execution

A run is a row in `runs` with one row per stage in `run_stages`. Work advances
in **steps**: each step does as much as fits in a time budget (default 200 s)
and saves progress, so no request exceeds Vercel's 300 s limit. The run page
drives steps while it is open; any stage can resume because extraction and
judge answers are cached. A failed stage records its error and the run stops
there; the user can retry.

## Out of scope (this phase)

PDF / DOCX import, accounts and approvals, an optimal schedule solver, real
rate cards, notifications. See DECISIONS.md.
