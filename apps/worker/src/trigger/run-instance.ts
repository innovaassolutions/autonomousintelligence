import { task } from "@trigger.dev/sdk/v3";
import { createClient } from "@supabase/supabase-js";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { v4 as uuidv4 } from "uuid";
import { buildPipelineGraph } from "../pipeline/graph.js";

export const runInstance = task({
  id: "run-instance",
  maxDuration: 3600,
  run: async (payload: { instanceId: string }) => {
    const { instanceId } = payload;

    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    const { data: instance, error } = await supabase
      .from("newsletter_instances")
      .select("*")
      .eq("id", instanceId)
      .single();

    if (error || !instance) {
      throw new Error(`Instance not found: ${instanceId}`);
    }

    const runId = uuidv4();
    const threadId = `pipeline-${instanceId}-${runId}`;

    await supabase.from("pipeline_runs").insert({
      id: runId,
      instance_id: instanceId,
      status: "started",
      current_stage: "research",
      langgraph_thread_id: threadId,
    });

    const checkpointer = PostgresSaver.fromConnString(
      process.env.SUPABASE_CONNECTION_STRING!
    );
    const graph = buildPipelineGraph(checkpointer);

    const result = await graph.invoke(
      { instanceId, runId, instance },
      { configurable: { thread_id: threadId } }
    );

    return { status: result.status, runId };
  },
});
