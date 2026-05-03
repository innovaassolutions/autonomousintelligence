import { describe, it, expect } from "vitest";
import { parseJsonResponse } from "../../lib/parse-json.js";

describe("parseJsonResponse", () => {
  it("parses plain JSON", () => {
    expect(parseJsonResponse<{ x: number }>('{"x":1}')).toEqual({ x: 1 });
  });

  it("strips ```json ... ``` fences", () => {
    const text = "```json\n{\"queries\":[\"a\",\"b\"]}\n```";
    expect(parseJsonResponse<{ queries: string[] }>(text)).toEqual({ queries: ["a", "b"] });
  });

  it("strips plain ``` fences", () => {
    const text = "```\n{\"ok\":true}\n```";
    expect(parseJsonResponse<{ ok: boolean }>(text)).toEqual({ ok: true });
  });

  it("handles leading/trailing whitespace", () => {
    expect(parseJsonResponse<{ n: number }>("  { \"n\": 42 }  ")).toEqual({ n: 42 });
  });

  it("throws on invalid JSON", () => {
    expect(() => parseJsonResponse("not json")).toThrow();
  });
});
