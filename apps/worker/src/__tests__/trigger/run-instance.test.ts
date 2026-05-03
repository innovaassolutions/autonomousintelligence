import { describe, it, expect, vi, beforeEach } from "vitest";

// ── Mock Trigger.dev ──────────────────────────────────────────────────────────
vi.mock("@trigger.dev/sdk/v3", () => ({
  task: (_config: { run: Function }) => ({ run: _config.run }),
}));

// ── Mock Supabase ─────────────────────────────────────────────────────────────
const mockInsert = vi.fn();
const mockUpdate = vi.fn();
const mockEq = vi.fn();
const mockSingle = vi.fn();
const mockFrom = vi.fn();
vi.mock("@supabase/supabase-js", () => ({
  createClient: () => ({ from: mockFrom }),
}));

// ── Mock LangGraph checkpointer ───────────────────────────────────────────────
const mockSetup = vi.fn().mockResolvedValue(undefined);
const mockGraphInvoke = vi.fn();
vi.mock("@langchain/langgraph-checkpoint-postgres", () => ({
  PostgresSaver: class {
    static fromConnString() { return new this(); }
    setup = mockSetup;
  },
}));
vi.mock("../../pipeline/graph.js", () => ({
  buildPipelineGraph: () => ({ invoke: mockGraphInvoke }),
}));

describe("run-instance task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_URL = "https://test.supabase.co";
    process.env.SUPABASE_SERVICE_KEY = "test-key";
    process.env.SUPABASE_CONNECTION_STRING = "postgresql://localhost/test";

    // Default: instance found, pipeline_run inserted, graph succeeds
    mockFrom.mockImplementation((table: string) => {
      if (table === "newsletter_instances") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: "inst-1", name: "Test", cron_schedule: "0 8 * * *" },
            error: null,
          }),
        };
      }
      if (table === "pipeline_runs") {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnThis(),
          eq: vi.fn().mockResolvedValue({}),
        };
      }
      return { update: vi.fn().mockReturnThis(), eq: vi.fn().mockResolvedValue({}) };
    });

    mockGraphInvoke.mockResolvedValue({ status: "sent" });
  });

  it("calls checkpointer.setup() before invoking graph", async () => {
    const { runInstance } = await import("../../trigger/run-instance.js");
    await runInstance.run({ instanceId: "inst-1" });

    expect(mockSetup).toHaveBeenCalledTimes(1);
    expect(mockGraphInvoke).toHaveBeenCalledTimes(1);
  });

  it("throws when instance is not found", async () => {
    mockFrom.mockImplementation((table: string) => {
      if (table === "newsletter_instances") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({ data: null, error: { message: "Not found" } }),
        };
      }
      return {};
    });

    const { runInstance } = await import("../../trigger/run-instance.js");
    await expect(runInstance.run({ instanceId: "missing" })).rejects.toThrow("Instance not found");
  });

  it("marks pipeline_run as failed when graph throws", async () => {
    mockGraphInvoke.mockRejectedValue(new Error("Explore agent failed"));

    const mockRunUpdate = vi.fn().mockReturnThis();
    const mockRunEq = vi.fn().mockResolvedValue({});
    mockFrom.mockImplementation((table: string) => {
      if (table === "newsletter_instances") {
        return {
          select: vi.fn().mockReturnThis(),
          eq: vi.fn().mockReturnThis(),
          single: vi.fn().mockResolvedValue({
            data: { id: "inst-1", name: "Test" },
            error: null,
          }),
        };
      }
      if (table === "pipeline_runs") {
        return {
          insert: vi.fn().mockResolvedValue({ error: null }),
          update: vi.fn().mockReturnValue({ eq: mockRunEq }),
          eq: vi.fn().mockResolvedValue({}),
        };
      }
      return {};
    });

    const { runInstance } = await import("../../trigger/run-instance.js");
    await expect(runInstance.run({ instanceId: "inst-1" })).rejects.toThrow("Explore agent failed");
  });

  it("returns status from graph result", async () => {
    mockGraphInvoke.mockResolvedValue({ status: "awaiting_approval" });

    const { runInstance } = await import("../../trigger/run-instance.js");
    const result = await runInstance.run({ instanceId: "inst-1" });

    expect(result.status).toBe("awaiting_approval");
  });
});
