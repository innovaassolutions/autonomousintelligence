import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const { decision, approvedBy, rejectionNote } = await req.json();

  if (!["approved", "rejected"].includes(decision)) {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }

  // Load the edition and its associated pipeline run
  const { data: edition, error } = await supabase
    .from("newsletter_editions")
    .select("id, pipeline_runs(langgraph_thread_id)")
    .eq("id", id)
    .single();

  if (error || !edition) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  // Update approval state
  await supabase
    .from("newsletter_editions")
    .update({
      approval_status: decision,
      approved_by: approvedBy ?? null,
      approved_at: decision === "approved" ? new Date().toISOString() : null,
      rejection_note: rejectionNote ?? null,
    })
    .eq("id", id);

  if (decision === "approved") {
    // Dynamically import to keep Railway worker code out of Vercel bundle
    const { PostgresSaver } = await import("@langchain/langgraph-checkpoint-postgres");
    const { buildPipelineGraph } = await import("../../../../../worker/pipeline/graph");

    const checkpointer = PostgresSaver.fromConnString(
      process.env.SUPABASE_CONNECTION_STRING!
    );
    const graph = buildPipelineGraph(checkpointer);
    const threadId = (edition as any).pipeline_runs?.langgraph_thread_id;

    if (threadId) {
      // Resume the paused LangGraph graph — continues past the approval_gate node
      graph
        .invoke({ approvalStatus: "approved" }, { configurable: { thread_id: threadId } })
        .catch(console.error);
    }
  }

  return NextResponse.json({ ok: true });
}
