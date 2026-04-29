# Autonomous Intelligence Framework — Build Plan (Revised)

**Innovaas Solutions Pte. Ltd.**  
Stack: Next.js · TypeScript · Supabase · Vercel · Railway · Trigger.dev · LangGraph

---

## Overview

A config-driven autonomous pipeline using a **LangGraph multi-agent architecture**. Each pipeline run is a LangGraph StateGraph with specialized agents for research, deduplication, scoring, writing, editorial review, assembly, and delivery. Trigger.dev handles cron scheduling. All graph state is persisted to Supabase via the LangGraph Postgres checkpointer — enabling human-in-the-loop approval pauses and cycle-based editorial review loops.

### Deployment split

| Layer | Platform | What runs here |
|---|---|---|
| Frontend / admin UI | Vercel | Next.js app — instance config, approval UI, analytics dashboard |
| Pipeline workers | Railway | Trigger.dev worker + LangGraph agents |
| Database / state / vectors | Supabase | PostgreSQL + pgvector — app data + LangGraph checkpoints |

---

## Architecture

```
Trigger.dev Cron (every 15 min)
        ↓
  Check instances due to run (croner)
        ↓
  For each due instance:
  Create pipeline_run record
        ↓
  LangGraph StateGraph
  ┌─────────────────────────────────────────────┐
  │                                             │
  │  ResearchAgent → DeduplicationAgent         │
  │                       ↓                    │
  │               ScoringAgent                 │
  │                   ↓   ↓                    │
  │              [abort]  WritingAgent          │
  │                           ↓                │
  │                   EditorialAgent            │
  │                   ↓         ↓              │
  │            [approve]    [rewrite loop]      │
  │                ↓                           │
  │         AssemblyAgent                      │
  │                ↓                           │
  │    [interrupt: human approval]             │
  │                ↓                           │
  │         DeliveryAgent                      │
  └─────────────────────────────────────────────┘
```

---

## LangGraph Pipeline State

The shared state object that flows through all agents:

```typescript
// apps/worker/src/pipeline/state.ts
import { Annotation } from "@langchain/langgraph";

export const PipelineState = Annotation.Root({
  // Identity
  instanceId: Annotation<string>(),
  runId: Annotation<string>(),

  // Instance config (loaded once, available to all agents)
  instance: Annotation<NewsletterInstance>(),

  // Article pipeline
  rawArticles: Annotation<RawArticle[]>({
    reducer: (existing, incoming) => [...existing, ...incoming],
    default: () => [],
  }),
  deduplicatedArticles: Annotation<Article[]>({
    default: () => [],
  }),
  scoredArticles: Annotation<ScoredArticle[]>({
    default: () => [],
  }),

  // Content
  sections: Annotation<Section[]>({
    default: () => [],
  }),
  editorialFeedback: Annotation<string | null>({
    default: () => null,
  }),
  rewriteCount: Annotation<number>({
    default: () => 0,
  }),

  // Edition
  subjectLine: Annotation<string | null>({ default: () => null }),
  previewText: Annotation<string | null>({ default: () => null }),
  htmlContent: Annotation<string | null>({ default: () => null }),

  // Pipeline control
  status: Annotation<PipelineStatus>({ default: () => "started" }),
  abortReason: Annotation<string | null>({ default: () => null }),
  approvalStatus: Annotation<"pending" | "approved" | "rejected">({
    default: () => "pending",
  }),

  // Source health tracking
  sourceErrors: Annotation<SourceError[]>({
    reducer: (existing, incoming) => [...existing, ...incoming],
    default: () => [],
  }),
});

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
```

---

## Supabase Schema

### Enable extensions

```sql
create extension if not exists vector;
```

### Table: `newsletter_instances`

