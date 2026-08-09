const { q } = require("../../../lib/server/db");
const { executeRun, checkQuota } = require("../../../lib/server/engine");
const { requireActionSecret } = require("../../../lib/server/auth");

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!requireActionSecret(req, res)) return;

  try {
    const { event } = req.body;
    if (event?.op !== "INSERT") return res.json({ ok: true, skipped: true });
    const row = event.data.new;

    const { rows: triggers } = await q(
      `select wt.*, w.org_id from workflow_triggers wt
       join workflows w on w.id = wt.workflow_id
       where wt.type = 'db_event' and wt.is_enabled = true and w.org_id = $1`,
      [row.org_id]
    );

    let started = 0;
    for (const trigger of triggers) {
      try {
        await checkQuota(trigger.org_id);
      } catch {
        continue; // skip orgs over quota, don't fail the whole batch
      }
      const { rows: runRows } = await q(
        `insert into workflow_runs (workflow_id, org_id, trigger_type, status)
         values ($1, $2, 'db_event', 'pending') returning id`,
        [trigger.workflow_id, trigger.org_id]
      );
      await executeRun({ runId: runRows[0].id, workflowId: trigger.workflow_id, orgId: trigger.org_id });
      started++;
    }
    res.json({ ok: true, started });
  } catch (e) {
    console.error(e);
    res.status(500).json({ message: e.message });
  }
}
