import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockBaseState, mockSection } from "../fixtures.js";

const mockAnthropicCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockAnthropicCreate };
  },
}));

describe("editorialAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  it("returns null feedback when Claude approves", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({ approved: true, feedback: null, quality_score: 92 }),
        },
      ],
    });

    const { editorialAgent } = await import("../../agents/editorial-agent.js");
    const result = await editorialAgent({ ...mockBaseState, sections: [mockSection] });

    expect(result.editorialFeedback).toBeNull();
    expect(result.status).toBe("reviewing");
  });

  it("returns feedback string when Claude rejects", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            approved: false,
            feedback: "Section 1 lacks actionable insight",
            quality_score: 58,
          }),
        },
      ],
    });

    const { editorialAgent } = await import("../../agents/editorial-agent.js");
    const result = await editorialAgent({ ...mockBaseState, sections: [mockSection] });

    expect(result.editorialFeedback).toBe("Section 1 lacks actionable insight");
  });

  it("defaults to approved when Claude response cannot be parsed", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: "I think it looks great overall!" }],
    });

    const { editorialAgent } = await import("../../agents/editorial-agent.js");
    const result = await editorialAgent({ ...mockBaseState, sections: [mockSection] });

    expect(result.editorialFeedback).toBeNull();
  });

  it("does NOT increment rewriteCount (writing-agent owns that)", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({ approved: false, feedback: "Needs work", quality_score: 40 }),
        },
      ],
    });

    const { editorialAgent } = await import("../../agents/editorial-agent.js");
    const result = await editorialAgent({
      ...mockBaseState,
      sections: [mockSection],
      rewriteCount: 1,
    });

    // rewriteCount must not appear in the returned patch (editorial no longer owns it)
    expect((result as Record<string, unknown>).rewriteCount).toBeUndefined();
  });
});
