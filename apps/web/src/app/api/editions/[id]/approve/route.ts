import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const supabase = createClient(
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const { decision, approvedBy, rejectionNote } = await req.json();

  if (!["approved", "rejected"].includes(decision)) {
    return NextResponse.json({ error: "Invalid decision" }, { status: 400 });
  }

  const { data: edition, error } = await supabase
    .from("newsletter_editions")
    .select("id, pipeline_runs(langgraph_thread_id)")
    .eq("id", id)
    .single();

  if (error || !edition) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await supabase
    .from("newsletter_editions")
    .update({
      approval_status: decision,
      approved_by: approvedBy ?? null,
      approved_at: decision === "approved" ? new Date().toISOString() : null,
      rejection_note: rejectionNote ?? null,
    })
    .eq("id", id);

  // If approved, notify the Railway worker to resume the LangGraph graph.
  // The worker exposes a /resume endpoint that calls graph.invoke() with
  // the stored thread_id. Set WORKER_RESUME_URL in Vercel env vars once
  // Railway is deployed.
  if (decision === "approved") {
    const workerUrl = process.env.WORKER_RESUME_URL;
    const threadId = (edition as any).pipeline_runs?.langgraph_thread_id;

    if (workerUrl && threadId) {
      await fetch(`${workerUrl}/resume`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ threadId }),
      }).catch(console.error);
    }
  }

  return NextResponse.json({ ok: true });
}
