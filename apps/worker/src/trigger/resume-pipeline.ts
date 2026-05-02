import { task } from "@trigger.dev/sdk/v3";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { buildPipelineGraph } from "../pipeline/graph.js";

export const resumePipeline = task({
  id: "resume-pipeline",
  maxDuration: 3600,
  run: async (payload: { threadId: string }) => {
    const { threadId } = payload;

    const checkpointer = PostgresSaver.fromConnString(
      process.env.SUPABASE_CONNECTION_STRING!
    );
    const graph = buildPipelineGraph(checkpointer);

    // Resume the paused graph from the approval_gate node
    const result = await graph.invoke(
      { approvalStatus: "approved" },
      { configurable: { thread_id: threadId } }
    );

    return { status: result.status };
  },
});
