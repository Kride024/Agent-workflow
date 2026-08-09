const cron = require("node-cron");
const { q } = require("../../../lib/server/db");
const { executeRun, checkQuota } = require("../../../lib/server/engine");
const { requireActionSecret } = require("../../../lib/server/auth");

function isDueNow(expr) {
  const parts = expr.split(" ");
  if (parts.length !== 5) return false;
  const now = new Date();
  const matches = (field, value) => field === "*" || field.split(",").includes(String(value));
  return (
    matches(parts[0], now.getMinutes()) &&
    matches(parts[1], now.getHours()) &&
    matches(parts[2], now.getDate()) &&
    matches(parts[3], now.getMonth() + 1) &&
    matches(parts[4], now.getDay())
  );
}

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).end();
  if (!requireActionSecret(req, res)) return;

  try {
    const { rows: triggers } = await q(
      `select wt.*, w.org_id from workflow_triggers wt
       join workflows w on w.id = wt.workflow_id
       where wt.type = 'scheduled' and wt.is_enabled = true`
    );
    let started = 0;
    for (const trigger of triggers) {
      const expr = trigger.config?.cron;
      if (!expr || !cron.validate(expr) || !isDueNow(expr)) continue;
      try {
        await checkQuota(trigger.org_id);
      } catch {
        continue;
      }
      const { rows: runRows } = await q(
        `insert into workflow_runs (workflow_id, org_id, trigger_type, status)
         values ($1, $2, 'scheduled', 'pending') returning id`,
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
