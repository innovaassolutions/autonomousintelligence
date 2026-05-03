import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockBaseState, mockArticle } from "../fixtures.js";

const mockFrom = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: mockFrom }),
}));

const mockAnthropicCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockAnthropicCreate };
  },
}));

const supabaseChain = {
  update: vi.fn().mockReturnThis(),
  eq: vi.fn().mockResolvedValue({}),
};

describe("curateAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.ANTHROPIC_API_KEY = "test-key";
    mockFrom.mockReturnValue(supabaseChain);
  });

  it("aborts when deduplicatedArticles is empty", async () => {
    const { curateAgent } = await import("../../agents/curate-agent.js");
    const result = await curateAgent({ ...mockBaseState, deduplicatedArticles: [] });

    expect(result.status).toBe("aborted");
    expect(result.curatedThemes).toHaveLength(0);
    expect(result.abortReason).toContain("No articles");
  });

  it("returns curatedThemes when Claude identifies themes", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            themes: [
              {
                title: "AI Reasoning Milestone",
                angle: "Changes developer workflows",
                section_name: "AI & ML",
                article_indices: [1],
                deep_dive_query: "AI reasoning 2025",
              },
            ],
          }),
        },
      ],
    });

    const { curateAgent } = await import("../../agents/curate-agent.js");
    const result = await curateAgent({
      ...mockBaseState,
      deduplicatedArticles: [mockArticle],
    });

    expect(result.status).toBe("scoring");
    expect(result.curatedThemes).toHaveLength(1);
    expect(result.curatedThemes[0].title).toBe("AI Reasoning Milestone");
    expect(result.curatedThemes[0].supporting_articles).toHaveLength(1);
  });

  it("aborts when Claude returns no themes", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: '{"themes":[]}' }],
    });

    const { curateAgent } = await import("../../agents/curate-agent.js");
    const result = await curateAgent({
      ...mockBaseState,
      deduplicatedArticles: [mockArticle],
    });

    expect(result.status).toBe("aborted");
  });
});
