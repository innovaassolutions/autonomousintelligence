import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

export async function POST(req: NextRequest) {
  // Validate Beehiiv webhook signature
  const signature = req.headers.get("x-beehiiv-signature");
  const body = await req.text();
  const expected = createHmac("sha256", process.env.BEEHIIV_WEBHOOK_SECRET!)
    .update(body)
    .digest("hex");

  if (signature !== expected) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );

  const { event, data } = JSON.parse(body);

  if (!["email.sent", "email.opened", "email.clicked"].includes(event)) {
    return NextResponse.json({ ok: true });
  }

  const { data: edition } = await supabase
    .from("newsletter_editions")
    .select("id, instance_id")
    .eq("beehiiv_post_id", data.post_id)
    .maybeSingle();

  if (!edition) return NextResponse.json({ ok: true });

  await supabase.from("edition_feedback").upsert(
    {
      edition_id: edition.id,
      instance_id: edition.instance_id,
      open_rate: data.open_rate ?? null,
      click_rate: data.click_rate ?? null,
      total_opens: data.total_opens ?? null,
      total_clicks: data.total_clicks ?? null,
      link_clicks: data.link_clicks ?? [],
    },
    { onConflict: "edition_id" }
  );

  return NextResponse.json({ ok: true });
}
