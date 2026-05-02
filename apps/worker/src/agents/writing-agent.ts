import Anthropic from "@anthropic-ai/sdk";
import { parseJsonResponse } from "../lib/parse-json.js";
import type { PipelineState, Section } from "../pipeline/state.js";

export async function writingAgent(state: typeof PipelineState.State) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const { curatedThemes, instance, editorialFeedback, rewriteCount } = state;

  const feedbackContext = editorialFeedback
    ? `\n\nEditorial feedback from previous draft (address these issues):\n${editorialFeedback}`
    : "";

  const sections: Section[] = [];

  for (const theme of curatedThemes) {
    const articlesText = theme.supporting_articles
      .slice(0, 4)
      .map(
        (a, i) =>
          `[${i + 1}] ${a.title}\nURL: ${a.url}\n\n${a.markdown?.slice(0, 1200)}`
      )
      .join("\n\n---\n\n");

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: `${instance.voice_prompt}
You are writing the "${theme.section_name}" section of ${instance.newsletter_name}.
Editorial angle: ${theme.angle}${feedbackContext}
Respond with ONLY valid JSON.`,
      messages: [
        {
          role: "user",
          content: `Write this newsletter section. Working title: "${theme.title}"

Source articles:
${articlesText}

Return: { "name": "${theme.section_name}", "headline": "<compelling headline>", "body": "<2-4 paragraphs>", "key_takeaway": "<one actionable sentence>", "sources": [{ "title": "<title>", "url": "<url>" }] }`,
        },
      ],
    });

    try {
      sections.push(
        parseJsonResponse<Section>(
          (response.content[0] as { type: "text"; text: string }).text
        )
      );
    } catch {
      // Skip malformed section — don't abort the run
    }
  }

  // Generate subject line from what was actually written
  const subjectResponse = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 128,
    system: `You write compelling email subject lines for ${instance.newsletter_name}. Respond with ONLY valid JSON: { "subject": "...", "preview": "..." }`,
    messages: [
      {
        role: "user",
        content: `Generate a subject line. Top headlines: ${sections
          .slice(0, 3)
          .map((s) => s.headline)
          .join(" | ")}. Template hint: ${instance.subject_template || "none"}`,
      },
    ],
  });

  let subject = "";
  let preview = "";
  try {
    const parsed = parseJsonResponse<{ subject: string; preview: string }>(
      (subjectResponse.content[0] as { type: "text"; text: string }).text
    );
    subject = parsed.subject;
    preview = parsed.preview;
  } catch { /* use empty strings */ }

  return {
    sections,
    subjectLine: subject,
    previewText: preview,
    editorialFeedback: null,
    rewriteCount: rewriteCount + 1,
    status: "writing" as const,
  };
}
