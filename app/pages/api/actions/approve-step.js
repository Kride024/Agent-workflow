const { q } = require("../../../lib/server/db");
const { executeRun, getOrgRole } = require("../../../lib/server/engine");
const { requireActionSecret } = require("../../../lib/server/auth");

// Layer 2 rule: approval is a mid-execution decision, so the role check
// happens HERE in the handler, not as a database permission.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!requireActionSecret(req, res)) return;

  try {
    const { input, session_variables } = req.body;
    const userId = session_variables["x-hasura-user-id"];
    const { step_run_id } = input;

    const { rows } = await q(
      `select sr.*, wr.org_id, wr.id as run_id, wr.workflow_id
       from step_runs sr
       join workflow_runs wr on wr.id = sr.workflow_run_id
       where sr.id = $1`,
      [step_run_id]
    );
    const stepRun = rows[0];
    if (!stepRun) return res.status(404).json({ message: "step run not found" });
    if (stepRun.status !== "paused") {
      return res.status(400).json({ message: `step is not awaiting approval (status=${stepRun.status})` });
    }

    const role = await getOrgRole(userId, stepRun.org_id);
    if (!role || !["owner", "editor"].includes(role)) {
      return res.status(403).json({ message: "must be owner or editor in this org to approve" });
    }

    await q(
      `update step_runs set status = 'succeeded', approved_by = $1, approved_at = now(), finished_at = now() where id = $2`,
      [userId, step_run_id]
    );

    const result = await executeRun({
      runId: stepRun.run_id,
      workflowId: stepRun.workflow_id,
      orgId: stepRun.org_id,
      resumeFromStepId: stepRun.step_id,
    });

    res.json({ step_run_id, status: result.status });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message });
  }
}
