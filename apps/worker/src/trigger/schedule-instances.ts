import { schedules, tasks } from "@trigger.dev/sdk/v3";
import { Cron } from "croner";
import { createClient } from "@supabase/supabase-js";

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

      // Advance next_run_at using croner before triggering
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

      // Trigger run-instance as a proper child task so it runs to completion
      await tasks.trigger("run-instance", { instanceId: instance.id });
      console.log(`[schedule-instances] Triggered run-instance for: ${instance.id}`);
    }
  },
});
