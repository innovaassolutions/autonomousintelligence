-- Migration 001: Beehiiv accounts with Supabase Vault
-- Run this in the Supabase SQL Editor against your live database.

-- 1. Enable Vault (no-op if already enabled)
create extension if not exists supabase_vault;

-- 2. Create beehiiv_accounts table
create table if not exists beehiiv_accounts (
  id                 uuid primary key default gen_random_uuid(),
  created_at         timestamptz default now(),
  name               text not null,
  api_key_secret_id  uuid not null
);

alter table beehiiv_accounts enable row level security;

-- 3. Add beehiiv_account_id FK to newsletter_instances
alter table newsletter_instances
  add column if not exists beehiiv_account_id uuid references beehiiv_accounts(id) on delete set null;

-- 4. Drop the old plaintext column if it still exists
alter table newsletter_instances
  drop column if exists beehiiv_api_key;

-- 5. Vault RPC functions

create or replace function create_beehiiv_account(p_name text, p_api_key text)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret_id  uuid;
  v_account_id uuid;
begin
  v_secret_id := vault.create_secret(p_api_key, p_name || '_beehiiv_key');
  insert into beehiiv_accounts (name, api_key_secret_id)
  values (p_name, v_secret_id)
  returning id into v_account_id;
  return v_account_id;
end;
$$;

create or replace function update_beehiiv_account(p_account_id uuid, p_name text, p_api_key text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_old_secret_id uuid;
  v_new_secret_id uuid;
begin
  select api_key_secret_id into v_old_secret_id
  from beehiiv_accounts where id = p_account_id;

  if p_api_key is not null and p_api_key != '' then
    v_new_secret_id := vault.create_secret(p_api_key, p_name || '_beehiiv_key');
    update beehiiv_accounts
    set name = p_name, api_key_secret_id = v_new_secret_id
    where id = p_account_id;
    delete from vault.secrets where id = v_old_secret_id;
  else
    update beehiiv_accounts set name = p_name where id = p_account_id;
  end if;
end;
$$;

create or replace function delete_beehiiv_account(p_account_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret_id uuid;
begin
  select api_key_secret_id into v_secret_id
  from beehiiv_accounts where id = p_account_id;
  delete from beehiiv_accounts where id = p_account_id;
  delete from vault.secrets where id = v_secret_id;
end;
$$;

create or replace function get_beehiiv_api_key(p_account_id uuid)
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  v_secret_id uuid;
  v_api_key   text;
begin
  select api_key_secret_id into v_secret_id
  from beehiiv_accounts where id = p_account_id;

  select decrypted_secret into v_api_key
  from vault.decrypted_secrets where id = v_secret_id;

  return v_api_key;
end;
$$;

revoke execute on function get_beehiiv_api_key(uuid) from anon, authenticated;
revoke execute on function create_beehiiv_account(text, text) from anon, authenticated;
revoke execute on function update_beehiiv_account(uuid, text, text) from anon, authenticated;
revoke execute on function delete_beehiiv_account(uuid) from anon, authenticated;
