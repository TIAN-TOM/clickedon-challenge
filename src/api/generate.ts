import { generate, type GenerateInput } from "../lib/pipeline";

/**
 * A thin stand-in for the POST /api/content/generate route handler. It exists to
 * show how the pipeline is invoked in production; the graded behaviour lives in
 * `src/lib`. You should not need to change this file to fix the bugs.
 */
export async function handleGenerate(body: {
  behavior: GenerateInput["behavior"];
}) {
  const result = await generate({
    behavior: body.behavior,
    advanceToNextStage: async () => {
      /* hand off to the next stage (SEO, social, assembly, ...) */
    },
    reviewPasses: () => true,
  });

  return {
    status: result.status === "ok" ? 200 : 500,
    body: result,
  };
}
