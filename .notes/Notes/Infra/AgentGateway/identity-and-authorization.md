# EKS agent platform identity and authorization

Status: Proposed connection model with documented component constraints. Updated 5 October 2026. [Notes index and terms](README.md)

The identity model separates the human requesting work, the workload performing it and the downstream service authorizing the operation. Okta supplies corporate authentication; gateway policies and application permissions have different responsibilities. Every supported connection needs positive and negative tests. "Tenant" has the meaning given in the [README terms](README.md#terms) until the classification requirement is agreed.

## Connection matrix

| Connection | Proposed credential | Authorization owner |
|---|---|---|
| Developer client to MCP gateway | Okta access token through supported MCP OAuth flow | Gateway validates issuer/audience and exact entitlements |
| Client or hosted agent to model endpoint | Gateway-issued key or Okta-derived token; never the provider's own key | Gateway validates the caller, then applies approved models and budgets |
| Gateway to model provider | Provider credential held by the gateway through the secret mechanism or workload identity | Provider account policy; gateway limits models and usage |
| User to hosted agent | Supported user authentication at entry point | Entry point/runtime binds user to permitted agent and session |
| Hosted agent to tools | Verified delegated context or scoped machine credential | Gateway and downstream service |
| Batch job to tools | Named machine identity | Gateway and service grant autonomous permissions explicitly |
| Gateway/MCP service to API | Resource-specific delegated token or application credential | Backend checks its own permissions and tenant data |
| Workload to AWS | Scoped EKS workload IAM | IAM and resource policies |
| Application to stored state | Database credential plus trusted application identity | Application enforces user/tenant access |
| Client to catalog | Supported authenticated catalog access | Catalog restricts visibility/publication separately |
| GitLab CI to cluster/AWS | ID token federation into scoped IAM roles, or the GitLab agent for Kubernetes; the inventory records which is in use. Not the runner pod's own service account or node role | RBAC/IAM restrict project, protected ref and environment scope |
| Collector to telemetry backend | Vendor ingest credential | Observability platform |

This table defines intended paths, not proven integration support. Record the actual credential, verified principal, audience and authorization decision at each hop. Token forwarding must respect the destination audience; do not forward an Okta token to an unrelated API merely because it accepts bearer authentication.

## Okta integration

Agentgateway documents a native Okta provider for MCP authentication that bridges discovery, resource-indicator and client-registration differences. That support requires configuration and does not prove compatibility with our client fleet. Test actual IDEs and automation clients, redirect URLs, token refresh and missing/expired credentials. [Okta MCP authentication](https://agentgateway.dev/docs/kubernetes/latest/documentation/mcp/auth/okta/)

Define a claims contract for issuer, audience, subject, expiry, user versus machine identity, tenant membership and tool entitlements. Use access tokens appropriate to the resource. Identity owners determine how groups and permissions become issuer-controlled claims and how entitlement removal takes effect.

An authenticated user may still lack permission for a tool. Machine clients must not be treated as humans solely because their token validates. Derive tenant/session identifiers from verified context; reject caller attempts to replace them with headers or prompt text.

## Model access

Clients usually configure a model endpoint as a base URL and bearer credential rather than through the MCP OAuth flow, so the Okta MCP provider does not by itself cover model requests. Establish for each supported client how a model request carries a verified identity.

Agentgateway documents three ways to hold the provider credential: inline in configuration, in a Kubernetes Secret referenced by the backend, or by passing through the client's own token. Proposed: reference a secret, or use workload identity where the provider backend supports it; keep keys out of inline configuration; allow passthrough only where a caller is meant to hold its own provider account, because the gateway then neither owns the credential nor can withhold it. The same page describes issuing gateway API keys to users or teams and attaching token budgets to them. [API key management](https://agentgateway.dev/docs/kubernetes/latest/documentation/llm/api-keys/)

If gateway keys are used, define who issues them, how each maps to an Okta user or a named workload, and how rotation and revocation work. A long-lived key keeps working after an Okta entitlement is removed unless something revokes it. Restrict each caller to approved models and attribute usage from the verified identity, not from a caller-supplied header. Which providers and models are approved is an open requirement in the [validation plan](validation-plan.md).

## Gateway policy ownership

Platform owners control authentication and mandatory restrictions. Service/tool owners can propose narrower access configuration in their assigned scope. Agent teams select allowed tools but cannot grant themselves backend rights.

Agentgateway policies can attach at different resource levels; conflicting fields are resolved by specificity and shallow merging. A platform policy is therefore not automatically a non-overridable restriction. Limit who can create/modify routes, backends and policy fields using RBAC and enforced admission rules. Inspect effective policy and test attempted overrides. [Policy targeting and merging](https://agentgateway.dev/docs/kubernetes/latest/documentation/about/policies/target-merge/)

Use exact entitlement matching. Test missing claims, unexpected claim types, similarly named scopes, stale tokens and alternate route matches. Select per-tool authorization from the supported version; any tool argument rule must be validated against parsed protocol data rather than assumed to apply to an arbitrary HTTP body.

## Delegation and business permissions

When an operation must follow the human's permissions, obtain supported resource-specific delegated credentials. Document consent, callback handling, refresh, expiry, revocation and credential storage. If that flow is unavailable, explicitly limit the capability or use a separately approved machine operation; do not silently fall back to a privileged service credential.

Gateway permission to call a tool is only one prerequisite. In the [worked examples](worked-examples.md), the payments service must itself resolve payment ownership, refund eligibility, cumulative limits and idempotency before `issue_refund` succeeds. Credentials never belong in skills, prompt variables, catalog descriptions or trace payloads.

## Sessions and execution isolation

Hosted runtime session access is a separate control from Kubernetes admission. Establish how users create, resume, inspect and delete sessions. Reject cross-user or cross-tenant session identifiers, including through direct runtime APIs and administrative/debug interfaces.

For sandboxed actors sharing a worker, test credential, filesystem, network and snapshot separation using the selected runtime. Pod-level policies do not necessarily distinguish actors inside a worker. Define actor-level controls or strengthen the execution boundary when the runtime cannot enforce the required separation.

Kyverno enforces infrastructure configuration; runtime/tool authorization remains at the gateway/application boundary. Service-account RBAC cannot substitute for end-user business authorization.

## Acceptance and revocation

Use two tenants, permitted and denied users, a machine caller and expired/revoked credentials. Attempt gateway bypass, direct backend calls, direct model-provider calls, client identity spoofing and policy overrides; the candidate controls are listed in [foundation and services](foundation-and-services.md#bypass-enforcement-candidates). Measure the time from entitlement removal to denial at every boundary, including any gateway-issued model key. A catalog withdrawal does not revoke credentials or stop an already deployed consumer; incidents require explicit execution/access controls.
