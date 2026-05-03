import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@trigger.dev/sdk/v3", () => ({
  task: (_config: { run: Function }) => ({ run: _config.run }),
}));

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

describe("resume-pipeline task", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.SUPABASE_CONNECTION_STRING = "postgresql://localhost/test";
    mockGraphInvoke.mockResolvedValue({ status: "sent" });
  });

  it("calls checkpointer.setup() before resuming the graph", async () => {
    const { resumePipeline } = await import("../../trigger/resume-pipeline.js");
    await resumePipeline.run({ threadId: "pipeline-inst-1-run-1" });

    expect(mockSetup).toHaveBeenCalledTimes(1);
  });

  it("invokes graph with null input and the correct threadId to resume from checkpoint", async () => {
    const { resumePipeline } = await import("../../trigger/resume-pipeline.js");
    await resumePipeline.run({ threadId: "pipeline-inst-1-run-1" });

    // Must pass null — a non-null value updates state but does NOT resume execution
    expect(mockGraphInvoke).toHaveBeenCalledWith(
      null,
      { configurable: { thread_id: "pipeline-inst-1-run-1" } }
    );
  });

  it("returns status from resumed graph", async () => {
    mockGraphInvoke.mockResolvedValue({ status: "sent" });

    const { resumePipeline } = await import("../../trigger/resume-pipeline.js");
    const result = await resumePipeline.run({ threadId: "any-thread" });

    expect(result.status).toBe("sent");
  });

  it("propagates error if graph throws during resume", async () => {
    mockGraphInvoke.mockRejectedValue(new Error("Delivery failed"));

    const { resumePipeline } = await import("../../trigger/resume-pipeline.js");
    await expect(resumePipeline.run({ threadId: "bad-thread" })).rejects.toThrow("Delivery failed");
  });
});
