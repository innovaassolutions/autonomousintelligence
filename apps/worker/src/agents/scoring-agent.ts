import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { parseJsonResponse } from "../lib/parse-json.js";
import type { PipelineState, ScoredArticle } from "../pipeline/state.js";

export async function scoringAgent(state: typeof PipelineState.State) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const { deduplicatedArticles, instance, instanceId, runId } = state;
  const scoredArticles: ScoredArticle[] = [];

  for (const article of deduplicatedArticles) {
    try {
      const response = await anthropic.messages.create({
        model: "claude-sonnet-4-6",
        max_tokens: 256,
        system: `You are an editorial scoring assistant for a vertical industry newsletter.
Target audience: ${instance.target_audience}
Topic weights (higher = more important): ${JSON.stringify(instance.topic_weights)}
Available sections: ${JSON.stringify(instance.section_structure)}
Respond with ONLY valid JSON.`,
        messages: [
          {
            role: "user",
            content: `Score this article:
Title: ${article.title}
Source: ${article.sourceLabel}
Content: ${article.markdown?.slice(0, 800)}

Return: { "relevance_score": <0-100>, "topic_category": "<category>", "recommended_section": "<section>", "reason": "<one sentence>" }`,
          },
        ],
      });

      const scored = parseJsonResponse<{
        relevance_score: number;
        topic_category: string;
        recommended_section: string;
        reason: string;
      }>((response.content[0] as { type: "text"; text: string }).text);
      const status = scored.relevance_score >= instance.min_score ? "scored" : "discarded";

      await supabase
        .from("articles")
        .update({
          relevance_score: scored.relevance_score,
          topic_category: scored.topic_category,
          recommended_section: scored.recommended_section,
          status,
        })
        .eq("id", article.id);

      if (status === "scored") {
        scoredArticles.push({ ...article, ...scored, status: "scored" as const });
      }
    } catch {
      // Skip malformed Claude responses — don't abort the run
    }
  }

  await supabase
    .from("pipeline_runs")
    .update({
      articles_scored: deduplicatedArticles.length,
      articles_selected: scoredArticles.length,
      status: "scoring",
    })
    .eq("id", runId);

  if (scoredArticles.length < instance.min_articles) {
    const abortReason = `Only ${scoredArticles.length} articles passed scoring (minimum ${instance.min_articles})`;
    await supabase
      .from("pipeline_runs")
      .update({ status: "aborted", abort_reason: abortReason })
      .eq("id", runId);
    return { scoredArticles, status: "aborted" as const, abortReason };
  }

  return { scoredArticles, status: "scoring" as const };
}
