import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockBaseState, mockCuratedTheme } from "../fixtures.js";

const mockAnthropicCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockAnthropicCreate };
  },
}));

const SECTION_RESPONSE = JSON.stringify({
  name: "AI & ML",
  headline: "New AI Model Changes Developer Workflows",
  body: "The latest models have shown remarkable...",
  key_takeaway: "Adopt the new API in your next sprint.",
  sources: [{ title: "TechCrunch", url: "https://tc.com" }],
});

const SUBJECT_RESPONSE = JSON.stringify({
  subject: "This Week in AI: Reasoning Breakthrough",
  preview: "Plus: why devs should care now",
});

describe("writingAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
  });

  it("generates sections and subject line for each theme", async () => {
    mockAnthropicCreate
      .mockResolvedValueOnce({ content: [{ type: "text", text: SECTION_RESPONSE }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: SUBJECT_RESPONSE }] });

    const { writingAgent } = await import("../../agents/writing-agent.js");
    const result = await writingAgent({
      ...mockBaseState,
      curatedThemes: [mockCuratedTheme],
    });

    expect(result.sections).toHaveLength(1);
    expect(result.sections[0].headline).toBe("New AI Model Changes Developer Workflows");
    expect(result.subjectLine).toBe("This Week in AI: Reasoning Breakthrough");
    expect(result.previewText).toBe("Plus: why devs should care now");
    expect(result.status).toBe("writing");
  });

  it("increments rewriteCount on every invocation", async () => {
    mockAnthropicCreate
      .mockResolvedValueOnce({ content: [{ type: "text", text: SECTION_RESPONSE }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: SUBJECT_RESPONSE }] });

    const { writingAgent } = await import("../../agents/writing-agent.js");
    const result = await writingAgent({
      ...mockBaseState,
      curatedThemes: [mockCuratedTheme],
      rewriteCount: 1,
    });

    expect(result.rewriteCount).toBe(2);
  });

  it("clears editorialFeedback after writing", async () => {
    mockAnthropicCreate
      .mockResolvedValueOnce({ content: [{ type: "text", text: SECTION_RESPONSE }] })
      .mockResolvedValueOnce({ content: [{ type: "text", text: SUBJECT_RESPONSE }] });

    const { writingAgent } = await import("../../agents/writing-agent.js");
    const result = await writingAgent({
      ...mockBaseState,
      curatedThemes: [mockCuratedTheme],
      editorialFeedback: "Needs more detail in section 2",
    });

    expect(result.editorialFeedback).toBeNull();
  });

  it("skips malformed section responses without aborting", async () => {
    mockAnthropicCreate
      .mockResolvedValueOnce({ content: [{ type: "text", text: "not json at all" }] }) // bad section
      .mockResolvedValueOnce({ content: [{ type: "text", text: SUBJECT_RESPONSE }] });

    const { writingAgent } = await import("../../agents/writing-agent.js");
    const result = await writingAgent({
      ...mockBaseState,
      curatedThemes: [mockCuratedTheme],
    });

    // Section skipped, but run continues
    expect(result.sections).toHaveLength(0);
    expect(result.status).toBe("writing");
  });
});
