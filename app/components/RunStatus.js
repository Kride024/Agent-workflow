import { useSubscription, useMutation } from "@apollo/client";
import { STEP_RUNS_SUBSCRIPTION, APPROVE_STEP } from "../graphql/operations";

export default function RunStatus({ runId, myRole }) {
  const { data, loading } = useSubscription(STEP_RUNS_SUBSCRIPTION, {
    variables: { workflow_run_id: runId },
    skip: !runId,
  });
  const [approveStep, { loading: approving }] = useMutation(APPROVE_STEP);

  if (!runId) return null;
  if (loading && !data) return <p>Connecting to live status…</p>;

  const run = data?.workflow_runs_by_pk;
  const steps = data?.step_runs || [];

  return (
    <div className="card">
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <strong>Run status</strong>
        {run && <span className={`badge status-${run.status}`}>{run.status}</span>}
      </div>
      <ol>
        {steps.map((sr) => (
          <li key={sr.id} style={{ margin: "10px 0" }}>
            <span className={`badge status-${sr.status}`}>{sr.status}</span>{" "}
            <strong>{sr.step.name}</strong> <span style={{ opacity: 0.6 }}>({sr.step.type})</span>
            {sr.attempt_count > 1 && <span style={{ opacity: 0.6 }}> · {sr.attempt_count} attempts</span>}
            {sr.error && <div style={{ color: "#ff7a7a" }}>{sr.error}</div>}
            {sr.output && (
              <pre style={{ fontSize: 12, opacity: 0.8, whiteSpace: "pre-wrap" }}>
                {JSON.stringify(JSON.parse(typeof sr.output === "string" ? sr.output : JSON.stringify(sr.output)), null, 2)}
              </pre>
            )}
            {sr.status === "paused" && sr.step.type === "approval_gate" && (
              <div>
                {["owner", "editor"].includes(myRole) ? (
                  <button
                    className="btn-primary"
                    disabled={approving}
                    onClick={() => approveStep({ variables: { step_run_id: sr.id } })}
                  >
                    Approve & Resume
                  </button>
                ) : (
                  <em style={{ opacity: 0.6 }}>Awaiting approval from an owner/editor…</em>
                )}
              </div>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
