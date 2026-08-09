const { q } = require("../../../lib/server/db");
const { executeRun, checkQuota } = require("../../../lib/server/engine");
const { requireActionSecret } = require("../../../lib/server/auth");

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!requireActionSecret(req, res)) return;

  try {
    const { input } = req.body;
    const { workflow_id, secret } = input;

    const { rows } = await q(
      `select * from workflow_triggers where workflow_id = $1 and type = 'webhook' and is_enabled = true`,
      [workflow_id]
    );
    const trigger = rows.find((t) => t.webhook_secret === secret);
    if (!trigger) return res.status(401).json({ message: "invalid workflow_id/secret" });

    const { rows: wfRows } = await q(`select * from workflows where id = $1`, [workflow_id]);
    const workflow = wfRows[0];

    try {
      await checkQuota(workflow.org_id);
    } catch (e) {
      if (e.code === "QUOTA_EXCEEDED") return res.status(429).json({ message: "org quota exhausted" });
      throw e;
    }

    const { rows: runRows } = await q(
      `insert into workflow_runs (workflow_id, org_id, trigger_type, status)
       values ($1, $2, 'webhook', 'pending') returning id`,
      [workflow_id, workflow.org_id]
    );
    const runId = runRows[0].id;
    const result = await executeRun({ runId, workflowId: workflow_id, orgId: workflow.org_id });
    res.json({ workflow_run_id: runId, status: result.status });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message });
  }
}
