create or replace function public.is_organization_member(target_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships membership
    where membership.organization_id = target_org_id
      and membership.user_id = auth.uid()
  );
$$;

create table if not exists public.workspace_runs (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  topic text not null,
  brand text,
  region text,
  goal text,
  web_sources jsonb not null default '[]'::jsonb,
  meeting_turns jsonb not null default '[]'::jsonb,
  attachments jsonb not null default '[]'::jsonb,
  deliverable jsonb,
  memory_log jsonb,
  source_device text,
  created_at timestamptz not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists workspace_runs_org_created_at_idx
  on public.workspace_runs (organization_id, created_at desc);

create index if not exists workspace_runs_org_brand_idx
  on public.workspace_runs (organization_id, brand);

drop trigger if exists set_workspace_runs_updated_at on public.workspace_runs;
create trigger set_workspace_runs_updated_at
before update on public.workspace_runs
for each row
execute function public.set_updated_at();

create table if not exists public.workspace_learning_archives (
  id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  source_run_id text,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  source_type text not null,
  situation text not null,
  recommended_response text not null,
  reasoning text not null,
  signals jsonb not null default '[]'::jsonb,
  tags jsonb not null default '[]'::jsonb,
  status text not null check (status in ('DRAFT', 'CONFIRMED', 'ARCHIVED')),
  last_used_at timestamptz,
  created_at timestamptz not null,
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists workspace_learning_archives_org_status_idx
  on public.workspace_learning_archives (organization_id, status);

create index if not exists workspace_learning_archives_org_created_at_idx
  on public.workspace_learning_archives (organization_id, created_at desc);

drop trigger if exists set_workspace_learning_archives_updated_at on public.workspace_learning_archives;
create trigger set_workspace_learning_archives_updated_at
before update on public.workspace_learning_archives
for each row
execute function public.set_updated_at();

create table if not exists public.workspace_approval_decisions (
  id uuid primary key default extensions.gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  item_type text not null,
  item_id text not null,
  decision text not null,
  label text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now()),
  unique (organization_id, item_type, item_id, decision)
);

create index if not exists workspace_approval_decisions_org_updated_at_idx
  on public.workspace_approval_decisions (organization_id, updated_at desc);

drop trigger if exists set_workspace_approval_decisions_updated_at on public.workspace_approval_decisions;
create trigger set_workspace_approval_decisions_updated_at
before update on public.workspace_approval_decisions
for each row
execute function public.set_updated_at();

create table if not exists public.workspace_run_progress (
  run_id text primary key,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  created_by_user_id uuid references public.profiles(id) on delete set null,
  status text not null check (status in ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED')),
  step_key text not null check (step_key in ('web_research', 'meeting', 'deliverable', 'memory', 'completed')),
  step_label text not null,
  progress_pct integer not null default 0 check (progress_pct >= 0 and progress_pct <= 100),
  message text,
  started_at timestamptz,
  updated_at timestamptz not null default timezone('utc', now()),
  finished_at timestamptz
);

create index if not exists workspace_run_progress_org_updated_at_idx
  on public.workspace_run_progress (organization_id, updated_at desc);

drop trigger if exists set_workspace_run_progress_updated_at on public.workspace_run_progress;
create trigger set_workspace_run_progress_updated_at
before update on public.workspace_run_progress
for each row
execute function public.set_updated_at();

alter table public.workspace_runs enable row level security;
alter table public.workspace_learning_archives enable row level security;
alter table public.workspace_approval_decisions enable row level security;
alter table public.workspace_run_progress enable row level security;

drop policy if exists "workspace_runs_select_member" on public.workspace_runs;
create policy "workspace_runs_select_member"
on public.workspace_runs
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists "workspace_runs_write_member" on public.workspace_runs;
create policy "workspace_runs_write_member"
on public.workspace_runs
for all
to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

drop policy if exists "workspace_learning_archives_select_member" on public.workspace_learning_archives;
create policy "workspace_learning_archives_select_member"
on public.workspace_learning_archives
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists "workspace_learning_archives_write_member" on public.workspace_learning_archives;
create policy "workspace_learning_archives_write_member"
on public.workspace_learning_archives
for all
to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

drop policy if exists "workspace_approval_decisions_select_member" on public.workspace_approval_decisions;
create policy "workspace_approval_decisions_select_member"
on public.workspace_approval_decisions
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists "workspace_approval_decisions_write_member" on public.workspace_approval_decisions;
create policy "workspace_approval_decisions_write_member"
on public.workspace_approval_decisions
for all
to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));

drop policy if exists "workspace_run_progress_select_member" on public.workspace_run_progress;
create policy "workspace_run_progress_select_member"
on public.workspace_run_progress
for select
to authenticated
using (public.is_organization_member(organization_id));

drop policy if exists "workspace_run_progress_write_member" on public.workspace_run_progress;
create policy "workspace_run_progress_write_member"
on public.workspace_run_progress
for all
to authenticated
using (public.is_organization_member(organization_id))
with check (public.is_organization_member(organization_id));
