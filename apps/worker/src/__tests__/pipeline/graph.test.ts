import { describe, it, expect, vi, beforeEach } from "vitest";
import { mockBaseState, mockArticle, mockCuratedTheme, mockSection } from "../fixtures.js";

// ── Mock all 8 agents so the graph test focuses on routing, not AI calls ────

vi.mock("../../agents/explore-agent.js", () => ({
  exploreAgent: vi.fn(),
}));
vi.mock("../../agents/deduplication-agent.js", () => ({
  deduplicationAgent: vi.fn(),
}));
vi.mock("../../agents/curate-agent.js", () => ({
  curateAgent: vi.fn(),
}));
vi.mock("../../agents/deep-dive-agent.js", () => ({
  deepDiveAgent: vi.fn(),
}));
vi.mock("../../agents/writing-agent.js", () => ({
  writingAgent: vi.fn(),
}));
vi.mock("../../agents/editorial-agent.js", () => ({
  editorialAgent: vi.fn(),
}));
vi.mock("../../agents/assembly-agent.js", () => ({
  assemblyAgent: vi.fn(),
}));
vi.mock("../../agents/delivery-agent.js", () => ({
  deliveryAgent: vi.fn(),
}));

// Use MemorySaver instead of PostgresSaver so tests don't need a real DB
vi.mock("@langchain/langgraph-checkpoint-postgres", () => ({
  PostgresSaver: class {
    static fromConnString() { return new this(); }
    async setup() {}
  },
}));

import { MemorySaver } from "@langchain/langgraph";
import { exploreAgent } from "../../agents/explore-agent.js";
import { deduplicationAgent } from "../../agents/deduplication-agent.js";
import { curateAgent } from "../../agents/curate-agent.js";
import { deepDiveAgent } from "../../agents/deep-dive-agent.js";
import { writingAgent } from "../../agents/writing-agent.js";
import { editorialAgent } from "../../agents/editorial-agent.js";
import { assemblyAgent } from "../../agents/assembly-agent.js";
import { deliveryAgent } from "../../agents/delivery-agent.js";
import { buildPipelineGraph } from "../../pipeline/graph.js";

const exploreAgentMock = vi.mocked(exploreAgent);
const deduplicateAgentMock = vi.mocked(deduplicationAgent);
const curateAgentMock = vi.mocked(curateAgent);
const deepDiveAgentMock = vi.mocked(deepDiveAgent);
const writingAgentMock = vi.mocked(writingAgent);
const editorialAgentMock = vi.mocked(editorialAgent);
const assemblyAgentMock = vi.mocked(assemblyAgent);
const deliveryAgentMock = vi.mocked(deliveryAgent);

function buildTestGraph() {
  const checkpointer = new MemorySaver();
  // Cast to satisfy type — MemorySaver is compatible for testing purposes
  return buildPipelineGraph(checkpointer as never);
}

