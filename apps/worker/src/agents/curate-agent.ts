import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { v4 as uuidv4 } from "uuid";
import { parseJsonResponse } from "../lib/parse-json.js";
import type { PipelineState, CuratedTheme } from "../pipeline/state.js";

export async function curateAgent(state: typeof PipelineState.State) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const { deduplicatedArticles, instance, runId } = state;

  if (deduplicatedArticles.length === 0) {
    const abortReason = "No articles found during exploration";
    await supabase
      .from("pipeline_runs")
      .update({ status: "aborted", abort_reason: abortReason })
      .eq("id", runId);
    return { curatedThemes: [], status: "aborted" as const, abortReason };
  }

  // Present all findings to Claude for editorial judgment
  const articlesSummary = deduplicatedArticles
    .slice(0, 40)
    .map(
      (a, i) =>
        `[${i + 1}] ${a.title}\nURL: ${a.url}\n${a.markdown?.slice(0, 600) ?? ""}`
    )
    .join("\n\n---\n\n");

  const editorialContext = instance.editorial_focus
    ? `\nEditorial focus for this newsletter: ${instance.editorial_focus}`
    : "";

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 2048,
    system: `You are the editorial director of "${instance.newsletter_name}" for ${instance.target_audience}.${editorialContext}

Your job: read this week's research and identify the 3–5 most compelling stories or themes worth writing about.
Think like a senior journalist — not "what was mentioned most" but "what will this audience actually care about and act on".`,
    messages: [
      {
        role: "user",
        content: `Review the research findings below. Identify 3–5 distinct, compelling themes.

For each theme provide:
- title: a punchy working title
- angle: what makes this interesting or important for the audience (1–2 sentences)
- section_name: the newsletter section this belongs in (invent appropriate section names)
- article_indices: which articles [1-based] best support this theme (2–4 articles)
- deep_dive_query: one targeted search query to get more depth on this specific theme

Research findings:
${articlesSummary}

Return ONLY valid JSON:
{
  "themes": [
    {
      "title": "...",
      "angle": "...",
      "section_name": "...",
      "article_indices": [1, 3],
      "deep_dive_query": "..."
    }
  ]
}`,
      },
    ],
  });

  const { themes } = parseJsonResponse<{
    themes: Array<{
      title: string;
      angle: string;
      section_name: string;
      article_indices: number[];
      deep_dive_query: string;
    }>;
  }>((response.content[0] as { type: "text"; text: string }).text);

  if (!themes?.length) {
    const abortReason = "Editorial curation found no compelling themes in research";
    await supabase
      .from("pipeline_runs")
      .update({ status: "aborted", abort_reason: abortReason })
      .eq("id", runId);
    return { curatedThemes: [], status: "aborted" as const, abortReason };
  }

  const curatedThemes: CuratedTheme[] = themes.map((theme) => ({
    id: uuidv4(),
    title: theme.title,
    angle: theme.angle,
    section_name: theme.section_name,
    deep_dive_query: theme.deep_dive_query,
    supporting_articles: (theme.article_indices ?? [])
      .map((idx) => deduplicatedArticles[idx - 1])
      .filter(Boolean) as CuratedTheme["supporting_articles"],
  }));

  await supabase
    .from("pipeline_runs")
    .update({
      articles_scored: deduplicatedArticles.length,
      articles_selected: curatedThemes.reduce((n, t) => n + t.supporting_articles.length, 0),
      status: "scoring",
    })
    .eq("id", runId);

  return { curatedThemes, status: "scoring" as const };
}
