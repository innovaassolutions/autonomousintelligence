import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import type { PipelineState, Article } from "../pipeline/state.js";

export async function deduplicationAgent(state: typeof PipelineState.State) {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const { rawArticles, instanceId, runId } = state;
  const deduplicatedArticles: Article[] = [];

  for (const article of rawArticles) {
    const content = `${article.title}\n\n${article.markdown?.slice(0, 1000)}`;

    const embeddingResponse = await openai.embeddings.create({
      model: "text-embedding-3-small",
      input: content,
    });
    const embedding = embeddingResponse.data[0].embedding;

    const { data: similar } = await supabase.rpc("match_articles", {
      query_embedding: embedding,
      p_instance_id: instanceId,
      match_threshold: 0.92,
      match_count: 1,
      exclude_run_id: runId,
    });

    if (similar && similar.length > 0) {
      await supabase
        .from("articles")
        .update({ is_duplicate: true, duplicate_of: similar[0].id, status: "discarded" })
        .eq("id", article.id);
    } else {
      await supabase
        .from("articles")
        .update({ embedding, status: "raw" })
        .eq("id", article.id);
      deduplicatedArticles.push({ ...article, embedding });
    }
  }

  return { deduplicatedArticles, status: "deduplicating" as const };
}
