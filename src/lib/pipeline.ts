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

/**
 * Streams a draft and validates that it contains a parseable fenced JSON block.
 * A dropped stream surfaces as an extraction failure (missing closing fence or
 * malformed JSON); the draft is cheap to regenerate, so retry with a fresh
 * stream within the budget. Returns null once the budget is spent.
 */
async function streamValidDraft(
  behavior: MockBehavior,
  state: MockState,
): Promise<string | null> {
  for (let call = 1; call <= MAX_STREAM_ATTEMPTS; call += 1) {
    const text = await mockStream(behavior, state);
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
 * This is a faithful (stripped-down) reproduction of the real pipeline — and it
 * ships with three real bugs from that pipeline. Your job is to fix them so the
 * test suite passes. See the README for the symptoms. (Do not edit the tests.)
 */
export async function generate(input: GenerateInput): Promise<GenerateResult> {
  const state: MockState = { calls: 0 };

  const draft = await streamValidDraft(input.behavior, state);
  if (draft === null) {
    return { status: "error", attempts: 0 };
  }

  // Revise until the draft passes review.
  let attempt = 0;
  while (!input.reviewPasses(attempt) && attempt < 50) {
    attempt += 1;
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
