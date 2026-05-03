import Anthropic from "@anthropic-ai/sdk";
import { parseJsonResponse } from "../lib/parse-json.js";
import type { PipelineState } from "../pipeline/state.js";

export async function editorialAgent(state: typeof PipelineState.State) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const { sections, instance, rewriteCount } = state;

  const draftSummary = sections
    .map(s => `## ${s.name}: ${s.headline}\n${s.body}\nKey takeaway: ${s.key_takeaway}`)
    .join("\n\n---\n\n");

  const response = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 512,
    system: `You are the editorial director for ${instance.newsletter_name}.
Audience: ${instance.target_audience}
Voice guide: ${instance.voice_prompt}
Review newsletter drafts for quality, consistency, and audience fit.
Respond with ONLY valid JSON.`,
    messages: [
      {
        role: "user",
        content: `Review this newsletter draft (rewrite attempt ${rewriteCount}):

${draftSummary}

Return: { "approved": <true|false>, "feedback": "<specific issues to fix, or null if approved>", "quality_score": <0-100> }`,
      },
    ],
  });

  let approved = true;
  let feedback: string | null = null;

  try {
    const review = parseJsonResponse<{ approved: boolean; feedback: string | null; quality_score: number }>(
      (response.content[0] as { type: "text"; text: string }).text
    );
    approved = review.approved;
    feedback = review.feedback;
  } catch {
    approved = true; // Default to approved on parse error
  }

  return {
    editorialFeedback: approved ? null : feedback,
    // rewriteCount is owned by writing-agent (incremented there on every write pass).
    // Editorial must not double-count or the rewrite budget is exhausted twice as fast.
    status: "reviewing" as const,
  };
}