```sql
create table newsletter_instances (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),

  -- Identity
  name              text not null,
  slug              text not null unique,
  vertical          text not null,
  description       text,
  target_audience   text,

  -- Schedule
  cron_schedule     text not null,
  timezone          text not null default 'Asia/Singapore',
  next_run_at       timestamptz,
  is_active         boolean not null default true,

  -- Source config
  sources           jsonb not null default '[]',
  -- [{ type: "rss"|"scrape"|"tavily", url?: string, query?: string, label: string }]

  -- Voice and editorial config
  voice_prompt      text not null,
  newsletter_name   text not null,
  section_structure jsonb not null default '[]',

  -- Scoring config
  topic_weights     jsonb not null default '{}',
  min_score         int not null default 40,
  min_articles      int not null default 6,
  max_rewrite_loops int not null default 2,

  -- Delivery config
  beehiiv_api_key   text,
  beehiiv_pub_id    text,
  send_hour         int not null default 7,
  subject_template  text,

  -- Human-in-the-loop
  require_approval  boolean not null default true,
  approver_email    text,

  -- Linked product
  linked_product    text
);
```

### Table: `pipeline_runs`

```sql
create table pipeline_runs (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),

  instance_id       uuid not null references newsletter_instances(id) on delete cascade,

  status            text not null default 'started',
  current_stage     text not null default 'research',
  stage_log         jsonb not null default '[]',

  articles_ingested int default 0,
  articles_scored   int default 0,
  articles_selected int default 0,
  rewrite_loops     int default 0,

  abort_reason      text,
  trigger_run_id    text,

  -- LangGraph thread ID for checkpointer resume
  langgraph_thread_id text,

  -- Edition created at assembly stage (nullable — set after assembly)
  edition_id        uuid  -- FK added below after newsletter_editions is created
);
```

### Table: `articles`

```sql
create table articles (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz default now(),

  instance_id       uuid not null references newsletter_instances(id) on delete cascade,
  run_id            uuid not null references pipeline_runs(id) on delete cascade,

  source_label      text not null,
  source_type       text not null,
  url               text not null,
  url_hash          text not null,

  title             text,
  raw_markdown      text,
  published_at      timestamptz,

  -- Embeddings: OpenAI text-embedding-3-small = 1536 dims
  embedding         vector(1536),
  is_duplicate      boolean not null default false,
  duplicate_of      uuid references articles(id),

  status            text not null default 'raw',
  relevance_score   int,
  topic_category    text,
  recommended_section text
);

create index articles_instance_run on articles(instance_id, run_id);
create index articles_url_hash on articles(url_hash);
create index articles_embedding on articles using ivfflat (embedding vector_cosine_ops) with (lists = 100);
```

### Table: `newsletter_editions`

```sql
create table newsletter_editions (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),

  instance_id       uuid not null references newsletter_instances(id) on delete cascade,
  run_id            uuid not null references pipeline_runs(id),

  subject_line      text,
  preview_text      text,
  sections          jsonb not null default '[]',
  html_content      text,

  -- Editorial
  rewrite_count     int not null default 0,
  editorial_notes   jsonb default '[]',

  -- Approval
  approval_status   text not null default 'pending',
  approved_by       text,
  approved_at       timestamptz,
  rejection_note    text,

  -- Beehiiv delivery
  beehiiv_post_id   text,
  scheduled_send_at timestamptz,
  sent_at           timestamptz,
  delivery_status   text default 'draft'
);

-- Add FK from pipeline_runs to newsletter_editions (after editions table exists)
alter table pipeline_runs
  add constraint pipeline_runs_edition_id_fkey
  foreign key (edition_id) references newsletter_editions(id);
```

### Table: `edition_feedback`

```sql
create table edition_feedback (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz default now(),

  edition_id        uuid not null references newsletter_editions(id) on delete cascade,
  instance_id       uuid not null references newsletter_instances(id) on delete cascade,

  open_rate         numeric(5,2),
  click_rate        numeric(5,2),
  total_opens       int,
  total_clicks      int,
  unsubscribes      int,
  link_clicks       jsonb default '[]',
  topic_performance jsonb default '{}'
);
```

### Table: `source_health`

```sql
create table source_health (
  id                uuid primary key default gen_random_uuid(),
  updated_at        timestamptz default now(),

  instance_id       uuid not null references newsletter_instances(id) on delete cascade,
  source_label      text not null,
  source_url        text,

  last_success_at   timestamptz,
  last_failure_at   timestamptz,
  consecutive_failures int not null default 0,
  is_flagged        boolean not null default false,

  unique(instance_id, source_label)
);
```

