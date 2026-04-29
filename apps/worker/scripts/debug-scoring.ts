import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import { parseJsonResponse } from "../src/lib/parse-json.js";
import "dotenv/config";

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_KEY!
  );
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  // Fetch the most recent raw articles from the last run
  const { data: articles } = await supabase
    .from("articles")
    .select("id, title, source_label, raw_markdown, status, relevance_score")
    .eq("status", "raw")
    .order("created_at", { ascending: false })
    .limit(3);

  if (!articles?.length) {
    console.log("No raw articles found. Check deduplication status.");
    return;
  }

  console.log(`Testing scoring on ${articles.length} articles...\n`);

  for (const article of articles) {
    console.log(`── Article: ${article.title?.slice(0, 60)}`);
    console.log(`   Source:  ${article.source_label}`);

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 256,
      system: `You are an editorial scoring assistant for a vertical industry newsletter.
Target audience: Operations managers and plant directors in discrete manufacturing
Topic weights (higher = more important): {"regulatory":85,"automation":80,"supply chain":75,"workforce":65,"technology":70}
Available sections: ["Regulatory & Compliance","Technology & Automation","Supply Chain","Workforce & Safety"]
Respond with ONLY valid JSON.`,
      messages: [
        {
          role: "user",
          content: `Score this article:
Title: ${article.title}
Source: ${article.source_label}
Content: ${article.raw_markdown?.slice(0, 800)}

Return: { "relevance_score": <0-100>, "topic_category": "<category>", "recommended_section": "<section>", "reason": "<one sentence>" }`,
        },
      ],
    });

    const raw = (response.content[0] as { type: "text"; text: string }).text;
    console.log(`   Raw response: ${raw}`);

    try {
      const parsed = parseJsonResponse<{ relevance_score: number; recommended_section: string }>(raw);
      console.log(`   Score: ${parsed.relevance_score} | Section: ${parsed.recommended_section}`);
    } catch (e) {
      console.log(`   ✗ JSON parse failed: ${e}`);
    }
    console.log();
  }

  process.exit(0);
}

main().catch((err) => {
  console.error("Failed:", err.message);
  process.exit(1);
});
