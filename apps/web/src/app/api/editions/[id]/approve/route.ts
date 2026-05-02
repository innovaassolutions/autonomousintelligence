import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { tasks } from "@trigger.dev/sdk/v3";

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

  if (decision === "approved") {
    const threadId = (edition as any).pipeline_runs?.langgraph_thread_id;

    if (threadId) {
      // Trigger the resume task on the Trigger.dev worker
      await tasks.trigger("resume-pipeline", { threadId });
    }
  }

  return NextResponse.json({ ok: true });
}
