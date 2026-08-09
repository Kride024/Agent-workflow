const { q } = require("../../../lib/server/db");
const { executeRun, getOrgRole, checkQuota } = require("../../../lib/server/engine");
const { requireActionSecret } = require("../../../lib/server/auth");

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!requireActionSecret(req, res)) return;

  try {
    const { input, session_variables } = req.body;
    const userId = session_variables["x-hasura-user-id"];
    const { workflow_id } = input;

    const { rows: wfRows } = await q(`select * from workflows where id = $1`, [workflow_id]);
    const workflow = wfRows[0];
    if (!workflow) return res.status(404).json({ message: "workflow not found" });

    // 1. verify caller is owner/editor in the workflow's org
    const role = await getOrgRole(userId, workflow.org_id);
    if (!role || !["owner", "editor"].includes(role)) {
      return res.status(403).json({ message: "must be owner or editor in this org" });
    }

    // 2. check quota
    try {
      await checkQuota(workflow.org_id);
    } catch (e) {
      if (e.code === "QUOTA_EXCEEDED") return res.status(429).json({ message: "org quota exhausted" });
      throw e;
    }

    // 3. create the run
    const { rows: runRows } = await q(
      `insert into workflow_runs (workflow_id, org_id, trigger_type, status, started_by)
       values ($1, $2, 'manual', 'pending', $3) returning id`,
      [workflow_id, workflow.org_id, userId]
    );
    const runId = runRows[0].id;

    // 4. execute (response returns once the run finishes or pauses)
    const result = await executeRun({ runId, workflowId: workflow_id, orgId: workflow.org_id });

    res.json({ workflow_run_id: runId, status: result.status });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message });
  }
}
