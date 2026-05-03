import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockBaseState, mockRawArticle } from "../fixtures.js";

const mockRpc = vi.fn();
const mockFrom = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: mockFrom, rpc: mockRpc }),
}));

const mockEmbeddingsCreate = vi.fn();
vi.mock("openai", () => ({
  default: class {
    embeddings = { create: mockEmbeddingsCreate };
  },
}));

const FAKE_EMBEDDING = Array.from({ length: 1536 }, () => 0.1);

describe("deduplicationAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_KEY = "test-key";
    process.env.OPENAI_API_KEY = "test-openai";

    mockEmbeddingsCreate.mockResolvedValue({
      data: [{ embedding: FAKE_EMBEDDING }],
    });
  });

  it("keeps articles with no similar match", async () => {
    mockRpc.mockResolvedValue({ data: [] }); // no similar articles found
    const chain = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({}) };
    mockFrom.mockReturnValue(chain);

    const { deduplicationAgent } = await import("../../agents/deduplication-agent.js");
    const result = await deduplicationAgent({
      ...mockBaseState,
      rawArticles: [mockRawArticle],
    });

    expect(result.deduplicatedArticles).toHaveLength(1);
    expect(result.deduplicatedArticles[0].id).toBe(mockRawArticle.id);
    expect(result.deduplicatedArticles[0].embedding).toEqual(FAKE_EMBEDDING);
  });

  it("discards articles above the similarity threshold", async () => {
    mockRpc.mockResolvedValue({ data: [{ id: "existing-art-id", similarity: 0.95 }] });
    const chain = { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({}) };
    mockFrom.mockReturnValue(chain);

    const { deduplicationAgent } = await import("../../agents/deduplication-agent.js");
    const result = await deduplicationAgent({
      ...mockBaseState,
      rawArticles: [mockRawArticle],
    });

    expect(result.deduplicatedArticles).toHaveLength(0);
    // Verify the article was marked as duplicate in Supabase
    expect(chain.update).toHaveBeenCalledWith(
      expect.objectContaining({ is_duplicate: true, status: "discarded" })
    );
  });

  it("returns empty array when rawArticles is empty", async () => {
    const { deduplicationAgent } = await import("../../agents/deduplication-agent.js");
    const result = await deduplicationAgent({ ...mockBaseState, rawArticles: [] });
    expect(result.deduplicatedArticles).toHaveLength(0);
    expect(mockEmbeddingsCreate).not.toHaveBeenCalled();
  });
});
