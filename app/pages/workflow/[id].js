import { useState } from "react";
import { useRouter } from "next/router";
import { useQuery, useMutation } from "@apollo/client";
import { useUserId } from "@nhost/nextjs";
import {
  GET_WORKFLOW,
  GET_MY_ORGS,
  ADD_STEP,
  ADD_TRIGGER,
  TRIGGER_WORKFLOW_RUN,
} from "../../graphql/operations";
import RunStatus from "../../components/RunStatus";

const STEP_TYPES = ["llm_call", "http_request", "db_write", "notify", "conditional_branch", "approval_gate"];
const TRIGGER_TYPES = ["manual", "webhook", "scheduled", "db_event"];

export default function WorkflowPage() {
  const router = useRouter();
  const { id } = router.query;
  const userId = useUserId();
  const { data, loading, refetch } = useQuery(GET_WORKFLOW, { variables: { id }, skip: !id });
  const { data: orgData } = useQuery(GET_MY_ORGS);

  const [addStep] = useMutation(ADD_STEP);
  const [addTrigger] = useMutation(ADD_TRIGGER);
  const [triggerRun, { loading: running }] = useMutation(TRIGGER_WORKFLOW_RUN);

  const [activeRunId, setActiveRunId] = useState(null);
  const [stepName, setStepName] = useState("");
  const [stepType, setStepType] = useState("llm_call");
  const [stepConfig, setStepConfig] = useState("{}");
  const [triggerType, setTriggerType] = useState("webhook");
  const [triggerConfig, setTriggerConfig] = useState("{}");

  const workflow = data?.workflows_by_pk;
  const org = orgData?.organizations.find((o) => o.id === workflow?.org_id);
  const myRole = org?.org_members.find((m) => m.user_id === userId)?.role;

  if (loading || !workflow) return <p style={{ padding: 40 }}>Loading…</p>;

  async function handleAddStep(e) {
    e.preventDefault();
    let config;
    try { config = JSON.parse(stepConfig); } catch { alert("config must be valid JSON"); return; }
    await addStep({
      variables: {
        workflow_id: id,
        step_order: workflow.workflow_steps.length + 1,
        type: stepType,
        name: stepName || stepType,
        config,
      },
    });
    setStepName("");
    setStepConfig("{}");
    refetch();
  }

  async function handleAddTrigger(e) {
    e.preventDefault();
    let config;
    try { config = JSON.parse(triggerConfig); } catch { alert("config must be valid JSON"); return; }
    const webhook_secret = triggerType === "webhook" ? crypto.randomUUID() : null;
    await addTrigger({ variables: { workflow_id: id, type: triggerType, config, webhook_secret } });
    refetch();
  }

  async function handleRun() {
    const { data } = await triggerRun({ variables: { workflow_id: id } });
    setActiveRunId(data.triggerWorkflowRun.workflow_run_id);
  }

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: "0 16px" }}>
      <h1>{workflow.name}</h1>
      <p style={{ opacity: 0.7 }}>{workflow.description}</p>

      {myRole !== "viewer" && (
        <button className="btn-primary" disabled={running} onClick={handleRun}>
          {running ? "Starting…" : "▶ Run Workflow"}
        </button>
      )}

      <h2>Steps</h2>
      {workflow.workflow_steps.map((s) => (
        <div key={s.id} className="card">
          <strong>{s.step_order}. {s.name}</strong> <span style={{ opacity: 0.6 }}>({s.type})</span>
          <pre style={{ fontSize: 12, opacity: 0.7 }}>{JSON.stringify(s.config, null, 2)}</pre>
        </div>
      ))}
      {myRole !== "viewer" && (
        <form onSubmit={handleAddStep} className="card">
          <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
            <input placeholder="step name" value={stepName} onChange={(e) => setStepName(e.target.value)} />
            <select value={stepType} onChange={(e) => setStepType(e.target.value)}>
              {STEP_TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
            </select>
          </div>
          <textarea
            placeholder='config JSON, e.g. {"prompt":"Summarize: {{input}}"}'
            value={stepConfig}
            onChange={(e) => setStepConfig(e.target.value)}
            style={{ width: "100%", height: 60 }}
          />
          <div>
            <button className="btn-primary" type="submit">Add Step</button>
            {(stepType === "db_write" || stepType === "notify") && myRole !== "owner" && (
              <p style={{ color: "#ff7a7a", fontSize: 13 }}>Only an org owner can add {stepType} steps — this insert will be rejected by Hasura permissions.</p>
            )}
          </div>
        </form>
      )}

      <h2>Triggers</h2>
      {workflow.workflow_triggers.map((t) => (
        <div key={t.id} className="card">
          <strong>{t.type}</strong> {t.is_enabled ? "" : "(disabled)"}
          <pre style={{ fontSize: 12, opacity: 0.7 }}>{JSON.stringify(t.config, null, 2)}</pre>
        </div>
      ))}
      {myRole !== "viewer" && (
        <form onSubmit={handleAddTrigger} className="card">
          <select value={triggerType} onChange={(e) => setTriggerType(e.target.value)}>
            {TRIGGER_TYPES.filter((t) => t !== "manual").map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <textarea
            placeholder='config JSON, e.g. {"cron":"*/15 * * * *"}'
            value={triggerConfig}
            onChange={(e) => setTriggerConfig(e.target.value)}
            style={{ width: "100%", height: 40 }}
          />
          <button className="btn-primary" type="submit">Add Trigger</button>
          {triggerType === "webhook" && myRole !== "owner" && (
            <p style={{ color: "#ff7a7a", fontSize: 13 }}>Only an org owner can add webhook triggers.</p>
          )}
        </form>
      )}

      <h2>Recent runs</h2>
      {workflow.workflow_runs.map((r) => (
        <div key={r.id} className="card" style={{ cursor: "pointer" }} onClick={() => setActiveRunId(r.id)}>
          <span className={`badge status-${r.status}`}>{r.status}</span> via {r.trigger_type} · {new Date(r.started_at).toLocaleString()}
        </div>
      ))}

      {activeRunId && <RunStatus runId={activeRunId} myRole={myRole} />}
    </div>
  );
}
