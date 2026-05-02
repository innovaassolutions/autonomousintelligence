import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import { buildPipelineGraph } from "../src/pipeline/graph.js";
import type { NewsletterInstance } from "../src/pipeline/state.js";
import "dotenv/config";

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const fresh = process.argv.includes("--fresh");

  // ── 1. Upsert a test newsletter instance ──────────────────────────────────
  console.log("Upserting test instance...");

  const testInstance: Omit<NewsletterInstance, "id"> = {
    name: "Manufacturing Ops Weekly",
    slug: "manufacturing-ops",
    vertical: "manufacturing operations",
    description: "Weekly intelligence for manufacturing operations leaders",
    target_audience: "Operations managers and plant directors in discrete manufacturing",
    cron_schedule: "0 7 * * 1",
    timezone: "Asia/Singapore",
    next_run_at: null,
    is_active: true,
    voice_prompt: `You write for senior manufacturing operations leaders — plant directors, VP Ops, and COOs at mid-to-large discrete manufacturers.
Your tone is direct, data-driven, and practical. No fluff. Lead with the operational impact.
Avoid jargon unless it's industry-standard. Assume the reader manages complex production environments and cares about uptime, throughput, cost-per-unit, and regulatory compliance.`,
    newsletter_name: "Manufacturing Ops Weekly",
    editorial_focus: null,
    max_rewrite_loops: 1,
    beehiiv_account_id: null,
    beehiiv_pub_id: null,
    send_hour: 7,
    subject_template: null,
    require_approval: true,
    approver_email: null,
    linked_product: null,
  };

  const { data: existing } = await supabase
    .from("newsletter_instances")
    .select("id")
    .eq("slug", "manufacturing-ops")
    .maybeSingle();

  let instanceId: string;

  if (existing) {
    instanceId = existing.id;
    await supabase
      .from("newsletter_instances")
      .update(testInstance)
      .eq("id", instanceId);
    console.log(`✓ Updated existing instance: ${instanceId}`);
  } else {
    const { data: inserted, error } = await supabase
      .from("newsletter_instances")
      .insert(testInstance)
      .select("id")
      .single();
    if (error) throw new Error(`Failed to insert instance: ${error.message}`);
    instanceId = inserted.id;
    console.log(`✓ Created test instance: ${instanceId}`);
  }

  // ── 2. Optionally clear previous articles for a fresh test run ───────────
  if (fresh) {
    console.log("--fresh: clearing previous articles for this instance...");
    await supabase.from("articles").delete().eq("instance_id", instanceId);
    console.log("✓ Articles cleared");
  }

  // ── 3. Create a pipeline run ──────────────────────────────────────────────
  const runId = uuidv4();
  const threadId = `pipeline-${instanceId}-${runId}`;

  const { error: runError } = await supabase.from("pipeline_runs").insert({
    id: runId,
    instance_id: instanceId,
    status: "started",
    current_stage: "research",
    langgraph_thread_id: threadId,
  });
  if (runError) throw new Error(`Failed to create run: ${runError.message}`);
  console.log(`✓ Created pipeline run: ${runId}`);
  console.log(`  Thread ID: ${threadId}`);

  // ── 4. Build and invoke the LangGraph pipeline ────────────────────────────
  console.log("\nStarting pipeline...\n");

  const checkpointer = PostgresSaver.fromConnString(process.env.SUPABASE_CONNECTION_STRING!);
  const graph = buildPipelineGraph(checkpointer);

  const fullInstance = { ...testInstance, id: instanceId };

  const result = await graph.invoke(
    { instanceId, runId, instance: fullInstance },
    { configurable: { thread_id: threadId } }
  );

  // ── 5. Report results ─────────────────────────────────────────────────────
  console.log("\n── Pipeline result ──────────────────────────────────────────");
  console.log(`Status:          ${result.status}`);
  console.log(`Raw articles:    ${result.rawArticles?.length ?? 0}`);
  console.log(`Deduplicated:    ${result.deduplicatedArticles?.length ?? 0}`);
  console.log(`Curated themes:  ${result.curatedThemes?.length ?? 0}`);
  console.log(`Sections:        ${result.sections?.length ?? 0}`);
  console.log(`Subject:         ${result.subjectLine ?? "(none)"}`);

  if (result.status === "aborted") {
    console.log(`Abort reason:    ${result.abortReason}`);
  }

  if (result.status === "awaiting_approval") {
    console.log("\n✓ Pipeline paused at approval gate — edition is ready for review.");
    console.log("  Check Supabase newsletter_editions table for the draft.");
  }

  if (result.curatedThemes?.length > 0) {
    console.log("\n── Curated themes ───────────────────────────────────────────");
    for (const theme of result.curatedThemes) {
      console.log(`\n[${theme.section_name}] ${theme.title}`);
      console.log(`  Angle: ${theme.angle}`);
      console.log(`  Articles: ${theme.supporting_articles.length}`);
    }
  }

  if (result.sections?.length > 0) {
    console.log("\n── Sections preview ─────────────────────────────────────────");
    for (const section of result.sections) {
      console.log(`\n[${section.name}] ${section.headline}`);
      console.log(`  ${section.body.slice(0, 120)}...`);
      console.log(`  Takeaway: ${section.key_takeaway}`);
    }
  }

  if (result.sourceErrors?.length > 0) {
    console.log("\n── Source errors ────────────────────────────────────────────");
    for (const err of result.sourceErrors) {
      console.log(`  ✗ ${err.sourceLabel}: ${err.error}`);
    }
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("\n✗ Pipeline failed:", err.message);
  console.error(err.stack);
  process.exit(1);
});
