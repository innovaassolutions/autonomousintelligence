import { createClient } from "@supabase/supabase-js";
import type { PipelineState } from "../pipeline/state.js";

export async function assemblyAgent(state: typeof PipelineState.State) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  const { sections, subjectLine, previewText, instance, instanceId, runId, rewriteCount } =
    state;

  // Dynamically import to avoid issues during graph compilation
  const { renderNewsletterHTML } = await import("../emails/newsletter-template.js");

  const html = await renderNewsletterHTML({
    newsletterName: instance.newsletter_name,
    subjectLine: subjectLine!,
    previewText: previewText!,
    sections,
  });

  const { data: edition } = await supabase
    .from("newsletter_editions")
    .insert({
      instance_id: instanceId,
      run_id: runId,
      subject_line: subjectLine,
      preview_text: previewText,
      sections,
      html_content: html,
      rewrite_count: rewriteCount,
      approval_status: "pending",
      delivery_status: "draft",
    })
    .select("id")
    .single();

  await supabase
    .from("pipeline_runs")
    .update({ edition_id: edition!.id, status: "assembling" })
    .eq("id", runId);

  return { htmlContent: html, status: "assembling" as const };
}
