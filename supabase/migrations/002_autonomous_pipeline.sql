-- Migration 002: Autonomous pipeline — remove manual config columns
-- Run this in the Supabase SQL Editor against your live database.

-- Drop manual source/scoring configuration columns
alter table newsletter_instances drop column if exists sources;
alter table newsletter_instances drop column if exists section_structure;
alter table newsletter_instances drop column if exists topic_weights;
alter table newsletter_instances drop column if exists min_score;
alter table newsletter_instances drop column if exists min_articles;

-- Add editorial_focus (optional high-level guidance for the curation agent)
alter table newsletter_instances add column if not exists editorial_focus text;
