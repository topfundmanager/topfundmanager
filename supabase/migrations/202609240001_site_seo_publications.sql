alter table public.site_seo_profiles
  add column if not exists published_revision integer,
  add column if not exists published_snapshot jsonb,
  add column if not exists published_at timestamptz,
  add column if not exists published_by text,
  add column if not exists live_verified_revision integer,
  add column if not exists live_verified_at timestamptz,
  add column if not exists live_verification_error text;

create table if not exists public.site_seo_publication_history (
  site_id text not null references public.site_seo_profiles (site_id) on update cascade on delete cascade,
  revision integer not null,
  snapshot jsonb not null,
  published_at timestamptz not null,
  published_by text not null,
  primary key (site_id, revision)
);

alter table public.site_seo_publication_history enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'site_seo_publication_history'
      and policyname = 'service role manages seo publication history'
  ) then
    create policy "service role manages seo publication history"
      on public.site_seo_publication_history
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;

create or replace function public.publish_site_seo(
  p_site_id text,
  p_revision integer,
  p_actor text
)
returns table (published_revision integer, published_at timestamptz)
language plpgsql
security definer
set search_path = public
as $$
declare
  profile public.site_seo_profiles%rowtype;
  snapshot jsonb;
  published_time timestamptz := now();
begin
  select * into profile
  from public.site_seo_profiles
  where site_id = p_site_id
  for update;

  if not found then
    raise exception 'SEO profile not found';
  end if;
  if profile.management_status <> 'ready' then
    raise exception 'SEO profile must be ready before publishing';
  end if;
  if profile.revision <> p_revision then
    raise exception 'SEO profile changed; reload before publishing';
  end if;
  if nullif(trim(profile.seo_title), '') is null
     or nullif(trim(profile.meta_description), '') is null
     or nullif(trim(profile.canonical_url), '') is null then
    raise exception 'Title, description, and canonical URL are required to publish';
  end if;

  snapshot := to_jsonb(profile) - array[
    'source_snapshot', 'source_checked_at', 'updated_by',
    'published_snapshot', 'published_revision', 'published_at', 'published_by',
    'live_verified_revision', 'live_verified_at', 'live_verification_error'
  ];

  update public.site_seo_profiles
  set published_revision = p_revision,
      published_snapshot = snapshot,
      published_at = published_time,
      published_by = p_actor,
      live_verified_revision = null,
      live_verified_at = null,
      live_verification_error = null
  where site_id = p_site_id;

  insert into public.site_seo_publication_history
    (site_id, revision, snapshot, published_at, published_by)
  values (p_site_id, p_revision, snapshot, published_time, p_actor)
  on conflict (site_id, revision) do update set
    snapshot = excluded.snapshot,
    published_at = excluded.published_at,
    published_by = excluded.published_by;

  return query select p_revision, published_time;
end;
$$;

revoke all on function public.publish_site_seo(text, integer, text) from public, anon, authenticated;
grant execute on function public.publish_site_seo(text, integer, text) to service_role;
