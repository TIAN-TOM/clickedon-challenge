# CLAUDE.md — ClickedOn Engineering Challenge

## Purpose

This repo is the application for ClickedOn's junior AI-Native Software Engineer role:
fix three production bugs in `src/lib/pipeline.ts` so the four gate tests pass. Every
passing submission is reviewed by a human, and gaming the tests is "easy to spot and
won't progress" — assume the work itself is inspected, not just green CI. Their bar,
verbatim: *"We care how you got there — whether you found the root cause, whether you
checked the fix actually works, and whether you can tell when the AI's output is
wrong. That judgement is the job."*

## Hard rules (disqualifiers)

- NEVER edit `src/__tests__/pipeline.test.ts` or `.github/workflows/grade.yml`. The
  grader checks both are unmodified. Treat them as read-only, and run the integrity
  check below before every push.
- NEVER game the tests: no hard-coded returns, no deleted logic, no behaviour keyed
  to test-only inputs or the mock's call counts.
- Keep fixes in `src/lib/pipeline.ts`. Touch `src/lib/extract-json.ts` only with a
  justification recorded in NOTES.md and the commit body; leave `src/api/generate.ts`
  and `src/lib/anthropic-mock.ts` alone.
- Fix the bug class, not the mock's script. Every fix must be defensible as
  production code, with the tests as validation — not the reverse.

## Context map

| File | Role |
|---|---|
| `src/lib/pipeline.ts` | Unit under repair — all three bugs live here |
| `src/__tests__/pipeline.test.ts` | Executable spec (read-only). Start here |
| `src/lib/anthropic-mock.ts` | Deterministic streaming-client stand-in; drives the failure scenarios |
| `src/lib/extract-json.ts` | Fenced-JSON extractor; throws on truncated input by design |
| `src/api/generate.ts` | Production call shape — its contract must keep working |

The three bugs as shipped (symptoms per README; mechanisms from reading the code —
once a fix lands, the code and tests are the source of truth):

1. Hand-off failure vanished: `advanceToNextStage()` was fire-and-forget with a
   swallowed rejection, so a stalled pipeline still reported `ok`.
2. A truncated stream made `extractJson` throw and killed the whole pass — no retry.
3. Transient 429s were not retried, and the revision loop ran to 50 with no failure
   path — `MAX_REVISIONS = 3` was exported but never wired into the loop.

## Working method — analysis before edits

- Root cause first. Before any edit, write the analysis in NOTES.md: symptom →
  mechanism in the code → why it is wrong in production → candidate fixes with
  trade-offs. Write the plan down before the edit; it applies to all three bugs.
- One bug per commit; the message states the root cause, not the symptom. Bug-fix
  commits contain only `src/lib` changes.
- CLAUDE.md and NOTES.md are committed deliberately, each in its own commit, never
  bundled into a fix. Process text may record rejected AI suggestions — the
  challenge asks for exactly that evidence. Commit messages still describe the code.
- Decide retry policy deliberately: bounded attempts, retry only transient failures
  (429 / truncation), fail closed with `status: "error"` when the budget is spent.

## Judgment — reviewing AI output (including your own)

- Every proposed diff gets an explicit review pass before acceptance:
  - Does it fix the mechanism, or just this mock's call sequence?
  - Does it preserve the public contract (`GenerateResult`, the `MAX_REVISIONS`
    export, `handleGenerate`'s behaviour)?
  - Would it survive a different failure order than the tests happen to use?
- Distrust a first suggestion that: retries without a bound, catches broad errors
  and swallows them, retries non-transient failures, or loosens types to compile.
- Conflicts: the read-only tests are the gate and win. If the README seems to
  disagree, re-read both, follow the tests, and record the discrepancy in NOTES.md.
  Never resolve a conflict by guessing.
- Keep NOTES.md current: decisions made, AI suggestions rejected and why, open
  items. Before submitting, distil it into the short note the careers form requires
  (what you decided, where the model was wrong, what you'd do with more time).

## Verification — every change, every time

Baseline (confirmed on the shipped code): 4/4 tests fail; typecheck and lint pass —
these bugs are behavioural, invisible to static tooling.

After every edit:

```bash
npm test && npm run typecheck && npm run lint
```

Before every push — the same checks in the same order as the `grade` Action
(Node 22), plus the protected-file integrity check:

```bash
npm ci && npm run typecheck && npm run lint && npm test && npm run build
git diff --quiet "$(git rev-list --max-parents=0 HEAD)" -- \
  src/__tests__/pipeline.test.ts .github/workflows/grade.yml \
  && echo "protected files untouched" || echo "STOP: protected files modified"
```

- A fix counts as done only when its test passes, the other tests still pass, and
  the one-sentence explanation of why the *mechanism* is gone holds up.
- Verify beyond the tests: reason through at least one uncovered failure path
  (e.g. hand-off failing after a successful retry; a 429 that never clears).
- Bonus (README: "We notice this."): add ONE extra edge-case test in a NEW file,
  e.g. `src/__tests__/edge.test.ts` — it must cover a failure path the gate tests
  miss. Never add it to the gate test file.
- Final gate: the `grade` Action green on `main` before submitting.

## Anti-patterns (no vibe coding)

- No shotgun loops ("tweak, rerun, tweak"). Two consecutive failed attempts means
  stop and redo the root-cause analysis.
- No refactors beyond the three fixes, no new dependencies, no config or tooling
  edits.
- No silencing errors to hide symptoms — Bug 1 shipped as exactly that
  (`.catch(() => {})`). Do not reintroduce it under a new name.
