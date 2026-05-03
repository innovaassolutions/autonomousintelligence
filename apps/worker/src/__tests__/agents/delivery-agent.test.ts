import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockBaseState } from "../fixtures.js";

const mockRpc = vi.fn();
const mockFrom = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: mockFrom, rpc: mockRpc }),
}));

// Mock date-fns-tz to return predictable dates
vi.mock("date-fns-tz", () => ({
  toZonedTime: (_date: Date, _tz: string) => new Date("2025-01-15T00:00:00Z"),
  fromZonedTime: (_date: Date, _tz: string) => new Date("2025-01-15T08:00:00Z"),
}));

describe("deliveryAgent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_KEY = "test-key";

    // Supabase: fetch edition_id from pipeline_runs
    mockFrom.mockImplementation((table: string) => {
      if (table === "pipeline_runs") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: { edition_id: "ed-1" } }),
          update: vi.fn().mockReturnThis(),
        };
      }
      return {
        update: vi.fn().mockReturnThis(),
        eq: vi.fn().mockResolvedValue({}),
      };
    });
  });

  it("creates a Beehiiv draft and schedules send", async () => {
    // Supabase Vault returns API key
    mockRpc.mockResolvedValue({ data: "bh-api-key-abc", error: null });

    // Mock global fetch
    const mockFetch = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ data: { id: "bh-post-123" } }),
      })
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) });

    vi.stubGlobal("fetch", mockFetch);

    const { deliveryAgent } = await import("../../agents/delivery-agent.js");
    const result = await deliveryAgent({
      ...mockBaseState,
      subjectLine: "Weekly Digest",
      previewText: "Top stories this week",
      htmlContent: "<html>...</html>",
    });

    expect(result.status).toBe("sent");

    // First fetch should POST to Beehiiv to create draft
    const [firstUrl, firstOpts] = mockFetch.mock.calls[0];
    expect(firstUrl).toContain("beehiiv.com");
    expect(JSON.parse(firstOpts.body).status).toBe("draft");

    // Second fetch should PATCH to confirm + schedule
    const [, secondOpts] = mockFetch.mock.calls[1];
    expect(JSON.parse(secondOpts.body).status).toBe("confirmed");

    vi.unstubAllGlobals();
  });

  it("throws when no beehiiv_account_id is set on instance", async () => {
    const { deliveryAgent } = await import("../../agents/delivery-agent.js");

    await expect(
      deliveryAgent({
        ...mockBaseState,
        instance: { ...mockBaseState.instance, beehiiv_account_id: null },
        htmlContent: "<html/>",
      })
    ).rejects.toThrow("No Beehiiv account");
  });

  it("throws when Beehiiv API key cannot be fetched from Vault", async () => {
    mockRpc.mockResolvedValue({ data: null, error: { message: "Not found" } });

    const { deliveryAgent } = await import("../../agents/delivery-agent.js");

    await expect(
      deliveryAgent({ ...mockBaseState, htmlContent: "<html/>" })
    ).rejects.toThrow("Failed to retrieve Beehiiv API key");
  });

  it("throws when Beehiiv API returns non-ok response", async () => {
    mockRpc.mockResolvedValue({ data: "bh-key", error: null });

    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 422,
      text: async () => "Unprocessable Entity",
    });
    vi.stubGlobal("fetch", mockFetch);

    const { deliveryAgent } = await import("../../agents/delivery-agent.js");

    await expect(
      deliveryAgent({ ...mockBaseState, htmlContent: "<html/>" })
    ).rejects.toThrow("Beehiiv API error: 422");

    vi.unstubAllGlobals();
  });
});
