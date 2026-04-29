import { createClient } from "@supabase/supabase-js";
import FirecrawlApp from "@mendable/firecrawl-js";
import { tavily } from "@tavily/core";
import crypto from "crypto";
import type { PipelineState, RawArticle, Source, SourceError } from "../pipeline/state.js";

export async function researchAgent(state: typeof PipelineState.State) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  const firecrawl = new FirecrawlApp({ apiKey: process.env.FIRECRAWL_API_KEY! });
  const tavilyClient = tavily({ apiKey: process.env.TAVILY_API_KEY! });

  const { instance, instanceId, runId } = state;
  const sources = instance.sources as Source[];
  const rawArticles: RawArticle[] = [];
  const sourceErrors: SourceError[] = [];

  for (const source of sources) {
    try {
      let fetched: RawArticle[] = [];

      if (source.type === "rss" || source.type === "scrape") {
        const result = await firecrawl.scrapeUrl(source.url!, { formats: ["markdown"] });
        if (result.success) {
          fetched = [{
            id: "",
            title: result.metadata?.title || "",
            url: source.url!,
            markdown: result.markdown || "",
            sourceLabel: source.label,
            sourceType: source.type,
          }];
        }
      }

      if (source.type === "tavily") {
        const result = await tavilyClient.search(source.query!, {
          maxResults: 8,
          includeRawContent: true,
        });
        fetched = result.results.map(r => ({
          id: "",
          title: r.title,
          url: r.url,
          markdown: (r as any).rawContent || r.content,
          sourceLabel: source.label,
          sourceType: source.type,
        }));
      }

      for (const article of fetched) {
        const urlHash = crypto.createHash("sha256").update(article.url).digest("hex");

        const { data: existing } = await supabase
          .from("articles")
          .select("id")
          .eq("url_hash", urlHash)
          .eq("instance_id", instanceId)
          .maybeSingle();

        if (existing) continue;

        const { data: inserted } = await supabase
          .from("articles")
          .insert({
            instance_id: instanceId,
            run_id: runId,
            source_label: article.sourceLabel,
            source_type: article.sourceType,
            url: article.url,
            url_hash: urlHash,
            title: article.title,
            raw_markdown: article.markdown,
            status: "raw",
          })
          .select("id")
          .single();

        rawArticles.push({ ...article, id: inserted!.id });
      }

      await supabase.from("source_health").upsert(
        {
          instance_id: instanceId,
          source_label: source.label,
          source_url: source.url,
          last_success_at: new Date().toISOString(),
          consecutive_failures: 0,
          is_flagged: false,
        },
        { onConflict: "instance_id,source_label" }
      );
    } catch (err) {
      sourceErrors.push({ sourceLabel: source.label, error: String(err) });

      const { data: health } = await supabase
        .from("source_health")
        .select("consecutive_failures")
        .eq("instance_id", instanceId)
        .eq("source_label", source.label)
        .maybeSingle();

      const failures = (health?.consecutive_failures ?? 0) + 1;

      await supabase.from("source_health").upsert(
        {
          instance_id: instanceId,
          source_label: source.label,
          last_failure_at: new Date().toISOString(),
          consecutive_failures: failures,
          is_flagged: failures >= 3,
        },
        { onConflict: "instance_id,source_label" }
      );
    }
  }

  await supabase
    .from("pipeline_runs")
    .update({ articles_ingested: rawArticles.length, status: "researching" })
    .eq("id", runId);

  return { rawArticles, sourceErrors, status: "researching" as const };
}
