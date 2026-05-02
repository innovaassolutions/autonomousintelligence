import { Annotation } from "@langchain/langgraph";

// ── Domain types ─────────────────────────────────────────────────────────────

export interface NewsletterInstance {
  id: string;
  name: string;
  slug: string;
  vertical: string;
  description: string | null;
  target_audience: string | null;
  cron_schedule: string;
  timezone: string;
  next_run_at: string | null;
  is_active: boolean;
  sources: Source[];
  voice_prompt: string;
  newsletter_name: string;
  section_structure: string[];
  topic_weights: Record<string, number>;
  min_score: number;
  min_articles: number;
  max_rewrite_loops: number;
  beehiiv_account_id: string | null;
  beehiiv_pub_id: string | null;
  send_hour: number;
  subject_template: string | null;
  require_approval: boolean;
  approver_email: string | null;
  linked_product: string | null;
}

export interface Source {
  type: "rss" | "scrape" | "tavily";
  url?: string;
  query?: string;
  label: string;
}

export interface RawArticle {
  id: string;
  title: string;
  url: string;
  markdown: string;
  sourceLabel: string;
  sourceType: string;
}

export interface Article extends RawArticle {
  embedding?: number[];
}

export interface ScoredArticle extends Article {
  relevance_score: number;
  topic_category: string;
  recommended_section: string;
  reason: string;
  status: "scored";
}

export interface Section {
  name: string;
  headline: string;
  body: string;
  key_takeaway: string;
  sources: Array<{ title: string; url: string }>;
}

export interface SourceError {
  sourceLabel: string;
  error: string;
}

export type PipelineStatus =
  | "started"
  | "researching"
  | "deduplicating"
  | "scoring"
  | "writing"
  | "reviewing"
  | "assembling"
  | "awaiting_approval"
  | "sending"
  | "sent"
  | "aborted"
  | "failed";

// ── LangGraph State ───────────────────────────────────────────────────────────
// LangGraph v1: fields with only a default (last-write-wins) use { value: (_, x) => x, default }
// Fields that accumulate across nodes use a custom reducer

export const PipelineState = Annotation.Root({
  // Identity — required on invocation, no default
  instanceId: Annotation<string>(),
  runId: Annotation<string>(),
  instance: Annotation<NewsletterInstance>(),

  // Accumulating arrays — append new items
  rawArticles: Annotation<RawArticle[]>({
    value: (existing, incoming) => [...existing, ...incoming],
    default: () => [],
  }),
  sourceErrors: Annotation<SourceError[]>({
    value: (existing, incoming) => [...existing, ...incoming],
    default: () => [],
  }),

  // Last-write-wins arrays
  deduplicatedArticles: Annotation<Article[]>({
    value: (_, next) => next,
    default: () => [],
  }),
  scoredArticles: Annotation<ScoredArticle[]>({
    value: (_, next) => next,
    default: () => [],
  }),
  sections: Annotation<Section[]>({
    value: (_, next) => next,
    default: () => [],
  }),

  // Last-write-wins scalars
  editorialFeedback: Annotation<string | null>({
    value: (_, next) => next,
    default: () => null,
  }),
  rewriteCount: Annotation<number>({
    value: (_, next) => next,
    default: () => 0,
  }),
  subjectLine: Annotation<string | null>({
    value: (_, next) => next,
    default: () => null,
  }),
  previewText: Annotation<string | null>({
    value: (_, next) => next,
    default: () => null,
  }),
  htmlContent: Annotation<string | null>({
    value: (_, next) => next,
    default: () => null,
  }),
  status: Annotation<PipelineStatus>({
    value: (_, next) => next,
    default: () => "started",
  }),
  abortReason: Annotation<string | null>({
    value: (_, next) => next,
    default: () => null,
  }),
  approvalStatus: Annotation<"pending" | "approved" | "rejected">({
    value: (_, next) => next,
    default: () => "pending",
  }),
});
