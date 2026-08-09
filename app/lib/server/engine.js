const { q } = require("./db");
const { callLLM } = require("./llm");
const fetch = require("node-fetch");

const MAX_ATTEMPTS = 2; // "at least one retry on failure"

async function getOrgRole(userId, orgId) {
  const { rows } = await q(
    `select role from org_members where user_id = $1 and org_id = $2`,
    [userId, orgId]
  );
  return rows[0]?.role || null;
}

async function checkQuota(orgId) {
  const { rows } = await q(
    `select quota_calls_allowed, quota_calls_used from organizations where id = $1`,
    [orgId]
  );
  const org = rows[0];
  if (!org) throw new Error("org not found");
  if (org.quota_calls_used >= org.quota_calls_allowed) {
    const err = new Error("quota exhausted");
    err.code = "QUOTA_EXCEEDED";
    throw err;
  }
}

async function markStepRun(id, fields) {
  const sets = [];
  const params = [];
  let i = 1;
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = $${i++}`);
    params.push(v);
  }
  params.push(id);
  await q(`update step_runs set ${sets.join(", ")} where id = $${i}`, params);
}

async function markRun(id, fields) {
  const sets = [];
  const params = [];
  let i = 1;
  for (const [k, v] of Object.entries(fields)) {
    sets.push(`${k} = $${i++}`);
    params.push(v);
  }
  params.push(id);
  await q(`update workflow_runs set ${sets.join(", ")} where id = $${i}`, params);
}

/** Executes a single step, returning { output, nextStepId?, paused? } */
async function runStep(step, context) {
  switch (step.type) {
    case "llm_call": {
      const prompt = (step.config?.prompt || "{{input}}").replace(
        "{{input}}",
        JSON.stringify(context.lastOutput ?? {})
      );
      const result = await callLLM({ prompt, model: step.config?.model });
      return { output: result };
    }
    case "http_request": {
      const { url, method = "GET", headers = {}, body } = step.config || {};
      const res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
      const text = await res.text();
      let parsed;
      try { parsed = JSON.parse(text); } catch { parsed = text; }
      if (!res.ok) throw new Error(`http_request failed: ${res.status}`);
      return { output: { status: res.status, body: parsed } };
    }
    case "db_write": {
      const table = step.config?.table || "leads";
      const payload = context.lastOutput ?? {};
      await q(
        `insert into leads (org_id, name, email, raw_payload) values ($1, $2, $3, $4)`,
        [context.orgId, payload.name || "unnamed", payload.email || null, payload]
      );
      return { output: { written_to: table } };
    }
    case "notify": {
      // Implemented as an outbound webhook event (Slack/email provider URL
      // in config.webhook_url). If unset, this is a disclosed no-op.
      const url = step.config?.webhook_url;
      if (url) {
        await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: step.config?.message || "Workflow notification", context }),
        });
        return { output: { notified: true } };
      }
      return { output: { notified: false, reason: "no webhook_url configured (stub)" } };
    }
    case "conditional_branch": {
      const field = step.config?.field || "text";
      const matchValue = step.config?.match || "positive";
      const val = JSON.stringify(context.lastOutput ?? {}).toLowerCase();
      const branchTrue = val.includes(String(matchValue).toLowerCase());
      const nextStepId = branchTrue ? step.on_true_step_id : step.on_false_step_id;
      return { output: { branch: branchTrue }, nextStepId };
    }
    case "approval_gate": {
      return { paused: true };
    }
    default:
      throw new Error(`unknown step type: ${step.type}`);
  }
}

/**
 * Executes a workflow run from the beginning (or resumes it after an
 * approval). Runs steps in `step_order`, honoring conditional_branch
 * jumps, retrying llm_call/http_request once on failure, and stopping
 * (status=paused) the moment it hits an approval_gate.
 */
async function executeRun({ runId, workflowId, orgId, resumeFromStepId }) {
  const { rows: steps } = await q(
    `select * from workflow_steps where workflow_id = $1 order by step_order asc`,
    [workflowId]
  );

  await markRun(runId, { status: "running" });

  let context = { orgId, lastOutput: null };
  let idx = resumeFromStepId
    ? steps.findIndex((s) => s.id === resumeFromStepId) + 1
    : 0;

  while (idx < steps.length) {
    const step = steps[idx];

    const { rows: existingRuns } = await q(
      `select * from step_runs where workflow_run_id = $1 and step_id = $2`,
      [runId, step.id]
    );
    let stepRun = existingRuns[0];
    if (!stepRun) {
      const { rows } = await q(
        `insert into step_runs (workflow_run_id, step_id, status, input, attempt_count, started_at)
         values ($1, $2, 'running', $3, 0, now()) returning *`,
        [runId, step.id, JSON.stringify(context.lastOutput)]
      );
      stepRun = rows[0];
    } else {
      await markStepRun(stepRun.id, { status: "running", started_at: new Date() });
    }
    await markRun(runId, { current_step_id: step.id });

    let attempt = 0;
    let result, error;
    while (attempt < MAX_ATTEMPTS) {
      attempt++;
      try {
        result = await runStep(step, context);
        error = null;
        break;
      } catch (e) {
        error = e;
      }
    }

    if (error) {
      await markStepRun(stepRun.id, {
        status: "failed",
        error: error.message,
        attempt_count: attempt,
        finished_at: new Date(),
      });
      await markRun(runId, { status: "failed", error: error.message, finished_at: new Date() });
      return { status: "failed" };
    }

    if (result.paused) {
      await markStepRun(stepRun.id, { status: "paused", attempt_count: attempt });
      await markRun(runId, { status: "paused" });
      return { status: "paused", pausedStepRunId: stepRun.id };
    }

    await markStepRun(stepRun.id, {
      status: "succeeded",
      output: JSON.stringify(result.output),
      attempt_count: attempt,
      finished_at: new Date(),
    });
    context.lastOutput = result.output;

    if (result.nextStepId) {
      idx = steps.findIndex((s) => s.id === result.nextStepId);
      if (idx === -1) break; // branch pointed nowhere -> end of run
    } else {
      idx++;
    }
  }

  await markRun(runId, { status: "succeeded", finished_at: new Date() });
  await q(`select increment_org_quota($1, 1)`, [orgId]);
  return { status: "succeeded" };
}

module.exports = { executeRun, getOrgRole, checkQuota, markRun, markStepRun };
