import { describe, it, expect } from "vitest";
import { generate } from "../lib/pipeline";

// Candidate-authored edge case (README bonus). The gate tests exercise stream
// recovery and hand-off failure separately; this covers their interaction — a
// pass that recovers from a truncated stream must still fail loudly when the
// hand-off then breaks. Recovery must never mask a later failure.
describe("Edge — recovery must not mask a later hand-off failure", () => {
  it("returns 'error' when the stream recovers via retry but the hand-off rejects", async () => {
    const res = await generate({
      behavior: "truncate-once",
      advanceToNextStage: async () => {
        throw new Error("next stage unreachable");
      },
      reviewPasses: () => true,
    });
    expect(res.status).toBe("error");
    expect(res.attempts).toBe(0);
  });
});
