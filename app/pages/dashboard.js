import { useEffect, useState } from "react";
import { useQuery, useMutation } from "@apollo/client";
import { nhost } from "../lib/nhost";
import {
  GET_MY_ORGS,
  GET_ORG_WORKFLOWS,
  CREATE_WORKFLOW,
} from "../graphql/operations";
import QuotaBadge from "../components/QuotaBadge";
import Link from "next/link";

export default function Dashboard() {
  const [userId, setUserId] = useState(null);
  const [orgId, setOrgId] = useState(null);
  const [name, setName] = useState("");

  useEffect(() => {
    const session = nhost.getUserSession();
    setUserId(session?.user?.id || null);
  }, []);

  const { data: orgData, loading: orgsLoading } = useQuery(GET_MY_ORGS);

  const orgs = orgData?.organizations || [];
  const activeOrgId = orgId || orgs[0]?.id;
  const activeOrg = orgs.find((o) => o.id === activeOrgId);

  const myRole = activeOrg?.org_members?.find(
    (m) => m.user_id === userId
  )?.role;

  const { data, loading, refetch } = useQuery(GET_ORG_WORKFLOWS, {
    variables: { org_id: activeOrgId },
    skip: !activeOrgId,
  });

  const [createWorkflow] = useMutation(CREATE_WORKFLOW);

  async function handleCreate(e) {
    e.preventDefault();

    if (!name.trim() || !activeOrgId || !userId) return;

    try {
      await createWorkflow({
        variables: {
          org_id: activeOrgId,
          name,
          created_by: userId,
        },
      });

      setName("");
      await refetch();
    } catch (err) {
      console.error("Create workflow failed:", err);
    }
  }

  if (orgsLoading) {
    return <p style={{ padding: 40 }}>Loading...</p>;
  }

  return (
    <div style={{ maxWidth: 900, margin: "40px auto", padding: "0 16px" }}>
      <h1>Dashboard</h1>

      <div
        style={{
          display: "flex",
          gap: 12,
          alignItems: "center",
          marginBottom: 16,
        }}
      >
        <label>Org:</label>

        <select
          value={activeOrgId || ""}
          onChange={(e) => setOrgId(e.target.value)}
        >
          {orgs.map((o) => (
            <option key={o.id} value={o.id}>
              {o.name} (
              {o.org_members.find((m) => m.user_id === userId)?.role}
              )
            </option>
          ))}
        </select>
      </div>

      <QuotaBadge org={activeOrg} />

      {myRole !== "viewer" && (
        <form
          onSubmit={handleCreate}
          className="card"
          style={{ display: "flex", gap: 8 }}
        >
          <input
            placeholder="New workflow name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            style={{ flex: 1 }}
          />

          <button className="btn-primary" type="submit">
            Create Workflow
          </button>
        </form>
      )}

      <h2>Workflows</h2>

      {loading && <p>Loading...</p>}

      {(data?.workflows || []).map((w) => {
        const latest = w.workflow_runs?.[0];

        return (
          <div className="card" key={w.id}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
              }}
            >
              <div>
                <strong>{w.name}</strong>

                <div
                  style={{
                    opacity: 0.6,
                    fontSize: 13,
                  }}
                >
                  {w.workflow_steps?.length || 0} steps ·{" "}
                  {w.workflow_triggers?.map((t) => t.type).join(", ") ||
                    "no triggers"}
                </div>
              </div>

              <div>
                {latest && (
                  <span className={`badge status-${latest.status}`}>
                    {latest.status}
                  </span>
                )}
              </div>
            </div>

            <Link href={`/workflow/${w.id}`}>Open →</Link>
          </div>
        );
      })}
    </div>
  );
}
