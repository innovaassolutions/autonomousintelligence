import { tavily } from "@tavily/core";
import { createClient } from "@supabase/supabase-js";
import Anthropic from "@anthropic-ai/sdk";
import crypto from "crypto";
import { parseJsonResponse } from "../lib/parse-json.js";
import type { PipelineState, RawArticle, SourceError } from "../pipeline/state.js";

export async function exploreAgent(state: typeof PipelineState.State) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY! });

  const { instance, instanceId, runId } = state;
  const today = new Date().toLocaleDateString("en-GB", { weekday: "long", year: "numeric", month: "long", day: "numeric" });

  // Step 1: Claude generates targeted search queries for this vertical + audience
  const queryResponse = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    messages: [
      {
        role: "user",
        content: `You are a research editor for "${instance.newsletter_name}", a newsletter for ${instance.target_audience} in the ${instance.vertical} space.

Today is ${today}.

Generate 6 diverse search queries to discover the most interesting and important things happening RIGHT NOW in this space. Cover:
- Breaking news and recent developments (past 7 days)
- Emerging trends worth watching
- Practical insights the audience would act on
- Any surprising or contrarian data points

Return ONLY valid JSON: { "queries": ["...", "...", "...", "...", "...", "..."] }`,
      },
    ],
  });

  const { queries } = parseJsonResponse<{ queries: string[] }>(
    (queryResponse.content[0] as { type: "text"; text: string }).text
  );

  // Step 2: Run all searches in parallel
  const sourceErrors: SourceError[] = [];
  const searchResults = await Promise.allSettled(
    queries.map((q) =>
      tavilyClient.search(q, { maxResults: 7, includeRawContent: true })
    )
  );

  // Step 3: Flatten, deduplicate by URL, persist to articles table
  const seenUrls = new Set<string>();
  const rawArticles: RawArticle[] = [];

  for (const [i, result] of searchResults.entries()) {
    if (result.status === "rejected") {
      sourceErrors.push({ sourceLabel: `query_${i + 1}`, error: String(result.reason) });
      continue;
    }

    for (const r of result.value.results) {
      if (seenUrls.has(r.url)) continue;
      seenUrls.add(r.url);

      const urlHash = crypto.createHash("sha256").update(r.url).digest("hex");

      // Skip articles already seen in previous runs for this instance
      const { data: existing } = await supabase
        .from("articles")
        .select("id")
        .eq("url_hash", urlHash)
        .eq("instance_id", instanceId)
        .maybeSingle();

      if (existing) continue;

      const markdown = (r as any).rawContent || r.content || "";

      const { data: inserted } = await supabase
        .from("articles")
        .insert({
          instance_id: instanceId,
          run_id: runId,
          source_label: `explore:${queries[i]?.slice(0, 60)}`,
          source_type: "tavily",
          url: r.url,
          url_hash: urlHash,
          title: r.title,
          raw_markdown: markdown,
          status: "raw",
        })
        .select("id")
        .single();

      if (inserted) {
        rawArticles.push({
          id: inserted.id,
          title: r.title,
          url: r.url,
          markdown,
          sourceLabel: queries[i] ?? "",
          sourceType: "tavily",
        });
      }
    }
  }

  await supabase
    .from("pipeline_runs")
    .update({ articles_ingested: rawArticles.length, status: "researching" })
    .eq("id", runId);

  return { rawArticles, sourceErrors, status: "researching" as const };
}
