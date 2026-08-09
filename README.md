# AI Agent Workflow Builder

A mini n8n for chaining AI agent steps, built on **nhost (Postgres + Hasura + Auth)** and a **single Next.js app** that serves both the UI and the workflow engine (as API routes) — deployed as one service on Render.

## Architecture

```
Browser ──GraphQL (query/mutation/subscription)──▶ Hasura GraphQL Engine ──▶ Postgres
   │                                                        │
   │                                Hasura Actions / Event Trigger / Cron Trigger
   │                                                        ▼
   └────────────────────────────────────▶  Next.js app (one Render service)
                                             ├─ pages/*            (UI: dashboard, workflow builder, live run view)
                                             └─ pages/api/*        (the engine, as API routes)
                                                 ├─ actions/trigger-workflow-run
                                                 ├─ actions/approve-step
                                                 ├─ actions/webhook-start   (inbound Webhook trigger)
                                                 ├─ db-event/leads          (DB event trigger)
                                                 └─ scheduled/poll          (Scheduled/cron trigger)
```

Everything client-facing (`pages/*.js`) and everything server-side (`pages/api/**`, `lib/server/**`) ships in **one Next.js app**, so there's exactly one thing to deploy and one URL to submit. `lib/server/engine.js` holds the actual step-execution logic (retries, branching, pause/resume, quota) and is shared by every API route that needs it.

- **Postgres**: `db/migrations/0001_init.sql` — all tables, enums, the `org_usage_stats` view, and the `leads` table used to demo the DB-event trigger.
- **Hasura**: `hasura/metadata/` — tables/relationships/permissions (`tables.yaml`), Actions (`actions.yaml` + `actions.graphql`), and the cron trigger (`cron_triggers.yaml`). Handler URLs use `{{APP_URL}}` — set that env var in Hasura to your one deployed URL.
- **app/**: the whole Next.js app — pages, components, GraphQL operations, nhost client, and the `pages/api/*` engine routes.

## Why API routes instead of a separate Express service?
Next.js API routes run as normal server-side handlers under `next start` on any long-lived Node host (Render, Railway, Fly). Since Render runs the process continuously (not as short-lived serverless functions), a Postgres connection pool (`lib/server/db.js`) stays warm across requests just like a standalone Express app would — so there's no benefit to keeping the engine as a separate service, and consolidating means one deploy, one URL, one set of env vars.

## Local setup

### 1. Database + Hasura (via nhost)
```bash
npm install -g nhost
nhost init
nhost up   # local Postgres + Hasura + Auth
```
```bash
psql "$(nhost dev connection-string)" -f db/migrations/0001_init.sql
cd hasura && hasura metadata apply --envfile ../app/.env
```
> No Hasura CLI? Paste `db/migrations/0001_init.sql` into the Hasura Console SQL tab, track the tables, then recreate the permissions from `hasura/metadata/databases/default/tables/tables.yaml` and the three Actions from `hasura/metadata/actions.yaml` in the Console UI.

### 2. The app (frontend + engine, one process)
```bash
cd app
cp .env.example .env.local   # fill in NEXT_PUBLIC_NHOST_*, DATABASE_URL, ACTION_SECRET
npm install
npm run dev                   # http://localhost:3000
```
In the Hasura Console, set env vars:
- `APP_URL` → `http://host.docker.internal:3000` locally (or your Render URL in prod)
- `ACTION_SECRET` → same value as in `app/.env.local`, so the `x-action-secret` header check matches on every Action/Event/Cron call.

### 3. Seed the demo scenario
Sign up 2–3 users via the running app (Org A owner, Org A editor, Org B owner), grab their `auth.users.id` from the Hasura Console (`auth` schema), drop them into `db/seed_demo.sql`, then run that file against your database.

## Deploying live — everything in one place on Render

1. **nhost**: `nhost login`, push this project as an nhost Cloud project at nhost.io → New Project. This gives you hosted Postgres + Hasura + Auth and a GraphQL endpoint.
2. **Apply schema/metadata** to the cloud project the same way as local setup, against the cloud connection string.
3. **Render**: New → Web Service → connect this GitHub repo → root directory `app` → build command `npm install && npm run build` → start command `npm start`. Add env vars: `NEXT_PUBLIC_NHOST_SUBDOMAIN`, `NEXT_PUBLIC_NHOST_REGION`, `DATABASE_URL` (your nhost Postgres connection string), `ACTION_SECRET`, optionally `GROQ_API_KEY`. Deploy → Render gives you one URL, e.g. `https://agent-workflow-builder.onrender.com` — **this is both your app and your API**, and the URL you submit.
4. Back in the Hasura Console → env vars, set `APP_URL` to that Render URL and `ACTION_SECRET` to match, then re-apply metadata (or re-paste the Actions/Event Trigger/Cron config in the Console) so the `{{APP_URL}}` templates resolve.
5. Run `db/seed_demo.sql` (with real user IDs swapped in) against the production database.

Note: Render's free tier spins down on idle, so the first request after inactivity can take ~30s to wake up — fine for a graded demo, just don't be surprised by the first click.

## Environment variables summary

| Where | Var | Purpose |
|---|---|---|
| Hasura | `APP_URL` | The one deployed URL — where Actions/Event Trigger/Cron Trigger call into (`/api/...`) |
| Hasura | `ACTION_SECRET` | Shared secret checked by every `/api/*` route on inbound calls |
| App (server) | `DATABASE_URL` | Direct Postgres connection used by `lib/server/db.js` |
| App (server) | `ACTION_SECRET` | Must match the value set in Hasura |
| App (server) | `GROQ_API_KEY` | Real LLM calls for `llm_call` steps; **omit it and the engine falls back to a disclosed stub** with an artificial 800ms delay |
| App (client) | `NEXT_PUBLIC_NHOST_SUBDOMAIN` / `_REGION` | Points the frontend at your nhost project |

## Note on LLM calls
`lib/server/llm.js` calls Groq's free-tier API if `GROQ_API_KEY` is set. Without a key it returns a stub clearly labeled `STUB RESPONSE` with an artificial delay, so `conditional_branch` still has real branching behavior to react to.

See `WRITEUP.md` for schema reasoning, the two permission layers, and the approval-gate pause/resume design.
