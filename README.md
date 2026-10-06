# Agentgateway demo

Status: skeleton only. Nothing here runs yet.

A kind cluster that shows the EKS agent platform option from
[`Docs/AgentGateway/architecture.md`](../Docs/AgentGateway/architecture.md) in
under 10 minutes, through one incident: a Sample App breaks, agents diagnose
it, and three roles propose, approve and apply the fix. Every agent, tool and
model call goes through Agentgateway.

This is a demonstration of what is possible. Its results are observations, not
pilot evidence for the architecture decision.

## Layout

Each top-level directory answers one question.

| Directory | Holds | Would exist in production |
|---|---|---|
| `agent-platform/` | What any team can reuse: charts, profiles, policies, platform tests | Yes (architecture doc, section 11.1) |
| `agent-deployments/` | What runs where: platform services, routes, one selection per workload, access | Yes (section 11.1) |
| `components/` | Source owned by one team. Each child stands in for a separate repository | Yes, as separate repositories |
| `local/` | Everything that exists only because this is kind: Keycloak for Okta, a local registry for ECR, the Grafana stack for New Relic or Dynatrace, a pipeline stand-in for GitLab CI | No |
| `demo/` | Presenting only: the script, break and reset scenarios, backup commands | No |

## Model provider

Agentgateway is the only component that talks to a model provider. The binding
is in
[`agent-deployments/clusters/dev/platform/model-provider.yaml`](agent-deployments/clusters/dev/platform/model-provider.yaml).

- **Now:** an Anthropic Messages API on the host at
  `http://localhost:7070/v1/messages`.
- **Demo day:** Amazon Bedrock. Its block in that file is a placeholder.

From inside the cluster, `localhost` is the pod. This machine runs Docker
Desktop, so the gateway reaches the host as `host.docker.internal`.

Names, ports, identities and tool contracts are in
[`agent-platform/docs/conventions.md`](agent-platform/docs/conventions.md).
