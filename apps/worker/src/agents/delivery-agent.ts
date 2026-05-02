import { createClient } from "@supabase/supabase-js";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import type { PipelineState } from "../pipeline/state.js";

export async function deliveryAgent(state: typeof PipelineState.State) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  const { instance, runId, subjectLine, previewText, htmlContent } = state;

  const { data: run } = await supabase
    .from("pipeline_runs")
    .select("edition_id")
    .eq("id", runId)
    .single();

  // Fetch the Beehiiv API key from Supabase Vault via the account FK
  if (!instance.beehiiv_account_id) {
    throw new Error("No Beehiiv account linked to this instance");
  }
  const { data: apiKey, error: keyError } = await supabase.rpc("get_beehiiv_api_key", {
    p_account_id: instance.beehiiv_account_id,
  });
  if (keyError || !apiKey) {
    throw new Error(`Failed to retrieve Beehiiv API key: ${keyError?.message ?? "not found"}`);
  }

  // Create Beehiiv draft
  const beehiivRes = await fetch(
    `https://api.beehiiv.com/v2/publications/${instance.beehiiv_pub_id}/posts`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: subjectLine,
        preview_text: previewText,
        content_html: htmlContent,
        status: "draft",
      }),
    }
  );

  if (!beehiivRes.ok) {
    throw new Error(`Beehiiv API error: ${beehiivRes.status} ${await beehiivRes.text()}`);
  }

  const beehiivPost = await beehiivRes.json() as { data: { id: string } };

  // Schedule send at configured hour in the instance's timezone
  const now = new Date();
  const zonedNow = toZonedTime(now, instance.timezone);
  zonedNow.setHours(instance.send_hour, 0, 0, 0);
  let sendAt = fromZonedTime(zonedNow, instance.timezone);
  if (sendAt <= now) sendAt = new Date(sendAt.getTime() + 86_400_000);

  await fetch(
    `https://api.beehiiv.com/v2/publications/${instance.beehiiv_pub_id}/posts/${beehiivPost.data.id}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "confirmed", scheduled_at: sendAt.toISOString() }),
    }
  );

  await supabase
    .from("newsletter_editions")
    .update({
      beehiiv_post_id: beehiivPost.data.id,
      scheduled_send_at: sendAt.toISOString(),
      delivery_status: "scheduled",
    })
    .eq("id", run!.edition_id);

  await supabase
    .from("pipeline_runs")
    .update({ status: "sent" })
    .eq("id", runId);

  return { status: "sent" as const };
}
