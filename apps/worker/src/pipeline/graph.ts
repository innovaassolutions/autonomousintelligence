import { StateGraph, END, START, interrupt } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { PipelineState } from "./state.js";
import { exploreAgent } from "../agents/explore-agent.js";
import { deduplicationAgent } from "../agents/deduplication-agent.js";
import { curateAgent } from "../agents/curate-agent.js";
import { deepDiveAgent } from "../agents/deep-dive-agent.js";
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
    .addNode("explore", exploreAgent)
    .addNode("deduplicate", deduplicationAgent)
    .addNode("curate", curateAgent)
    .addNode("deep_dive", deepDiveAgent)
    .addNode("write", writingAgent)
    .addNode("editorial", editorialAgent)
    .addNode("assemble", assemblyAgent)
    .addNode("approval_gate", async (_state) => {
      interrupt({ message: "Awaiting human approval" });
      return { status: "awaiting_approval" as const };
    })
    .addNode("deliver", deliveryAgent)
    .addNode("abort", async (state) => state)

    .addEdge(START, "explore")
    .addEdge("explore", "deduplicate")
    .addEdge("deduplicate", "curate")
    .addConditionalEdges("curate", shouldAbort, { abort: "abort", continue: "deep_dive" })
    .addEdge("deep_dive", "write")
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