### RPC: `match_articles`

```sql
create or replace function match_articles(
  query_embedding vector(1536),
  p_instance_id uuid,
  match_threshold float,
  match_count int,
  exclude_run_id uuid
)
returns table (id uuid, similarity float)
language sql stable
as $$
  select id, 1 - (embedding <=> query_embedding) as similarity
  from articles
  where instance_id = p_instance_id
    and run_id != exclude_run_id
    and is_duplicate = false
    and embedding is not null
    and 1 - (embedding <=> query_embedding) > match_threshold
  order by similarity desc
  limit match_count;
$$;
```

---

## LangGraph Agents

### Agent 1: Research Agent

Fetches articles from all configured sources for the instance.

```typescript
// apps/worker/src/agents/research-agent.ts
import { createClient } from "@supabase/supabase-js";
import FirecrawlApp from "@mendable/firecrawl-js";
import { tavily } from "@tavily/core";
import crypto from "crypto";
import type { PipelineState } from "../pipeline/state";

export async function researchAgent(state: typeof PipelineState.State) {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
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
            title: result.metadata?.title || "",
            url: source.url!,
            markdown: result.markdown || "",
            sourceLabel: source.label,
            sourceType: source.type,
          }];
        }
      }

      if (source.type === "tavily") {
        const result = await tavilyClient.search(source.query!, { maxResults: 8, includeRawContent: true });
        fetched = result.results.map(r => ({
          title: r.title,
          url: r.url,
          markdown: r.rawContent || r.content,
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

      await supabase.from("source_health").upsert({
        instance_id: instanceId,
        source_label: source.label,
        source_url: source.url,
        last_success_at: new Date().toISOString(),
        consecutive_failures: 0,
        is_flagged: false,
      }, { onConflict: "instance_id,source_label" });

    } catch (err) {
      sourceErrors.push({ sourceLabel: source.label, error: String(err) });

      const { data: health } = await supabase
        .from("source_health")
        .select("consecutive_failures")
        .eq("instance_id", instanceId)
        .eq("source_label", source.label)
        .maybeSingle();

      await supabase.from("source_health").upsert({
        instance_id: instanceId,
        source_label: source.label,
        last_failure_at: new Date().toISOString(),
        consecutive_failures: (health?.consecutive_failures ?? 0) + 1,
        is_flagged: (health?.consecutive_failures ?? 0) + 1 >= 3,
      }, { onConflict: "instance_id,source_label" });
    }
  }

  await supabase
    .from("pipeline_runs")
    .update({ articles_ingested: rawArticles.length, status: "researching" })
    .eq("id", runId);

  return { rawArticles, sourceErrors, status: "researching" as PipelineStatus };
}
```

---

### Agent 2: Deduplication Agent

Embeds articles using OpenAI text-embedding-3-small and checks pgvector for near-duplicates.

```typescript
// apps/worker/src/agents/deduplication-agent.ts
import OpenAI from "openai";
import { createClient } from "@supabase/supabase-js";
import type { PipelineState } from "../pipeline/state";

export async function deduplicationAgent(state: typeof PipelineState.State) {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

  const { rawArticles, instanceId, runId } = state;
  const deduplicatedArticles = [];

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

  return { deduplicatedArticles, status: "deduplicating" as PipelineStatus };
}
```

---

### Agent 3: Scoring Agent

Claude scores each article for relevance against the vertical's topic weights.

```typescript
// apps/worker/src/agents/scoring-agent.ts
import Anthropic from "@anthropic-ai/sdk";
import { createClient } from "@supabase/supabase-js";
import type { PipelineState } from "../pipeline/state";

export async function scoringAgent(state: typeof PipelineState.State) {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });

  const { deduplicatedArticles, instance, instanceId, runId } = state;
  const scoredArticles = [];

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
        messages: [{
          role: "user",
          content: `Score this article:
Title: ${article.title}
Source: ${article.sourceLabel}
Content: ${article.markdown?.slice(0, 800)}

