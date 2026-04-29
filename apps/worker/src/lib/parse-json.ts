/**
 * Strips markdown code fences and parses JSON from a Claude response.
 * Claude sometimes wraps JSON in ```json ... ``` despite being told not to.
 */
export function parseJsonResponse<T>(text: string): T {
  const stripped = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();
  return JSON.parse(stripped) as T;
}