describe("buildPipelineGraph — routing logic", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("happy path: runs all 8 nodes and ends with status=sent", async () => {
    exploreAgentMock.mockResolvedValue({ rawArticles: [mockRawArticle()], sourceErrors: [], status: "researching" });
    deduplicateAgentMock.mockResolvedValue({ deduplicatedArticles: [mockArticle], status: "deduplicating" });
    curateAgentMock.mockResolvedValue({ curatedThemes: [mockCuratedTheme], status: "scoring" });
    deepDiveAgentMock.mockResolvedValue({ curatedThemes: [mockCuratedTheme], status: "researching" });
    writingAgentMock.mockResolvedValue({ sections: [mockSection], subjectLine: "S", previewText: "P", editorialFeedback: null, rewriteCount: 1, status: "writing" });
    editorialAgentMock.mockResolvedValue({ editorialFeedback: null, status: "reviewing" });
    assemblyAgentMock.mockResolvedValue({ htmlContent: "<html/>", status: "assembling" });
    deliveryAgentMock.mockResolvedValue({ status: "sent" });

    const graph = buildTestGraph();
    const instanceNoApproval = { ...mockBaseState.instance, require_approval: false };
    const result = await graph.invoke(
      { ...mockBaseState, instance: instanceNoApproval },
      { configurable: { thread_id: "test-thread-no-approval" } }
    );

    expect(result.status).toBe("sent");
    expect(deliveryAgentMock).toHaveBeenCalledTimes(1);
  });

  it("aborts when curate returns status=aborted (no articles)", async () => {
    exploreAgentMock.mockResolvedValue({ rawArticles: [], sourceErrors: [], status: "researching" });
    deduplicateAgentMock.mockResolvedValue({ deduplicatedArticles: [], status: "deduplicating" });
    curateAgentMock.mockResolvedValue({
      curatedThemes: [],
      status: "aborted",
      abortReason: "No articles found",
    });

    const graph = buildTestGraph();
    const result = await graph.invoke(
      { ...mockBaseState, instance: { ...mockBaseState.instance, require_approval: false } },
      { configurable: { thread_id: "test-thread-abort" } }
    );

    expect(result.status).toBe("aborted");
    expect(deepDiveAgentMock).not.toHaveBeenCalled();
    expect(writingAgentMock).not.toHaveBeenCalled();
    expect(deliveryAgentMock).not.toHaveBeenCalled();
  });

  it("loops through write→editorial until approved (respects max_rewrite_loops)", async () => {
    exploreAgentMock.mockResolvedValue({ rawArticles: [mockRawArticle()], sourceErrors: [], status: "researching" });
    deduplicateAgentMock.mockResolvedValue({ deduplicatedArticles: [mockArticle], status: "deduplicating" });
    curateAgentMock.mockResolvedValue({ curatedThemes: [mockCuratedTheme], status: "scoring" });
    deepDiveAgentMock.mockResolvedValue({ curatedThemes: [mockCuratedTheme], status: "researching" });
    assemblyAgentMock.mockResolvedValue({ htmlContent: "<html/>", status: "assembling" });
    deliveryAgentMock.mockResolvedValue({ status: "sent" });

    // Write always returns rewriteCount++
    let writeCallCount = 0;
    writingAgentMock.mockImplementation(async (state) => ({
      sections: [mockSection],
      subjectLine: "S",
      previewText: "P",
      editorialFeedback: null,
      rewriteCount: state.rewriteCount + 1,
      status: "writing" as const,
    }));

    // Editorial: reject once, then approve
    let editorialCallCount = 0;
    editorialAgentMock.mockImplementation(async (_state) => {
      editorialCallCount++;
      if (editorialCallCount === 1) {
        return { editorialFeedback: "Needs more depth", status: "reviewing" as const };
      }
      return { editorialFeedback: null, status: "reviewing" as const };
    });

    const graph = buildTestGraph();
    const result = await graph.invoke(
      {
        ...mockBaseState,
        instance: { ...mockBaseState.instance, require_approval: false, max_rewrite_loops: 2 },
      },
      { configurable: { thread_id: "test-thread-rewrite" } }
    );

    expect(result.status).toBe("sent");
    expect(writingAgentMock).toHaveBeenCalledTimes(2); // initial write + 1 rewrite
    expect(editorialAgentMock).toHaveBeenCalledTimes(2);
  });

  it("interrupts before approval_gate when require_approval=true", async () => {
    exploreAgentMock.mockResolvedValue({ rawArticles: [mockRawArticle()], sourceErrors: [], status: "researching" });
    deduplicateAgentMock.mockResolvedValue({ deduplicatedArticles: [mockArticle], status: "deduplicating" });
    curateAgentMock.mockResolvedValue({ curatedThemes: [mockCuratedTheme], status: "scoring" });
    deepDiveAgentMock.mockResolvedValue({ curatedThemes: [mockCuratedTheme], status: "researching" });
    writingAgentMock.mockResolvedValue({ sections: [mockSection], subjectLine: "S", previewText: "P", editorialFeedback: null, rewriteCount: 1, status: "writing" });
    editorialAgentMock.mockResolvedValue({ editorialFeedback: null, status: "reviewing" });
    assemblyAgentMock.mockResolvedValue({ htmlContent: "<html/>", status: "assembling" });
    deliveryAgentMock.mockResolvedValue({ status: "sent" });

    const graph = buildTestGraph();
    const threadId = "test-thread-approval";

    // First invoke — should pause at approval_gate (interruptBefore fires after assemble)
    const firstResult = await graph.invoke(
      { ...mockBaseState, instance: { ...mockBaseState.instance, require_approval: true } },
      { configurable: { thread_id: threadId } }
    );

    // Pipeline paused before approval_gate ran — delivery must NOT have been called.
    // The returned state reflects the last completed node (assemble → "assembling"),
    // because approval_gate hasn't executed yet.
    expect(deliveryAgentMock).not.toHaveBeenCalled();
    expect(firstResult.status).toBe("assembling"); // approval_gate hasn't run yet

    // Resume (simulating user approval) — pass null to trigger execution from checkpoint
    await graph.invoke(null, { configurable: { thread_id: threadId } });

    // The key assertion: delivery ran exactly once, only after the approval resume
    expect(deliveryAgentMock).toHaveBeenCalledTimes(1);
  });
});

function mockRawArticle() {
  return {
    id: "art-1",
    title: "Test Article",
    url: "https://example.com/test",
    markdown: "Test content",
    sourceLabel: "query_1",
    sourceType: "tavily",
  };
}