Return: { "relevance_score": <0-100>, "topic_category": "<category>", "recommended_section": "<section>", "reason": "<one sentence>" }`,
        }],
      });

      const scored = JSON.parse((response.content[0] as { type: "text"; text: string }).text);
      const status = scored.relevance_score >= instance.min_score ? "scored" : "discarded";

      await supabase.from("articles").update({
        relevance_score: scored.relevance_score,
        topic_category: scored.topic_category,
        recommended_section: scored.recommended_section,
        status,
      }).eq("id", article.id);

      if (status === "scored") {
        scoredArticles.push({ ...article, ...scored, status });
      }
    } catch {
      // Skip malformed Claude responses — don't abort the whole run
    }
  }

  await supabase.from("pipeline_runs").update({
    articles_scored: deduplicatedArticles.length,
    articles_selected: scoredArticles.length,
    status: "scoring",
  }).eq("id", runId);

  if (scoredArticles.length < instance.min_articles) {
    const abortReason = `Only ${scoredArticles.length} articles passed scoring (minimum ${instance.min_articles})`;
    await supabase.from("pipeline_runs").update({ status: "aborted", abort_reason: abortReason }).eq("id", runId);
    return { scoredArticles, status: "aborted" as PipelineStatus, abortReason };
  }

  return { scoredArticles, status: "scoring" as PipelineStatus };
}
```

---

### Agent 4: Writing Agent

Claude synthesises each newsletter section. Accepts editorial feedback on rewrites.

```typescript
// apps/worker/src/agents/writing-agent.ts
import Anthropic from "@anthropic-ai/sdk";
import type { PipelineState } from "../pipeline/state";

export async function writingAgent(state: typeof PipelineState.State) {
  const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! });
  const { scoredArticles, instance, editorialFeedback } = state;

  const bySection: Record<string, typeof scoredArticles> = {};
  for (const article of scoredArticles) {
    const section = article.recommended_section || "General";
    if (!bySection[section]) bySection[section] = [];
    bySection[section]!.push(article);
  }

  const sections = [];

  for (const [sectionName, sectionArticles] of Object.entries(bySection)) {
    const articlesText = sectionArticles!
      .slice(0, 4)
      .map((a, i) => `[${i + 1}] ${a.title}\nSource: ${a.sourceLabel}\nURL: ${a.url}\n\n${a.markdown?.slice(0, 1200)}`)
      .join("\n\n---\n\n");

    const feedbackContext = editorialFeedback
      ? `\n\nEditorial feedback from previous draft (address these issues):\n${editorialFeedback}`
      : "";

    const response = await anthropic.messages.create({
      model: "claude-sonnet-4-6",
      max_tokens: 1024,
      system: `${instance.voice_prompt}
You are writing the "${sectionName}" section of ${instance.newsletter_name}.${feedbackContext}
Respond with ONLY valid JSON.`,
      messages: [{
        role: "user",
        content: `Write this newsletter section from the source articles below.

${articlesText}

Return: { "name": "${sectionName}", "headline": "<headline>", "body": "<2-4 paragraphs>", "key_takeaway": "<one sentence>", "sources": [{ "title": "<title>", "url": "<url>" }] }`,
      }],
    });

    try {
      sections.push(JSON.parse((response.content[0] as { type: "text"; text: string }).text));
    } catch {
      // Skip malformed section
    }
  }

  // Generate subject line
  const subjectResponse = await anthropic.messages.create({
    model: "claude-sonnet-4-6",
    max_tokens: 128,
    system: `You write compelling email subject lines for ${instance.newsletter_name}. Respond with ONLY: { "subject": "...", "preview": "..." }`,
    messages: [{
      role: "user",
      content: `Generate a subject line. Top headlines: ${sections.slice(0, 3).map(s => s.headline).join(" | ")}. Template hint: ${instance.subject_template || "none"}`,
    }],
  });

  let subject = "", preview = "";
  try {
    const parsed = JSON.parse((subjectResponse.content[0] as { type: "text"; text: string }).text);
    subject = parsed.subject;
    preview = parsed.preview;
  } catch { /* use empty strings */ }

  return {
    sections,
    subjectLine: subject,
    previewText: preview,
    editorialFeedback: null,
    status: "writing" as PipelineStatus,
  };
}
```

---

### Agent 5: Editorial Agent

