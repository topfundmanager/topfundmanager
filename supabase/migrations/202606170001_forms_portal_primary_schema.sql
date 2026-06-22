create extension if not exists pgcrypto;

create table if not exists public.forms_sites (
  id uuid primary key default gen_random_uuid(),
  site_id text not null unique,
  site_name text,
  site_key text not null,
  allowed_origins jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.forms_submissions (
  id uuid primary key default gen_random_uuid(),
  site_id text not null references public.forms_sites (site_id) on update cascade,
  form_id text,
  data jsonb not null default '{}'::jsonb,
  origin text,
  ip text,
  user_agent text,
  page_url text,
  referrer text,
  submitted_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.forms_auth_codes (
  id uuid primary key,
  email text not null,
  code_hash text not null,
  expires_at timestamptz not null,
  consumed_at timestamptz,
  ip text,
  user_agent text,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.forms_sessions (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  ip text,
  user_agent text,
  last_used_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists forms_submissions_submitted_at_idx
  on public.forms_submissions (submitted_at desc);

create index if not exists forms_submissions_site_form_idx
  on public.forms_submissions (site_id, form_id, submitted_at desc);

create index if not exists forms_auth_codes_email_expires_idx
  on public.forms_auth_codes (email, expires_at desc);

create index if not exists forms_sessions_token_expires_idx
  on public.forms_sessions (token_hash, expires_at);

alter table public.forms_sites enable row level security;
alter table public.forms_submissions enable row level security;
alter table public.forms_auth_codes enable row level security;
alter table public.forms_sessions enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'forms_sites'
      and policyname = 'service role manages forms sites'
  ) then
    create policy "service role manages forms sites"
      on public.forms_sites
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'forms_submissions'
      and policyname = 'service role manages forms submissions'
  ) then
    create policy "service role manages forms submissions"
      on public.forms_submissions
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'forms_auth_codes'
      and policyname = 'service role manages forms auth codes'
  ) then
    create policy "service role manages forms auth codes"
      on public.forms_auth_codes
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'forms_sessions'
      and policyname = 'service role manages forms sessions'
  ) then
    create policy "service role manages forms sessions"
      on public.forms_sessions
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

insert into public.forms_sites (site_id, site_name, site_key, allowed_origins)
values (
  'topfundmanager',
  'Top Fund Manager',
  encode(gen_random_bytes(24), 'hex'),
  '["https://topfundmanager.com","https://www.topfundmanager.com"]'::jsonb
)
on conflict (site_id) do nothing;
