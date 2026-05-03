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
    await checkpointer.setup();
    const graph = buildPipelineGraph(checkpointer);

    // IMPORTANT: pass null to resume from the interrupt checkpoint.
    // Passing a non-null state update would patch the checkpoint state but NOT
    // re-trigger graph execution — the pipeline would silently stall.
    const result = await graph.invoke(
      null,
      { configurable: { thread_id: threadId } }
    );

    return { status: result.status };
  },
});
