-- Run this AFTER you've created your nhost auth users (sign up via the
-- frontend first), then replace the <...USER_ID...> placeholders below with
-- the real auth.users.id values from the Hasura console (Data -> auth ->
-- users), then run this file against your database.

-- Two orgs
insert into organizations (id, name, quota_calls_allowed, quota_calls_used)
values
  ('11111111-1111-1111-1111-111111111111', 'Org A', 1000, 0),
  ('22222222-2222-2222-2222-222222222222', 'Org B', 1000, 0);

-- Org A: owner + editor
insert into org_members (org_id, user_id, role) values
  ('11111111-1111-1111-1111-111111111111', '<ORG_A_OWNER_USER_ID>', 'owner'),
  ('11111111-1111-1111-1111-111111111111', '<ORG_A_EDITOR_USER_ID>', 'editor');

-- Org B: its own, unrelated owner
insert into org_members (org_id, user_id, role) values
  ('22222222-2222-2222-2222-222222222222', '<ORG_B_OWNER_USER_ID>', 'owner');

-- Sample workflow in Org A: llm_call -> conditional_branch -> http_request
--                                                          \-> approval_gate
insert into workflows (id, org_id, name, description, created_by) values
  ('33333333-3333-3333-3333-333333333333', '11111111-1111-1111-1111-111111111111',
   'Lead Triage', 'Classify a lead and either auto-notify or ask for approval', '<ORG_A_OWNER_USER_ID>');

insert into workflow_steps (id, workflow_id, step_order, type, name, config) values
  ('44444444-4444-4444-4444-444444444441', '33333333-3333-3333-3333-333333333333', 1, 'llm_call', 'Classify lead',
   '{"prompt": "Classify this lead as positive or negative: {{input}}"}'),
  ('44444444-4444-4444-4444-444444444442', '33333333-3333-3333-3333-333333333333', 2, 'conditional_branch', 'Branch on sentiment',
   '{"field": "text", "match": "positive"}'),
  ('44444444-4444-4444-4444-444444444443', '33333333-3333-3333-3333-333333333333', 3, 'http_request', 'Ping CRM (auto path)',
   '{"url": "https://httpbin.org/post", "method": "POST", "body": {"note": "auto-approved lead"}}'),
  ('44444444-4444-4444-4444-444444444444', '33333333-3333-3333-3333-333333333333', 4, 'approval_gate', 'Manual review (needs-review path)',
   '{}');

update workflow_steps set on_true_step_id = '44444444-4444-4444-4444-444444444443',
                          on_false_step_id = '44444444-4444-4444-4444-444444444444'
where id = '44444444-4444-4444-4444-444444444442';

-- Manual trigger is implicit (the Run button). Add a webhook trigger too:
insert into workflow_triggers (workflow_id, type, config, webhook_secret) values
  ('33333333-3333-3333-3333-333333333333', 'webhook', '{}', 'demo-webhook-secret-change-me');