Claude reviews the full draft and either approves it or returns targeted feedback for a rewrite loop.

```typescript
// apps/worker/src/agents/editorial-agent.ts
import Anthropic from "@anthropic-ai/sdk";
import type { PipelineState } from "../pipeline/state";

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
Voice: ${instance.voice_prompt}
Review newsletter drafts for quality, consistency, and audience fit.
Respond with ONLY valid JSON.`,
    messages: [{
      role: "user",
      content: `Review this newsletter draft:

${draftSummary}

Return: { "approved": <true|false>, "feedback": "<specific issues to fix, or null if approved>", "quality_score": <0-100> }`,
    }],
  });

  let approved = true;
  let feedback: string | null = null;

  try {
    const review = JSON.parse((response.content[0] as { type: "text"; text: string }).text);
    approved = review.approved;
    feedback = review.feedback;
  } catch {
    approved = true;
  }

  return {
    editorialFeedback: approved ? null : feedback,
    rewriteCount: rewriteCount + (approved ? 0 : 1),
    status: "reviewing" as PipelineStatus,
  };
}
```

---

### Agent 6: Assembly Agent

Renders the structured sections into HTML via React Email and creates the edition record.

```typescript
// apps/worker/src/agents/assembly-agent.ts
import { createClient } from "@supabase/supabase-js";
import { renderNewsletterHTML } from "../emails/newsletter-template";
import type { PipelineState } from "../pipeline/state";

export async function assemblyAgent(state: typeof PipelineState.State) {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  const { sections, subjectLine, previewText, instance, instanceId, runId, rewriteCount } = state;

  const html = await renderNewsletterHTML({
    newsletterName: instance.newsletter_name,
    subjectLine: subjectLine!,
    previewText: previewText!,
    sections,
  });

  const { data: edition } = await supabase
    .from("newsletter_editions")
    .insert({
      instance_id: instanceId,
      run_id: runId,
      subject_line: subjectLine,
      preview_text: previewText,
      sections,
      html_content: html,
      rewrite_count: rewriteCount,
      approval_status: "pending",
      delivery_status: "draft",
    })
    .select("id")
    .single();

  await supabase
    .from("pipeline_runs")
    .update({ edition_id: edition!.id, status: "assembling" })
    .eq("id", runId);

  return { htmlContent: html, status: "assembling" as PipelineStatus };
}
```

---

### Agent 7: Delivery Agent

Posts the edition to Beehiiv and schedules the send at the configured local hour.

```typescript
// apps/worker/src/agents/delivery-agent.ts
import { createClient } from "@supabase/supabase-js";
import { toZonedTime, fromZonedTime } from "date-fns-tz";
import type { PipelineState } from "../pipeline/state";

