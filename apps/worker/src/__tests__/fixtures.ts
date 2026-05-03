import type { NewsletterInstance, RawArticle, Article, CuratedTheme, Section } from "../pipeline/state.js";

export const mockInstance: NewsletterInstance = {
  id: "inst-1",
  name: "Test Newsletter",
  slug: "test-newsletter",
  vertical: "technology",
  description: "A test newsletter",
  target_audience: "developers",
  cron_schedule: "0 8 * * *",
  timezone: "UTC",
  next_run_at: null,
  is_active: true,
  voice_prompt: "Write in a clear, concise tone.",
  newsletter_name: "Tech Weekly",
  editorial_focus: null,
  max_rewrite_loops: 2,
  beehiiv_account_id: "acct-1",
  beehiiv_pub_id: "pub-abc123",
  send_hour: 8,
  subject_template: null,
  require_approval: true,
  approver_email: null,
  linked_product: null,
};

export const mockRawArticle: RawArticle = {
  id: "art-1",
  title: "AI Breakthrough Changes Everything",
  url: "https://example.com/article-1",
  markdown: "OpenAI released a new model that achieves human-level reasoning...",
  sourceLabel: "query_1",
  sourceType: "tavily",
};

export const mockArticle: Article = {
  ...mockRawArticle,
  embedding: Array.from({ length: 1536 }, () => 0.01),
};

export const mockCuratedTheme: CuratedTheme = {
  id: "theme-1",
  title: "AI Reasoning Milestone",
  angle: "This changes how developers build AI-powered apps.",
  section_name: "AI & Machine Learning",
  deep_dive_query: "AI reasoning capabilities 2025 developer implications",
  supporting_articles: [mockArticle],
};

export const mockSection: Section = {
  name: "AI & Machine Learning",
  headline: "GPT-5 Achieves Human-Level Reasoning in Code",
  body: "OpenAI's latest model marks a turning point...",
  key_takeaway: "Start prototyping with the new API this week.",
  sources: [{ title: "TechCrunch", url: "https://techcrunch.com/ai" }],
};

export const mockBaseState = {
  instanceId: "inst-1",
  runId: "run-1",
  instance: mockInstance,
  rawArticles: [],
  sourceErrors: [],
  deduplicatedArticles: [],
  curatedThemes: [],
  sections: [],
  editorialFeedback: null,
  rewriteCount: 0,
  subjectLine: null,
  previewText: null,
  htmlContent: null,
  status: "started" as const,
  abortReason: null,
  approvalStatus: "pending" as const,
};
