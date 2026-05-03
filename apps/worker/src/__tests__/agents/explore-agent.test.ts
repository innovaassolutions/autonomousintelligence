import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockBaseState } from "../fixtures.js";

// ── Mock external modules ────────────────────────────────────────────────────

const mockSupabaseFrom = vi.fn();
const mockSupabaseClient = {
  from: mockSupabaseFrom,
};
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => mockSupabaseClient,
}));

const mockAnthropicCreate = vi.fn();
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create: mockAnthropicCreate };
  },
}));

const mockTavilySearch = vi.fn();
vi.mock("@tavily/core", () => ({
  tavily: () => ({ search: mockTavilySearch }),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeSupabaseChain(returnData: unknown) {
  const chain: Record<string, () => typeof chain> = {
    select: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    maybeSingle: vi.fn().mockResolvedValue({ data: null }),
    insert: vi.fn().mockReturnThis(),
    update: vi.fn().mockReturnThis(),
    single: vi.fn().mockResolvedValue({ data: returnData }),
  };
  return chain;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe("exploreAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_KEY = "test-key";
    process.env.ANTHROPIC_API_KEY = "test-anthropic";
    process.env.TAVILY_API_KEY = "test-tavily";
  });

  it("generates queries, runs searches and returns rawArticles", async () => {
    // Claude returns 2 queries
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: '{"queries":["AI trends 2025","LLM benchmarks"]}' }],
    });

    // Tavily returns a unique result per query (different URLs so dedup passes)
    mockTavilySearch
      .mockResolvedValueOnce({
        results: [{ url: "https://example.com/1", title: "AI Trends", content: "Summary", rawContent: "Full content" }],
      })
      .mockResolvedValueOnce({
        results: [{ url: "https://example.com/2", title: "LLM Benchmarks", content: "Summary 2", rawContent: "Full 2" }],
      });

    // Supabase: article not seen before (maybeSingle → null), insert succeeds
    const chain = makeSupabaseChain({ id: "new-art-id" });
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: null });
    mockSupabaseFrom.mockReturnValue(chain);

    const { exploreAgent } = await import("../../agents/explore-agent.js");
    const result = await exploreAgent({ ...mockBaseState });

    expect(result.rawArticles).toHaveLength(2); // 1 per query, 2 queries
    expect(result.status).toBe("researching");
    expect(result.sourceErrors).toHaveLength(0);
  });

  it("skips articles whose url_hash already exists for this instance", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: '{"queries":["test query"]}' }],
    });
    mockTavilySearch.mockResolvedValue({
      results: [{ url: "https://seen.com", title: "Old News", content: "..." }],
    });

    // Supabase: article already exists
    const chain = makeSupabaseChain(null);
    chain.maybeSingle = vi.fn().mockResolvedValue({ data: { id: "existing-id" } });
    mockSupabaseFrom.mockReturnValue(chain);

    const { exploreAgent } = await import("../../agents/explore-agent.js");
    const result = await exploreAgent({ ...mockBaseState });

    expect(result.rawArticles).toHaveLength(0);
  });

  it("records sourceErrors when Tavily search fails", async () => {
    mockAnthropicCreate.mockResolvedValue({
      content: [{ type: "text", text: '{"queries":["failing query"]}' }],
    });
    mockTavilySearch.mockRejectedValue(new Error("Rate limit exceeded"));

    const chain = makeSupabaseChain(null);
    chain.update = vi.fn().mockReturnThis();
    chain.eq = vi.fn().mockResolvedValue({ error: null });
    mockSupabaseFrom.mockReturnValue(chain);

    const { exploreAgent } = await import("../../agents/explore-agent.js");
    const result = await exploreAgent({ ...mockBaseState });

    expect(result.rawArticles).toHaveLength(0);
    expect(result.sourceErrors).toHaveLength(1);
    expect(result.sourceErrors[0].error).toContain("Rate limit exceeded");
  });
});
