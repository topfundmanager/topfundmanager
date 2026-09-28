-- Dashboard access managed from the forms dashboard. Emails in the FORMS_ADMIN_EMAILS
-- environment variable remain owners and are not stored here.
create table if not exists public.forms_admin_users (
  id uuid primary key default gen_random_uuid(),
  email text not null unique check (email = lower(email)),
  role text not null default 'member' check (role in ('owner', 'member')),
  all_sites boolean not null default false,
  site_ids text[] not null default '{}',
  created_by text,
  updated_by text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

alter table public.forms_admin_users enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'forms_admin_users'
      and policyname = 'service role manages forms admin users'
  ) then
    create policy "service role manages forms admin users"
      on public.forms_admin_users
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;
