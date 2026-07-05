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

  // The model call can fail transiently (rate limits) or return a truncated
  // stream. Right now a single hiccup takes down the whole run.
  const text = await mockStream(input.behavior, state);
  extractJson(text);

  // Revise until the draft passes review.
  let attempt = 0;
  while (!input.reviewPasses(attempt) && attempt < 50) {
    attempt += 1;
  }

  // Kick off the next stage and return.
  void input.advanceToNextStage().catch(() => {
    /* ignored */
  });

  return { status: "ok", attempts: attempt };
}

export { MAX_REVISIONS };
