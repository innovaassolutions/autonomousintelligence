import { StateGraph, END, START, interrupt } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { PipelineState } from "./state.js";
import { researchAgent } from "../agents/research-agent.js";
import { deduplicationAgent } from "../agents/deduplication-agent.js";
import { scoringAgent } from "../agents/scoring-agent.js";
import { writingAgent } from "../agents/writing-agent.js";
import { editorialAgent } from "../agents/editorial-agent.js";
import { assemblyAgent } from "../agents/assembly-agent.js";
import { deliveryAgent } from "../agents/delivery-agent.js";

function shouldAbort(state: typeof PipelineState.State) {
  return state.status === "aborted" ? "abort" : "continue";
}

function shouldRewrite(state: typeof PipelineState.State) {
  const { editorialFeedback, rewriteCount, instance } = state;
  if (editorialFeedback && rewriteCount < (instance.max_rewrite_loops ?? 2)) {
    return "rewrite";
  }
  return "continue";
}

function shouldRequestApproval(state: typeof PipelineState.State) {
  return state.instance.require_approval ? "approval_gate" : "deliver";
}

export function buildPipelineGraph(checkpointer: PostgresSaver) {
  const graph = new StateGraph(PipelineState)
    .addNode("research", researchAgent)
    .addNode("deduplicate", deduplicationAgent)
    .addNode("score", scoringAgent)
    .addNode("write", writingAgent)
    .addNode("editorial", editorialAgent)
    .addNode("assemble", assemblyAgent)
    .addNode("approval_gate", async (_state) => {
      // Pauses the graph — resumed from the admin UI approve API route
      interrupt({ message: "Awaiting human approval" });
      return { status: "awaiting_approval" as const };
    })
    .addNode("deliver", deliveryAgent)
    .addNode("abort", async (state) => state)

    .addEdge(START, "research")
    .addEdge("research", "deduplicate")
    .addEdge("deduplicate", "score")
    .addConditionalEdges("score", shouldAbort, { abort: "abort", continue: "write" })
    .addEdge("write", "editorial")
    .addConditionalEdges("editorial", shouldRewrite, { rewrite: "write", continue: "assemble" })
    .addConditionalEdges("assemble", shouldRequestApproval, {
      approval_gate: "approval_gate",
      deliver: "deliver",
    })
    .addEdge("approval_gate", "deliver")
    .addEdge("deliver", END)
    .addEdge("abort", END)

    .compile({ checkpointer, interruptBefore: ["approval_gate"] });

  return graph;
}
