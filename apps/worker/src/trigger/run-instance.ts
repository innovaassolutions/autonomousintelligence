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

    console.log(`[run-instance] Starting for instance: ${instanceId}`);

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
      throw new Error(`Instance not found: ${instanceId} — ${error?.message}`);
    }

    console.log(`[run-instance] Loaded instance: ${instance.name}`);

    const runId = uuidv4();
    const threadId = `pipeline-${instanceId}-${runId}`;

    const { error: runError } = await supabase.from("pipeline_runs").insert({
      id: runId,
      instance_id: instanceId,
      status: "started",
      current_stage: "research",
      langgraph_thread_id: threadId,
    });

    if (runError) throw new Error(`Failed to create pipeline_run: ${runError.message}`);

    console.log(`[run-instance] Created pipeline run: ${runId}`);

    let checkpointer: PostgresSaver;
    try {
      checkpointer = PostgresSaver.fromConnString(process.env.SUPABASE_CONNECTION_STRING!);
      await checkpointer.setup();
      console.log(`[run-instance] Checkpointer ready`);
    } catch (err) {
      throw new Error(`Checkpointer setup failed: ${err}`);
    }

    const graph = buildPipelineGraph(checkpointer);

    console.log(`[run-instance] Invoking graph...`);

    try {
      const result = await graph.invoke(
        { instanceId, runId, instance },
        { configurable: { thread_id: threadId } }
      );
      console.log(`[run-instance] Graph completed with status: ${result.status}`);
      return { status: result.status, runId };
    } catch (err) {
      console.error(`[run-instance] Graph failed:`, err);
      await supabase
        .from("pipeline_runs")
        .update({ status: "failed", abort_reason: String(err) })
        .eq("id", runId);
      throw err;
    }
  },
});
