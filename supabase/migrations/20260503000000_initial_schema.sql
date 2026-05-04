-- Migration: initial schema
-- Tables: user_profiles, jira_tokens, generation_sessions, generated_stories
-- All tables have RLS enabled. See data-model.md for full specification.

-- ── Enums ─────────────────────────────────────────────────────────────────────

create type session_type_enum as enum (
  'requirements',
  'sprint',
  'meeting',
  'ac_enrichment'
);

create type session_status_enum as enum (
  'generating',
  'ready',
  'error',
  'in_review',
  'approved',
  'pushed'
);

create type story_status_enum as enum (
  'pending',
  'approved',
  'rejected'
);

-- ── user_profiles ──────────────────────────────────────────────────────────────

create table user_profiles (
  id                         uuid        not null primary key references auth.users (id) on delete cascade,
  jira_account_id            text        not null,
  jira_display_name          text,
  default_jira_project_key   text,
  default_jira_project_name  text,
  created_at                 timestamptz not null default now(),
  updated_at                 timestamptz not null default now(),
  constraint user_profiles_jira_account_id_not_empty check (jira_account_id <> '')
);

alter table user_profiles enable row level security;

create policy "Users can view their own profile"
  on user_profiles for select
  using (auth.uid() = id);

create policy "Users can update their own profile"
  on user_profiles for update
  using (auth.uid() = id);

create policy "Users can insert their own profile"
  on user_profiles for insert
  with check (auth.uid() = id);

-- ── jira_tokens ────────────────────────────────────────────────────────────────

create table jira_tokens (
  id                       uuid        not null primary key references auth.users (id) on delete cascade,
  encrypted_access_token   text        not null,
  encrypted_refresh_token  text,
  token_expires_at         timestamptz not null,
  scopes                   text[]      not null default '{}',
  jira_cloud_id            text        not null,
  jira_base_url            text        not null,
  created_at               timestamptz not null default now(),
  updated_at               timestamptz not null default now(),
  constraint jira_tokens_access_token_not_empty check (encrypted_access_token <> ''),
  constraint jira_tokens_cloud_id_not_empty check (jira_cloud_id <> '')
);

alter table jira_tokens enable row level security;

-- Only service role can access tokens (no RLS policies for anon/authenticated).
-- Server-side code uses the service-role client to read/write this table.

-- ── generation_sessions ────────────────────────────────────────────────────────

create table generation_sessions (
  id                        uuid               not null primary key default gen_random_uuid(),
  user_id                   uuid               not null references auth.users (id) on delete cascade,
  session_type              session_type_enum  not null,
  status                    session_status_enum not null default 'generating',
  source_input_text         text,
  source_input_audio_path   text,
  source_input_transcription text,
  input_language            text,
  jira_project_key          text,
  jira_epic_id              text,
  jira_sprint_id            text,
  n8n_execution_id          text,
  error_message             text,
  created_at                timestamptz        not null default now(),
  updated_at                timestamptz        not null default now(),
  -- At least one of source_input_text or source_input_audio_path must be present
  constraint generation_sessions_requires_input check (
    source_input_text is not null or source_input_audio_path is not null
  )
);

create index generation_sessions_user_id_idx on generation_sessions (user_id);
create index generation_sessions_status_idx on generation_sessions (status);
create index generation_sessions_created_at_idx on generation_sessions (created_at desc);

alter table generation_sessions enable row level security;

create policy "Users can view their own sessions"
  on generation_sessions for select
  using (auth.uid() = user_id);

create policy "Users can insert their own sessions"
  on generation_sessions for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own sessions"
  on generation_sessions for update
  using (auth.uid() = user_id);

-- Deletes not permitted (history must be preserved).

-- ── generated_stories ──────────────────────────────────────────────────────────

create table generated_stories (
  id                               uuid              not null primary key default gen_random_uuid(),
  session_id                       uuid              not null references generation_sessions (id) on delete cascade,
  user_id                          uuid              not null references auth.users (id) on delete cascade,
  -- Editable fields (user may change these during review)
  title                            text              not null,
  user_story_statement             text              not null,
  acceptance_criteria              jsonb             not null default '[]',
  priority                         text,
  labels                           text[]            not null default '{}',
  story_points                     integer,
  blocked_by_issue_keys            text[]            not null default '{}',
  blocks_issue_keys                text[]            not null default '{}',
  -- Immutable originals (set on creation, never updated)
  generated_title                  text              not null,
  generated_user_story_statement   text              not null,
  generated_acceptance_criteria    jsonb             not null default '[]',
  -- Status and Jira reference
  status                           story_status_enum not null default 'pending',
  jira_issue_key                   text,
  jira_issue_url                   text,
  sort_order                       integer           not null default 0,
  created_at                       timestamptz       not null default now(),
  updated_at                       timestamptz       not null default now()
);

create index generated_stories_session_id_idx on generated_stories (session_id);
create index generated_stories_user_id_idx on generated_stories (user_id);
create index generated_stories_status_idx on generated_stories (status);
create index generated_stories_sort_order_idx on generated_stories (session_id, sort_order);

alter table generated_stories enable row level security;

create policy "Users can view their own stories"
  on generated_stories for select
  using (auth.uid() = user_id);

create policy "Users can insert their own stories"
  on generated_stories for insert
  with check (auth.uid() = user_id);

create policy "Users can update their own stories"
  on generated_stories for update
  using (auth.uid() = user_id);

-- ── updated_at triggers ────────────────────────────────────────────────────────

create or replace function update_updated_at_column()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger user_profiles_updated_at
  before update on user_profiles
  for each row execute function update_updated_at_column();

create trigger jira_tokens_updated_at
  before update on jira_tokens
  for each row execute function update_updated_at_column();

create trigger generation_sessions_updated_at
  before update on generation_sessions
  for each row execute function update_updated_at_column();

create trigger generated_stories_updated_at
  before update on generated_stories
  for each row execute function update_updated_at_column();

-- ── audio-uploads storage bucket ──────────────────────────────────────────────
-- Private bucket; objects accessible only via service-role signed URLs.
-- Path convention: {user_id}/{session_id}/recording.webm
-- Objects are deleted server-side after transcription succeeds.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'audio-uploads',
  'audio-uploads',
  false,
  15728640, -- 15 MB
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/mpeg']
)
on conflict (id) do nothing;

create policy "Users can upload their own audio"
  on storage.objects for insert
  with check (
    bucket_id = 'audio-uploads'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can read their own audio"
  on storage.objects for select
  using (
    bucket_id = 'audio-uploads'
    and auth.uid()::text = (storage.foldername(name))[1]
  );

create policy "Users can delete their own audio"
  on storage.objects for delete
  using (
    bucket_id = 'audio-uploads'
    and auth.uid()::text = (storage.foldername(name))[1]
  );
