import { extractJson } from "./extract-json";
import { mockStream, type MockBehavior, type MockState } from "./anthropic-mock";

export interface GenerateInput {
  /** Drives the mock streaming client (see anthropic-mock.ts). */
  behavior: MockBehavior;
  /** Hands the finished draft to the next pipeline stage. May reject. */
  advanceToNextStage: () => Promise<void>;
  /** Returns true once the draft passes review. Scripted by callers/tests. */
  reviewPasses: (attempt: number) => boolean;
}

export interface GenerateResult {
  status: "ok" | "error";
  attempts: number;
}

const MAX_REVISIONS = 3;

/** Total model-call budget for one pass: the initial attempt plus two retries. */
const MAX_STREAM_ATTEMPTS = 3;

/** Rate limits and server errors are worth retrying; anything else is not. */
function isTransient(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const status = (err as { status?: unknown }).status;
  return typeof status === "number" && (status === 429 || status >= 500);
}

/**
 * Streams a draft and validates that it contains a parseable fenced JSON block.
 * Transient API errors (429/5xx) and truncated streams — which surface as
 * extraction failures — are retried within the budget; the draft is cheap to
 * regenerate. Returns null once the budget is spent or on a non-transient error.
 */
async function streamValidDraft(
  behavior: MockBehavior,
  state: MockState,
): Promise<string | null> {
  for (let call = 1; call <= MAX_STREAM_ATTEMPTS; call += 1) {
    let text: string;
    try {
      text = await mockStream(behavior, state);
    } catch (err) {
      if (isTransient(err)) continue;
      return null;
    }
    try {
      extractJson(text);
      return text;
    } catch {
      // Truncated or malformed draft — a fresh attempt can recover it.
    }
  }
  return null;
}

/**
 * Runs one content-generation pass: stream a draft, extract it, revise until it
 * passes review, then hand off to the next stage.
 *
 * Failure policy: transient model errors and truncated streams are retried
 * within a fixed budget, review is bounded by MAX_REVISIONS, and a failed
 * hand-off surfaces as an error — model-call, extraction, and hand-off
 * failures return status "error" rather than throwing.
 */
export async function generate(input: GenerateInput): Promise<GenerateResult> {
  const state: MockState = { calls: 0 };

  const draft = await streamValidDraft(input.behavior, state);
  if (draft === null) {
    return { status: "error", attempts: 0 };
  }

  // Revise until the draft passes review, within the revision budget. A draft
  // that never passes is a failure, not a success with a high attempt count.
  let attempt = 0;
  let passed = input.reviewPasses(attempt);
  while (!passed && attempt < MAX_REVISIONS) {
    attempt += 1;
    passed = input.reviewPasses(attempt);
  }
  if (!passed) {
    return { status: "error", attempts: attempt };
  }

  // The hand-off decides the outcome: a failed next stage must surface as an
  // error, not report a healthy run.
  try {
    await input.advanceToNextStage();
  } catch {
    return { status: "error", attempts: attempt };
  }

  return { status: "ok", attempts: attempt };
}

export { MAX_REVISIONS };
