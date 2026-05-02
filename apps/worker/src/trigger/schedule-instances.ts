import { schedules } from "@trigger.dev/sdk/v3";
import { Cron } from "croner";
import { createClient } from "@supabase/supabase-js";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { buildPipelineGraph } from "../pipeline/graph.js";
import { v4 as uuidv4 } from "uuid";

export const scheduleInstances = schedules.task({
  id: "schedule-instances",
  cron: "*/15 * * * *",
  run: async () => {
    const supabase = createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_KEY!
    );

    const { data: instances } = await supabase
      .from("newsletter_instances")
      .select("*")
      .eq("is_active", true);

    const now = new Date();

    for (const instance of instances ?? []) {
      const nextRun = new Date(instance.next_run_at ?? 0);
      if (nextRun > now) continue;

      const runId = uuidv4();
      const threadId = `pipeline-${instance.id}-${runId}`;

      await supabase.from("pipeline_runs").insert({
        id: runId,
        instance_id: instance.id,
        status: "started",
        current_stage: "research",
        langgraph_thread_id: threadId,
      });

      // Advance next_run_at using croner
      try {
        const cron = new Cron(instance.cron_schedule, { timezone: instance.timezone });
        await supabase
          .from("newsletter_instances")
          .update({ next_run_at: cron.nextRun()?.toISOString() })
          .eq("id", instance.id);
      } catch (err) {
        console.error(`Invalid cron_schedule for instance ${instance.id} ("${instance.cron_schedule}"): ${err}`);
        continue;
      }

      // Build and invoke the LangGraph pipeline (fire and forget — state persisted via checkpointer)
      const checkpointer = PostgresSaver.fromConnString(
        process.env.SUPABASE_CONNECTION_STRING!
      );
      const graph = buildPipelineGraph(checkpointer);

      graph
        .invoke(
          { instanceId: instance.id, runId, instance },
          { configurable: { thread_id: threadId } }
        )
        .catch(console.error);
    }
  },
});
