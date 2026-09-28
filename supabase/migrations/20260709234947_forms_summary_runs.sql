create table if not exists public.forms_summary_runs (
  id uuid primary key default gen_random_uuid(),
  summary_key text not null,
  recipient text not null,
  scheduled_day text not null,
  window_start timestamptz not null,
  window_end timestamptz not null,
  submission_count integer not null default 0,
  status text not null default 'sent',
  resend_id text,
  error text,
  metadata jsonb not null default '{}'::jsonb,
  sent_at timestamptz not null default timezone('utc', now()),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists forms_summary_runs_key_sent_idx
  on public.forms_summary_runs (summary_key, sent_at desc);

create index if not exists forms_summary_runs_window_idx
  on public.forms_summary_runs (summary_key, window_end desc);

alter table public.forms_summary_runs enable row level security;

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public'
      and tablename = 'forms_summary_runs'
      and policyname = 'service role manages forms summary runs'
  ) then
    create policy "service role manages forms summary runs"
      on public.forms_summary_runs
      for all
      using (auth.role() = 'service_role')
      with check (auth.role() = 'service_role');
  end if;
end $$;
