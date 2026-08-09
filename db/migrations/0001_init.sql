-- =========================================================
-- AI Agent Workflow Builder — core schema
-- =========================================================
create extension if not exists "pgcrypto";

-- ---------- ENUMS ----------
create type org_role as enum ('owner', 'editor', 'viewer');
create type step_type as enum ('llm_call', 'http_request', 'db_write', 'notify', 'conditional_branch', 'approval_gate');
create type trigger_type as enum ('manual', 'webhook', 'scheduled', 'db_event');
create type run_status as enum ('pending', 'running', 'paused', 'succeeded', 'failed', 'cancelled');
create type step_status as enum ('pending', 'running', 'succeeded', 'failed', 'paused', 'skipped');

-- ---------- ORGANIZATIONS ----------
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  quota_calls_allowed int not null default 1000,
  quota_calls_used int not null default 0,
  quota_period_start date not null default date_trunc('month', now())::date,
  created_at timestamptz not null default now()
);

-- ---------- ORG MEMBERS ----------
-- links Hasura's auth user (nhost auth.users.id) to an org with a role
create table org_members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null, -- references auth.users(id) (nhost)
  role org_role not null default 'viewer',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index idx_org_members_user on org_members(user_id);
create index idx_org_members_org on org_members(org_id);

-- ---------- WORKFLOWS ----------
create table workflows (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index idx_workflows_org on workflows(org_id);

-- ---------- WORKFLOW STEPS ----------
create table workflow_steps (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  step_order int not null,
  type step_type not null,
  name text not null,
  config jsonb not null default '{}'::jsonb,
  -- branch targets used by conditional_branch: which step to run next on true/false
  on_true_step_id uuid references workflow_steps(id),
  on_false_step_id uuid references workflow_steps(id),
  created_at timestamptz not null default now(),
  unique (workflow_id, step_order)
);
create index idx_steps_workflow on workflow_steps(workflow_id);

-- ---------- WORKFLOW TRIGGERS ----------
create table workflow_triggers (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  type trigger_type not null,
  config jsonb not null default '{}'::jsonb, -- e.g. {"cron": "*/15 * * * *"} or {"watch_table": "leads"}
  webhook_secret text, -- used to verify inbound webhook calls
  is_enabled boolean not null default true,
  created_at timestamptz not null default now()
);
create index idx_triggers_workflow on workflow_triggers(workflow_id);

-- ---------- WORKFLOW RUNS ----------
create table workflow_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_id uuid not null references workflows(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  trigger_type trigger_type not null,
  status run_status not null default 'pending',
  started_by uuid, -- null for non-manual triggers
  current_step_id uuid references workflow_steps(id),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  error text
);
create index idx_runs_workflow on workflow_runs(workflow_id);
create index idx_runs_org on workflow_runs(org_id);
create index idx_runs_status on workflow_runs(status);

-- ---------- STEP RUNS ----------
create table step_runs (
  id uuid primary key default gen_random_uuid(),
  workflow_run_id uuid not null references workflow_runs(id) on delete cascade,
  step_id uuid not null references workflow_steps(id) on delete cascade,
  status step_status not null default 'pending',
  input jsonb,
  output jsonb,
  error text,
  attempt_count int not null default 0,
  approved_by uuid,
  approved_at timestamptz,
  started_at timestamptz,
  finished_at timestamptz
);
create index idx_step_runs_run on step_runs(workflow_run_id);
create index idx_step_runs_step on step_runs(step_id);

-- =========================================================
-- Aggregation: org-level usage view (this month) + avg run duration
-- =========================================================
create view org_usage_stats as
select
  o.id as org_id,
  o.quota_calls_allowed,
  o.quota_calls_used,
  count(distinct wr.id) filter (where wr.started_at >= date_trunc('month', now())) as runs_this_month,
  avg(extract(epoch from (wr.finished_at - wr.started_at)))
    filter (where wr.finished_at is not null) as avg_run_duration_seconds
from organizations o
left join workflow_runs wr on wr.org_id = o.id
group by o.id, o.quota_calls_allowed, o.quota_calls_used;

-- helper function used by the Action handler to atomically bump quota
create or replace function increment_org_quota(p_org_id uuid, p_amount int default 1)
returns void as $$
  update organizations
  set quota_calls_used = quota_calls_used + p_amount
  where id = p_org_id;
$$ language sql;

-- keep updated_at fresh on workflows
create or replace function set_updated_at() returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger trg_workflows_updated_at
before update on workflows
for each row execute function set_updated_at();

-- =========================================================
-- Example "watched" table for the db_event trigger type
-- (a row inserted here can auto-start a workflow run)
-- =========================================================
create table leads (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  email text,
  raw_payload jsonb,
  created_at timestamptz not null default now()
);
