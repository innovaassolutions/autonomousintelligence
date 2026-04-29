-- ============================================================
-- Autonomous Intelligence Framework — Supabase Schema
-- Run this entire file in the Supabase SQL Editor
-- ============================================================

-- 1. Enable pgvector extension
create extension if not exists vector;


-- 2. newsletter_instances
create table newsletter_instances (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz default now(),
  updated_at        timestamptz default now(),

  name              text not null,
  slug              text not null unique,
  vertical          text not null,
  description       text,
  target_audience   text,

  cron_schedule     text not null,
  timezone          text not null default 'Asia/Singapore',
  next_run_at       timestamptz,
  is_active         boolean not null default true,

  sources           jsonb not null default '[]',
  voice_prompt      text not null,
  newsletter_name   text not null,
  section_structure jsonb not null default '[]',

  topic_weights     jsonb not null default '{}',
  min_score         int not null default 40,
  min_articles      int not null default 6,
  max_rewrite_loops int not null default 2,

  beehiiv_api_key   text,
  beehiiv_pub_id    text,
  send_hour         int not null default 7,
  subject_template  text,

  require_approval  boolean not null default true,
  approver_email    text,

  linked_product    text
);


-- 3. pipeline_runs (edition_id FK added later)
create table pipeline_runs (
  id                    uuid primary key default gen_random_uuid(),
  created_at            timestamptz default now(),
  updated_at            timestamptz default now(),

  instance_id           uuid not null references newsletter_instances(id) on delete cascade,

  status                text not null default 'started',
  current_stage         text not null default 'research',
  stage_log             jsonb not null default '[]',

  articles_ingested     int default 0,
  articles_scored       int default 0,
  articles_selected     int default 0,
  rewrite_loops         int default 0,

  abort_reason          text,
  trigger_run_id        text,
  langgraph_thread_id   text,

  edition_id            uuid
);


-- 4. articles
create table articles (
  id                  uuid primary key default gen_random_uuid(),
  created_at          timestamptz default now(),

  instance_id         uuid not null references newsletter_instances(id) on delete cascade,
  run_id              uuid not null references pipeline_runs(id) on delete cascade,

  source_label        text not null,
  source_type         text not null,
  url                 text not null,
  url_hash            text not null,

  title               text,
  raw_markdown        text,
  published_at        timestamptz,

  embedding           vector(1536),
  is_duplicate        boolean not null default false,
  duplicate_of        uuid references articles(id),

  status              text not null default 'raw',
  relevance_score     int,
  topic_category      text,
  recommended_section text
);

create index articles_instance_run on articles(instance_id, run_id);
create index articles_url_hash on articles(url_hash);
create index articles_embedding on articles using ivfflat (embedding vector_cosine_ops) with (lists = 100);


-- 5. newsletter_editions
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

  rewrite_count     int not null default 0,
  editorial_notes   jsonb default '[]',

  approval_status   text not null default 'pending',
  approved_by       text,
  approved_at       timestamptz,
  rejection_note    text,

  beehiiv_post_id   text,
  scheduled_send_at timestamptz,
  sent_at           timestamptz,
  delivery_status   text default 'draft'
);


-- 6. Add FK from pipeline_runs to newsletter_editions (now that editions table exists)
alter table pipeline_runs
  add constraint pipeline_runs_edition_id_fkey
  foreign key (edition_id) references newsletter_editions(id);


-- 7. edition_feedback
create table edition_feedback (
  id            uuid primary key default gen_random_uuid(),
  created_at    timestamptz default now(),

  edition_id    uuid not null references newsletter_editions(id) on delete cascade,
  instance_id   uuid not null references newsletter_instances(id) on delete cascade,

  open_rate     numeric(5,2),
  click_rate    numeric(5,2),
  total_opens   int,
  total_clicks  int,
  unsubscribes  int,
  link_clicks   jsonb default '[]',
  topic_performance jsonb default '{}'
);


-- 8. source_health
create table source_health (
  id                   uuid primary key default gen_random_uuid(),
  updated_at           timestamptz default now(),

  instance_id          uuid not null references newsletter_instances(id) on delete cascade,
  source_label         text not null,
  source_url           text,

  last_success_at      timestamptz,
  last_failure_at      timestamptz,
  consecutive_failures int not null default 0,
  is_flagged           boolean not null default false,

  unique(instance_id, source_label)
);


-- 9. match_articles RPC (used by deduplication agent)
create or replace function match_articles(
  query_embedding  vector(1536),
  p_instance_id    uuid,
  match_threshold  float,
  match_count      int,
  exclude_run_id   uuid
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
