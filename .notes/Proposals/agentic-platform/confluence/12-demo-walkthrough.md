# Agent platform: Demo walkthrough

| | |
|---|---|
| Status | Reference. Demo run on 4 November 2026, 09:54 to 09:56 UTC |
| Owner | Platform architecture |
| Audience | Everyone |
| Updated | 4 November 2026 |

> **In short**
> - A broken release, an alert, an agent's diagnosis, a proposal, a refused early change, an approval and a fix: under two minutes from alert to resolved, six model calls, about $0.17.
> - Every call went through Agentgateway with a verified identity; the rules lived in the gateway and the tool, not in any prompt.
> - It is a demonstration on one machine, with stand-ins for our IdP, Bedrock and production clusters. It shows what works, not production readiness.

## What happened

![Sequence of the demo incident: the alert at 09:54:24, the diagnosis agent reading logs, metrics and traces for about 20 seconds, the card with cause and evidence, the developer proposing at 09:55:03, the platform engineer's early apply refused by the service at 09:55:18, the incident manager drafting a status update and approving at 09:55:46, and the platform engineer applying at 09:56:00, resolved about 8 seconds later](diagrams/demo-incident.png)

Simplified: in reality every click goes through the chat assistant,
Agentgateway and an agent, each with a token naming the person and the agent.

### 1. A release breaks search

![The Sample App's search page, healthy, on search-service 2.0.0](../screenshots/incident-01-search-healthy.png)

![The search page after search-service 2.1.0 shipped: search unavailable](../screenshots/incident-02-search-failing.png)

### 2. The alert opens an incident, and an agent diagnoses it

Nobody typed anything. The alert called the platform; the card appeared for
everyone signed in, and a read-only diagnosis agent started.

![The incident card as the developer sees it, while the diagnosis runs: open, critical, "Diagnosing", proposal waiting for the diagnosis](../screenshots/incident-03-card-diagnosing.png)

About 20 seconds later: the suspected cause, with evidence from the logs,
Prometheus and Tempo, and the version to roll back to.

![The card with the diagnosis: a code defect in src/ranking.js in 2.1.0, evidence from the pod log, the first error, Prometheus counts per version and a Tempo trace, and the Propose rollback to 2.0.0 button](../screenshots/incident-04-developer-diagnosis.png)

### 3. The developer proposes

The developer owns the search service, so may propose. Proposing is all this
role can do.

![The developer's card after proposing: change CHG-0001, status Mitigating, Proposed checked, waiting for approval](../screenshots/incident-05-developer-proposed.png)

### 4. Applying before approval is refused by the tool

The gateway let the call through, because this role may apply. The delivery
tool refused it under its own rule.

![The platform engineer's card: Apply pressed before approval, refused by the service with rule change_is_approved, on the card and in the chat](../screenshots/incident-06-engineer-refused-by-service.png)

### 5. The incident manager drafts a status update and approves

The draft is written by an agent with the incident manager's identity and
access; posting it stays their own action. The service checks that the approver is
not the proposer.

![The incident manager's card with a drafted status update below the steps, and the Approve button](../screenshots/incident-07-manager-status-draft.png)

![The incident manager's card after approving](../screenshots/incident-08-manager-approved.png)

### 6. The platform engineer applies; search recovers

![The card while the rollback is applied and verified](../screenshots/incident-09-engineer-verifying.png)

![The resolved card: proposed by developer, approved by incident-manager, applied by platform-engineer, verified by the remediation agent, resolved at 09:56, with the earlier refusal still in the chat](../screenshots/incident-10-engineer-resolved.png)

![The search page answering again on 2.0.0](../screenshots/incident-11-search-recovered.png)

![Grafana's Sample App dashboard: search success back to 100%, version 2.0.0, the error spike and the hour's error budget spent](../screenshots/incident-12-grafana-sample-app-recovering.png)

## What the platform saw

![Grafana's platform overview for the incident: 984 requests through the gateway, 0 refused by the gateway, 80,000 model tokens, 605 tool calls, mostly the card polling list_incidents and get_incident](../screenshots/incident-13-grafana-platform-overview.png)

![Langfuse with this incident's model calls: four for the diagnosis, one status draft and one remediation report, each with input and output](../screenshots/incident-14-langfuse-model-calls.png)

![Agentgateway's usage analytics by model and user: $1.78 and 824,109 tokens over 24 hours, of which 818,025 on the diagnosis agent's workload key with no user attached](../screenshots/incident-15-gateway-cost-by-user-model.png)

Two findings from these views shape the design:

- **99.3% of tokens had no user attached.** The diagnosis agent runs on
  kagent, which cannot join the delegation chain, so it uses a workload key.
  Production agents must carry the person's identity.
- **Tool calls were mostly polling** (597 of 605 were the card refreshing).
  Usage limits and dashboards should separate polling from work.

<details>
<summary>More views of the running platform (same day)</summary>

![Agentgateway's per-tool rule for the delivery tool: apply_change only for platform-engineer through the remediation agent, approve_change only for incident-manager through the chat assistant](../screenshots/07-agentgateway-mcp-tool-authorization.png)

![Agentgateway's policies: sign-in checks, authorization and tool rules on every agent and tool route](../screenshots/06-agentgateway-policies.png)

![Agentregistry's catalog: two tool servers and four agents, every one labeled "latest"](../screenshots/01-agentregistry-catalog.png)

![Langfuse's trace list: about 6,760 observations for 59 model calls, mostly infrastructure spans](../screenshots/10-langfuse-traces.png)

![kagent's Substrate view: a gVisor worker pool, snapshot templates and 16 suspended actors](../screenshots/14-kagent-substrate.png)

![The Keycloak sign-in page with a button for the stand-in enterprise IdP](../screenshots/03-keycloak-broker-signin.png)
</details>

## What the demo does not show

- Our IdP, Bedrock (no answer has come back from Bedrock in the demo yet),
  EKS, Istio, Spot or Karpenter.
- Usage limits or budgets.
- Coding tools signing in through the gateway.
- Approvals bound to the exact resource version, or durable approval records.

> **Go deeper**
> [Demo review](../20-demo-review.md) in the review: patterns to keep, gaps to close, and where the demo's documentation and code differ.
