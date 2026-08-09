import { gql } from "@apollo/client";

// -- Query: org's workflows with steps, triggers, and latest run status --
export const GET_ORG_WORKFLOWS = gql`
  query GetOrgWorkflows($org_id: uuid!) {
    workflows(where: { org_id: { _eq: $org_id } }, order_by: { created_at: desc }) {
      id
      name
      description
      is_active
      workflow_steps(order_by: { step_order: asc }) {
        id
        step_order
        type
        name
        config
      }
      workflow_triggers {
        id
        type
        config
        is_enabled
      }
      workflow_runs(order_by: { started_at: desc }, limit: 1) {
        id
        status
        started_at
        finished_at
      }
    }
  }
`;

export const GET_WORKFLOW = gql`
  query GetWorkflow($id: uuid!) {
    workflows_by_pk(id: $id) {
      id
      name
      description
      org_id
      workflow_steps(order_by: { step_order: asc }) {
        id
        step_order
        type
        name
        config
      }
      workflow_triggers {
        id
        type
        config
        is_enabled
      }
      workflow_runs(order_by: { started_at: desc }, limit: 5) {
        id
        status
        started_at
        finished_at
        trigger_type
      }
    }
  }
`;

export const GET_MY_ORGS = gql`
  query GetMyOrgs {
    organizations {
      id
      name
      quota_calls_allowed
      quota_calls_used
      org_members {
        user_id
        role
      }
    }
  }
`;

// -- Mutation: create a workflow --
export const CREATE_WORKFLOW = gql`
  mutation CreateWorkflow($org_id: uuid!, $name: String!, $description: String, $created_by: uuid!) {
    insert_workflows_one(object: { org_id: $org_id, name: $name, description: $description, created_by: $created_by }) {
      id
      name
    }
  }
`;

export const ADD_STEP = gql`
  mutation AddStep($workflow_id: uuid!, $step_order: Int!, $type: step_type!, $name: String!, $config: jsonb!) {
    insert_workflow_steps_one(
      object: { workflow_id: $workflow_id, step_order: $step_order, type: $type, name: $name, config: $config }
    ) {
      id
    }
  }
`;

export const ADD_TRIGGER = gql`
  mutation AddTrigger($workflow_id: uuid!, $type: trigger_type!, $config: jsonb!, $webhook_secret: String) {
    insert_workflow_triggers_one(
      object: { workflow_id: $workflow_id, type: $type, config: $config, webhook_secret: $webhook_secret }
    ) {
      id
    }
  }
`;

// -- Mutation: trigger a run (Hasura Action) --
export const TRIGGER_WORKFLOW_RUN = gql`
  mutation TriggerWorkflowRun($workflow_id: uuid!) {
    triggerWorkflowRun(workflow_id: $workflow_id) {
      workflow_run_id
      status
    }
  }
`;

// -- Mutation: approve a paused approval_gate step (Hasura Action) --
export const APPROVE_STEP = gql`
  mutation ApproveStep($step_run_id: uuid!) {
    approveStep(step_run_id: $step_run_id) {
      step_run_id
      status
    }
  }
`;

// -- Subscription: live step-by-step progress for a run --
export const STEP_RUNS_SUBSCRIPTION = gql`
  subscription WatchStepRuns($workflow_run_id: uuid!) {
    step_runs(where: { workflow_run_id: { _eq: $workflow_run_id } }, order_by: { started_at: asc }) {
      id
      status
      output
      error
      attempt_count
      approved_by
      approved_at
      step {
        name
        type
        step_order
      }
    }
    workflow_runs_by_pk(id: $workflow_run_id) {
      status
      started_at
      finished_at
    }
  }
`;
