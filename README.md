# ClickedOn Engineering Challenge

This is the application for our junior **AI-Native Software Engineer** role. There is no CV step — completing this challenge **is** the application.

You have a small, broken slice of our real content-generation pipeline. Your job is to fix it so the test suite passes, then submit your repo. It should take **about two to three hours**.

## The rules

- **Use AI.** Claude Code, Codex, Copilot, ChatGPT — whatever you'd use on the job. This role is about shipping correct code by driving AI well, so we want to see exactly that. Using AI is not cheating here; it's the point.
- **Fix the code, not the tests.** The grader checks that the test file and the workflow are unmodified. Editing them disqualifies the submission.
- **Make it genuinely correct.** Passing the tests by gaming them (hard-coding a return value, deleting the logic) is easy to spot and won't progress.

## The scenario

`src/lib/pipeline.ts` runs one content-generation pass: it streams a draft from a model, extracts the JSON, revises it until it passes review, then hands off to the next stage. The streaming client is mocked (`src/lib/anthropic-mock.ts`) so everything runs offline and deterministically.

It works on a good day. It does not survive a bad one. Three real symptoms:

1. **Failed hand-offs vanish silently.** When the hand-off to the next stage fails, the run still reports success, so a stalled pipeline looks healthy.
2. **A dropped stream crashes the run.** If the model response arrives truncated, JSON extraction throws and the whole pass dies instead of recovering.
3. **Transient rate-limits kill the run, and the revision loop can spin.** A temporary `429` takes everything down with no retry, and the revision loop has no real circuit-breaker or failure path.

The tests in `src/__tests__/pipeline.test.ts` describe how it should behave once fixed. Start there.

## How to run it

```bash
npm ci
npm test        # the four gate tests — currently failing
npm run typecheck
npm run lint
npm run build
```

**Bonus:** add one test of your own that covers an edge case you think matters. We notice this.

## How to submit

1. Click **"Use this template"** at the top of this repo to create **your own** copy (keep it public).
2. Fix the bugs on your default branch (`main`) and push.
3. Wait for the **`grade`** GitHub Action to go green on your latest commit (check the **Actions** tab).
4. Go to **https://careers.clickedon.co** and submit your repo link, along with a short note on **how you used AI** — what you decided, where the model was wrong, and what you'd do with more time.

That's the whole process. We review every passing submission and reply.

---

*A note on what we're really looking at: anyone can prompt a tool until the tests go green. We care how you got there — whether you found the root cause, whether you checked the fix actually works, and whether you can tell when the AI's output is wrong. That judgement is the job.*