export async function deliveryAgent(state: typeof PipelineState.State) {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  const { instance, runId, subjectLine, previewText, htmlContent } = state;

  const { data: run } = await supabase
    .from("pipeline_runs")
    .select("edition_id")
    .eq("id", runId)
    .single();

  const beehiivRes = await fetch(
    `https://api.beehiiv.com/v2/publications/${instance.beehiiv_pub_id}/posts`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${instance.beehiiv_api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        subject: subjectLine,
        preview_text: previewText,
        content_html: htmlContent,
        status: "draft",
      }),
    }
  );

  if (!beehiivRes.ok) throw new Error(`Beehiiv API error: ${beehiivRes.status}`);

  const beehiivPost = await beehiivRes.json();

  // Schedule send at configured hour in the instance's timezone
  const now = new Date();
  const zonedNow = toZonedTime(now, instance.timezone);
  zonedNow.setHours(instance.send_hour, 0, 0, 0);
  let sendAt = fromZonedTime(zonedNow, instance.timezone);
  if (sendAt < now) sendAt = new Date(sendAt.getTime() + 86400000);

  await fetch(
    `https://api.beehiiv.com/v2/publications/${instance.beehiiv_pub_id}/posts/${beehiivPost.data.id}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${instance.beehiiv_api_key}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ status: "confirmed", scheduled_at: sendAt.toISOString() }),
    }
  );

  await supabase.from("newsletter_editions").update({
    beehiiv_post_id: beehiivPost.data.id,
    scheduled_send_at: sendAt.toISOString(),
    delivery_status: "scheduled",
  }).eq("id", run!.edition_id);

  await supabase.from("pipeline_runs").update({ status: "sent" }).eq("id", runId);

  return { status: "sent" as PipelineStatus };
}
```

---

## LangGraph Pipeline Graph

Wires all agents together with conditional routing for abort, rewrite loops, and approval gating.

```typescript
// apps/worker/src/pipeline/graph.ts
import { StateGraph, END, START, interrupt } from "@langchain/langgraph";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { PipelineState } from "./state";
import { researchAgent } from "../agents/research-agent";
import { deduplicationAgent } from "../agents/deduplication-agent";
import { scoringAgent } from "../agents/scoring-agent";
import { writingAgent } from "../agents/writing-agent";
import { editorialAgent } from "../agents/editorial-agent";
import { assemblyAgent } from "../agents/assembly-agent";
import { deliveryAgent } from "../agents/delivery-agent";

function shouldAbort(state: typeof PipelineState.State) {
  return state.status === "aborted" ? "abort" : "continue";
}

function shouldRewrite(state: typeof PipelineState.State) {
  const { editorialFeedback, rewriteCount, instance } = state;
  if (editorialFeedback && rewriteCount < (instance.max_rewrite_loops ?? 2)) {
    return "rewrite";
  }
  return "continue";
}

function shouldRequestApproval(state: typeof PipelineState.State) {
  return state.instance.require_approval ? "approval_gate" : "deliver";
}

export function buildPipelineGraph(checkpointer: PostgresSaver) {
  const graph = new StateGraph(PipelineState)
    .addNode("research", researchAgent)
    .addNode("deduplicate", deduplicationAgent)
    .addNode("score", scoringAgent)
    .addNode("write", writingAgent)
    .addNode("editorial", editorialAgent)
    .addNode("assemble", assemblyAgent)
    .addNode("approval_gate", async (state) => {
      // Pauses the graph until resumed from the admin UI approve endpoint
      interrupt({ message: "Awaiting human approval" });
      return { status: "awaiting_approval" as const };
    })
    .addNode("deliver", deliveryAgent)
    .addNode("abort", async (state) => state)

    .addEdge(START, "research")
    .addEdge("research", "deduplicate")
    .addEdge("deduplicate", "score")
    .addConditionalEdges("score", shouldAbort, { abort: "abort", continue: "write" })
    .addEdge("write", "editorial")
    .addConditionalEdges("editorial", shouldRewrite, { rewrite: "write", continue: "assemble" })
    .addConditionalEdges("assemble", shouldRequestApproval, { approval_gate: "approval_gate", deliver: "deliver" })
    .addEdge("approval_gate", "deliver")
    .addEdge("deliver", END)
    .addEdge("abort", END)

    .compile({ checkpointer, interruptBefore: ["approval_gate"] });

  return graph;
}
```

---

## Trigger.dev Cron Scheduler

Fires every 15 minutes, checks which instances are due using croner, and invokes the LangGraph pipeline for each.

```typescript
// apps/worker/src/jobs/schedule-instances.ts
import { schedules } from "@trigger.dev/sdk/v3";
import { Cron } from "croner";
import { createClient } from "@supabase/supabase-js";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { buildPipelineGraph } from "../pipeline/graph";
import { v4 as uuidv4 } from "uuid";

export const scheduleInstances = schedules.task({
  id: "schedule-instances",
  cron: "*/15 * * * *",
  run: async () => {
    const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);

    const { data: instances } = await supabase
      .from("newsletter_instances")
      .select("*")
      .eq("is_active", true);

    const now = new Date();

    for (const instance of instances ?? []) {
      const nextRun = new Date(instance.next_run_at ?? 0);
      if (nextRun > now) continue;

      const runId = uuidv4();
      const threadId = `pipeline-${instance.id}-${runId}`;

      await supabase.from("pipeline_runs").insert({
        id: runId,
        instance_id: instance.id,
        status: "started",
        current_stage: "research",
        langgraph_thread_id: threadId,
      });

      const cron = new Cron(instance.cron_schedule, { timezone: instance.timezone });
      await supabase.from("newsletter_instances").update({
        next_run_at: cron.nextRun()?.toISOString(),
      }).eq("id", instance.id);

      const checkpointer = PostgresSaver.fromConnString(process.env.SUPABASE_CONNECTION_STRING!);
      const graph = buildPipelineGraph(checkpointer);

      graph.invoke(
        { instanceId: instance.id, runId, instance },
        { configurable: { thread_id: threadId } }
      ).catch(console.error);
    }
  },
});
```

---

## Approval Resume (Vercel API Route)

Called from the admin UI. Resumes the paused LangGraph graph via the Postgres checkpointer.

```typescript
// apps/web/app/api/editions/[id]/approve/route.ts
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { PostgresSaver } from "@langchain/langgraph-checkpoint-postgres";
import { buildPipelineGraph } from "../../../../../../worker/src/pipeline/graph";

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  const { decision, approvedBy, rejectionNote } = await req.json();

  const { data: edition } = await supabase
    .from("newsletter_editions")
    .select("id, pipeline_runs(langgraph_thread_id)")
    .eq("id", params.id)
    .single();

  if (!edition) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await supabase.from("newsletter_editions").update({
    approval_status: decision,
    approved_by: approvedBy,
    approved_at: decision === "approved" ? new Date().toISOString() : null,
    rejection_note: rejectionNote ?? null,
  }).eq("id", params.id);

  if (decision === "approved") {
    const checkpointer = PostgresSaver.fromConnString(process.env.SUPABASE_CONNECTION_STRING!);
    const graph = buildPipelineGraph(checkpointer);
    const threadId = (edition as any).pipeline_runs.langgraph_thread_id;

    // Resume the paused graph — continues from after the approval_gate node
    graph.invoke(
      { approvalStatus: "approved" },
      { configurable: { thread_id: threadId } }
    ).catch(console.error);
  }

  return NextResponse.json({ ok: true });
}
```

---

## Beehiiv Webhook Handler

```typescript
// apps/web/app/api/webhooks/beehiiv/route.ts
import { createClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createHmac } from "crypto";

export async function POST(req: NextRequest) {
  const signature = req.headers.get("x-beehiiv-signature");
  const body = await req.text();
  const expected = createHmac("sha256", process.env.BEEHIIV_WEBHOOK_SECRET!)
    .update(body)
    .digest("hex");

  if (signature !== expected) {
    return NextResponse.json({ error: "Invalid signature" }, { status: 401 });
  }

  const supabase = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_SERVICE_KEY!);
  const { event, data } = JSON.parse(body);

  if (!["email.sent", "email.opened", "email.clicked"].includes(event)) {
    return NextResponse.json({ ok: true });
  }

  const { data: edition } = await supabase
    .from("newsletter_editions")
    .select("id, instance_id")
    .eq("beehiiv_post_id", data.post_id)
    .maybeSingle();

  if (!edition) return NextResponse.json({ ok: true });

  await supabase.from("edition_feedback").upsert({
    edition_id: edition.id,
    instance_id: edition.instance_id,
    open_rate: data.open_rate ?? null,
    click_rate: data.click_rate ?? null,
    total_opens: data.total_opens ?? null,
    total_clicks: data.total_clicks ?? null,
    link_clicks: data.link_clicks ?? [],
  }, { onConflict: "edition_id" });

  return NextResponse.json({ ok: true });
}
```

---

## Project Structure

```
autonomousintelligence/
├── apps/
│   ├── web/                              # Next.js → Vercel
│   │   ├── app/
│   │   │   ├── (dashboard)/
│   │   │   │   ├── instances/            # Instance config UI
│   │   │   │   ├── editions/             # Approval UI + history
│   │   │   │   └── analytics/            # Performance dashboard
│   │   │   └── api/
│   │   │       ├── editions/[id]/approve/
│   │   │       └── webhooks/beehiiv/
│   │   └── package.json
│   │
│   └── worker/                           # Trigger.dev → Railway
│       ├── src/
│       │   ├── agents/
│       │   │   ├── research-agent.ts
│       │   │   ├── deduplication-agent.ts
│       │   │   ├── scoring-agent.ts
│       │   │   ├── writing-agent.ts
│       │   │   ├── editorial-agent.ts
│       │   │   ├── assembly-agent.ts
│       │   │   └── delivery-agent.ts
│       │   ├── pipeline/
│       │   │   ├── graph.ts
│       │   │   └── state.ts
│       │   ├── jobs/
│       │   │   └── schedule-instances.ts
│       │   └── emails/
│       │       └── newsletter-template.tsx
│       └── package.json
│
├── pnpm-workspace.yaml
└── package.json
```

---

## Environment Variables

### Vercel (`apps/web/.env.local`)

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_KEY=
SUPABASE_CONNECTION_STRING=          # postgres://... direct connection (LangGraph checkpointer)
BEEHIIV_WEBHOOK_SECRET=
```

### Railway (`apps/worker/.env`)

```env
SUPABASE_URL=
SUPABASE_SERVICE_KEY=
SUPABASE_CONNECTION_STRING=          # postgres://... direct connection (LangGraph checkpointer)
TRIGGER_SECRET_KEY=
ANTHROPIC_API_KEY=
OPENAI_API_KEY=
FIRECRAWL_API_KEY=
TAVILY_API_KEY=
```

---

## Dependencies

### Worker (`apps/worker/package.json`)

```json
{
  "dependencies": {
    "@trigger.dev/sdk": "^3.0.0",
    "@langchain/langgraph": "^0.2.0",
    "@langchain/langgraph-checkpoint-postgres": "^0.0.10",
    "@anthropic-ai/sdk": "^0.24.0",
    "openai": "^4.0.0",
    "@mendable/firecrawl-js": "^1.0.0",
    "@tavily/core": "^0.0.2",
    "@supabase/supabase-js": "^2.43.0",
    "@react-email/render": "^0.0.17",
    "croner": "^8.0.0",
    "date-fns-tz": "^3.0.0",
    "uuid": "^9.0.0"
  }
}
```

### Web (`apps/web/package.json`)

```json
{
  "dependencies": {
    "next": "^14.0.0",
    "@supabase/supabase-js": "^2.43.0",
    "@supabase/ssr": "^0.3.0",
    "@langchain/langgraph": "^0.2.0",
    "@langchain/langgraph-checkpoint-postgres": "^0.0.10",
    "@react-email/components": "^0.0.22",
    "@react-email/render": "^0.0.17"
  }
}
```

---

## Build Order

1. **Supabase** — enable pgvector, run schema migrations, create `match_articles` RPC
2. **Monorepo scaffold** — pnpm workspaces, TypeScript configs, shared types
3. **Pipeline state + graph** — define `PipelineState`, wire `graph.ts` with stub agents, confirm LangGraph checkpointer connects to Supabase
4. **Worker agents** — implement and test each agent in isolation with a single test instance
5. **React Email template** — build and preview with mock section data
6. **Trigger.dev cron** — wire `schedule-instances.ts`, test with one instance
7. **Beehiiv** — validate draft creation and scheduled send against test publication
8. **Web app** — instance config UI, edition approval page (triggers graph resume), webhook receiver
9. **End-to-end test** — full pipeline run with `require_approval = true`, approve in UI, confirm graph resumes and Beehiiv draft is created
10. **First live instance** — manufacturing ops vertical, 4-week observation before second instance

---

## Notes

- Start with `require_approval = true` on all instances for the first 90 days
- LangGraph checkpoint tables are auto-created by `PostgresSaver` on first run — no manual migration needed
- `max_rewrite_loops` on each instance caps the editorial loop — default 2 prevents runaway costs
- `SUPABASE_CONNECTION_STRING` is a **direct Postgres connection string** (`postgres://...`), not the Supabase REST URL — find it in Supabase under **Settings → Database → Connection string → Direct**
- Beehiiv rate limit: 10 req/s — add delays in the research agent if source counts are large
- Use Supabase Vault for `beehiiv_api_key` per instance before go-live — currently stored as plain text in the config table
- The `BEEHIIV_WEBHOOK_SECRET` is set when you create a webhook endpoint in the Beehiiv dashboard under **Settings → Integrations → Webhooks**
