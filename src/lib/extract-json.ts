/**
 * Pulls the JSON object out of a fenced ```json ... ``` block in a model
 * response. This mirrors the real pipeline's extractor.
 *
 * Note: a model response can arrive truncated (a dropped stream), in which case
 * the closing fence is missing.
 */
export function extractJson<T = unknown>(text: string): T {
  const match = text.match(/```json\s*([\s\S]*?)```/);
  if (!match) {
    throw new Error("No fenced JSON block found");
  }
  return JSON.parse(match[1]) as T;
}
