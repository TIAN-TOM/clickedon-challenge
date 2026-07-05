# NOTES.md — root-cause analysis and decision log

Working log for the three pipeline fixes. Analysis is written down here before any
code changes; decisions, rejected alternatives, and AI-review moments are recorded
as they happen. The submission note is distilled from this file.

Baseline on the shipped code (before any fix): `npm test` fails 4/4;
`npm run typecheck` and `npm run lint` pass. All three bugs are behavioural —
invisible to static tooling.

## Bug 1 — a failed hand-off reports success

**Symptom:** when the hand-off to the next stage fails, the run still reports
success, so a stalled pipeline looks healthy.

**Mechanism:** `pipeline.ts` fires `advanceToNextStage()` without awaiting it and
attaches `.catch(() => {})`, so the rejection is swallowed and `status: "ok"` is
returned unconditionally:

```ts
void input.advanceToNextStage().catch(() => {
  /* ignored */
});
return { status: "ok", attempts: attempt };
```

**Why this is wrong in production:** `GenerateResult.status` is the only failure
signal this function exposes (`handleGenerate` maps it straight to HTTP 200/500).
Swallowing the rejection means monitoring, retries and alerting upstream all see a
healthy pipeline while content silently stops moving.

**Options considered:**

- (a) Await the hand-off; on rejection return `status: "error"`. Minimal, surfaces
  the truth, lets the caller decide policy.
- (b) Retry the hand-off before failing. Rejected: whether a hand-off is safe to
  retry depends on the next stage being idempotent, which this contract says
  nothing about. Retrying blind can double-publish content.
- (c) Keep fire-and-forget but log/telemetry the failure. Rejected: the contract
  has no logger, and "log it and return ok" is the same lie with better paperwork.

**Decision:** (a).

## Bug 2 — a truncated stream crashes the run

**Symptom:** if the model response arrives truncated, JSON extraction throws and
the whole pass dies instead of recovering.

**Mechanism:** `extractJson` requires a closed ```` ```json … ``` ```` fence and
throws when the closing fence is missing (exactly what a dropped stream produces —
see `src/fixtures/deck.truncated.json`). `generate()` calls it with no error
handling, so the exception propagates and kills the pass.

**Why this is wrong in production:** a dropped stream is an environmental hiccup,
not a logic error. The draft is cheap to regenerate; crashing the pass turns a
retryable condition into an outage.

**Options considered:**

- (a) Retry the stream (bounded) when extraction fails; a fresh attempt returns a
  complete response.
- (b) Make `extractJson` tolerant — repair or partially parse truncated JSON.
  Rejected: accepting a repaired half-draft risks shipping corrupt content
  downstream, which is worse than the crash it replaces. The extractor throwing on
  truncation is correct behaviour; the caller's lack of recovery is the bug.
  `extract-json.ts` stays untouched.
- (c) Treat truncation as fatal but return `status: "error"` instead of throwing.
  Rejected as the whole fix: honest but leaves easy recovery on the table. It is,
  however, the right terminal behaviour once the retry budget is spent.

**Decision:** (a), with (c) as the exhausted-budget fallback.

## Bug 3 — transient 429s are fatal, and the revision loop has no real bound

**Symptom:** a temporary rate-limit takes the run down with no retry, and the
revision loop has no circuit-breaker or failure path.

**Mechanisms (two, related):**

1. `mockStream` throws a `TransientError` with `status: 429`; `generate()` does
   not catch it, so a transient condition is terminal.
2. The revision loop runs `while (!reviewPasses(attempt) && attempt < 50)` and then
   returns `status: "ok"` regardless — `MAX_REVISIONS = 3` is declared and exported
   but never wired into the loop, and a draft that never passes review is reported
   as a success after 50 spins.

**Why this is wrong in production:** 429 is the API telling you to try again —
treating it as fatal converts routine backpressure into failed runs. The revision
loop is worse: it burns 50 review cycles and then lies about the outcome.

**Options considered:**

- (a) Bounded retry of the model call on transient errors (429/5xx), sharing one
  attempt budget with the truncation retry from Bug 2 — they are the same concern
  (acquire a valid draft within a budget). Wire `MAX_REVISIONS` into the revision
  loop and return `status: "error"` when review never passes.
- (b) Separate budgets per failure type. Rejected: more state for no behavioural
  gain at this scale; one budget for "attempts to obtain a valid draft" is easier
  to reason about.
- (c) Unbounded retry with backoff until success. Rejected: unbounded anything in
  a pipeline stage is how one stuck run exhausts a worker pool.

**Decision:** (a). Budget: `MAX_STREAM_ATTEMPTS = 3` (one initial call plus two
retries — the same default retry count as the real Anthropic SDK). Retry only
transient failures: HTTP 429/5xx, or an extraction failure indicating a truncated
draft. Non-transient errors and an exhausted budget fail closed with
`status: "error"`.

## Scope decisions

- `attempts` reports revision attempts; on failure before the revision loop it is
  `0` (no revisions ran). The `GenerateResult` shape is unchanged.
- The revision loop does not re-call the model. The shipped code never did, and
  `reviewPasses` is the scripted stand-in for the whole revise-and-review step;
  inventing a re-streaming contract the tests cannot observe would be scope creep.
- The hand-off is not retried (see Bug 1, option b).
- No backoff between retries: the mock is deterministic and the repro has no time
  abstraction to test against. Production would add exponential backoff with
  jitter and honour `Retry-After` (see "With more time").
- `MAX_STREAM_ATTEMPTS = 3` is a policy choice, not a number reverse-engineered
  from the mock: the mock's worst case (two 429s) fitting inside one-plus-two
  retries is the test validating the policy, not the policy chasing the test.

## Where the AI was wrong (review log)

- An automated review of the working agreement suggested pinning the
  protected-file integrity check to the template's commit hash (`22b8257`). That
  breaks the moment the repo is recreated via "Use this template", which generates
  a fresh root commit. Replaced with a dynamic root-commit lookup
  (`git rev-list --max-parents=0 HEAD`).
- The same review pass drafted a local verification chain ordered
  `test → typecheck → lint` while claiming it mirrored the grade Action, which
  actually runs `typecheck → lint → test → build`. Reordered to match before it
  could mislead anyone comparing local runs against CI.

## Verification log

- Baseline (shipped code): `npm test` 4/4 fail; typecheck and lint pass. ✓
- (updated after each fix lands)

## With more time

- Exponential backoff with jitter on 429/5xx, honouring `Retry-After`.
- Telemetry: a hand-off failure should page someone, not just flip an HTTP status;
  retry counts and truncation rates are worth graphing before they become outages.
- Revision-loop realism: let revisions regenerate the draft (new model call per
  revision) once the real pipeline's contract for that exists.
- Property-based tests for `extractJson` against arbitrarily truncated fixtures.
