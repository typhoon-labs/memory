# AgentCore identity and authorization design

Status: Proposed design with documented service constraints. Updated 5 October 2026.

This design distinguishes the user, the workload acting for that user, and the downstream service enforcing business permissions. The proposed corporate identity provider is Okta. Its specific configuration and the AgentCore claim contract remain pilot decisions.

## Authentication by connection

| Connection | Proposed authentication | Identity used for authorization |
|---|---|---|
| User client to agent entry point | Corporate JWT | Verified subject, tenant and agent entitlement |
| Agent to user-aware tool gateway | Supported JWT/delegation flow | Verified end user and allowed workload |
| Batch workload to tool gateway | IAM or service token | Named service principal and batch entitlement |
| Gateway to AWS-hosted MCP runtime | SigV4 where supported and appropriate | Gateway role; user binding requires a separate verified design |
| Gateway to user-delegated API | Supported delegated OAuth flow | Downstream user's own permissions |
| Agent to credential vault | Workload access token issued to the runtime | Workload identity and, for delegated tokens, the bound user |
| Agent to memory | Execution IAM plus application identity binding | Trusted actor/tenant and permitted namespace |
| Agent to model | Execution IAM | Execution role and approved model list |
| Consumer to artifact storage | Execution IAM | Approved release prefixes and decrypt rights |
| Consumer to catalog | To be confirmed for the new registry namespace | Entitlement to discover approved records |
| Workload or collector to observability backend | Platform-held vendor ingest credential | Platform export identity; no user credential |
| GitLab CI to AWS | ID token (OIDC) federation into scoped roles | Project, protected ref, environment tier and deployment scope |

This is an intended connection matrix, not a claim that every row is available in every target mode. The pilot must establish credential forwarding, token exchange, and supported audience boundaries for the selected path. A workload access token must not be assumed to be an ordinary user JWT accepted by a gateway.

AgentCore runtime supports one inbound auth method at a time. AWS describes gateway-only restrictions using a resource-based policy on the runtime for SigV4 runtimes and `allowedWorkloadConfiguration` on the authorizer for JWT runtimes. The calling backend must also bind runtime sessions to users. [AWS runtime security guidance](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-security-best-practices.html)

## Okta and the claims contract

Propose an authorization server per environment, with distinct audiences. User clients use authorization code with PKCE; machine clients have separately scoped service credentials. Determine licensing, administrator permissions, and provider credentials before adopting this layout.

Suggested capability scopes include `agents.finance.invoke`, `registry.search`, `tools.payments.read`, and `tools.payments.refund`. Tenant membership and business entitlement claims must be issued from trusted identity data. Avoid allowing a client-supplied header or prompt to override them.

`access/roles.yaml` is proposed as the reviewed entitlement source. It can generate identity policy inputs and workload access configuration, but business permission enforcement remains owned by downstream services. Changes should produce a human-readable entitlement diff; the generated Terraform plan alone is insufficient for access review.

Illustrative internal configuration, not an Okta or AgentCore schema:

```yaml
roles:
  finance_analyst:
    groups: [agentcore-finance-users]
    agents: [finance-assistant]
    scopes: [agents.finance.invoke, tools.payments.read]
  finance_approver:
    groups: [agentcore-finance-approvers]
    agents: [finance-assistant]
    scopes: [agents.finance.invoke, tools.payments.read, tools.payments.refund]
    refund_limit_minor_units: 50000
```

The amount is illustrative USD minor units, not a cross-currency rule. Define issuer, audience, subject, expiry, tenant, machine/user distinction, and exact entitlement representations as a versioned claims contract. Establish revocation behavior and the maximum time a removed entitlement can remain usable.

## Gateway policy and business authorization

AgentCore's OAuth policy principal derives from JWT subject; other claims become string tags, with arrays serialized as JSON text. A substring scope match can accidentally accept a differently named entitlement. [AWS principal claims](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/example-policies-principal.html)

Prefer exact, trusted entitlement claims or carefully tested delimiter-aware matching. The following Cedar fragment illustrates an exact scalar claim contract; it requires schema validation and genuine issuer-controlled claims before use:

```cedar
permit(
  principal is AgentCore::OAuthUser,
  action == AgentCore::Action::"payments___issue_refund",
  resource == AgentCore::Gateway::"<gateway-arn>"
) when {
  principal.hasTag("payments_refund_entitlement") &&
  principal.getTag("payments_refund_entitlement") == "approved" &&
  context.input.currency == "USD" &&
  context.input.amount_minor_units > 0 &&
  context.input.amount_minor_units <= 50000
};
```

This policy checks a caller entitlement and request limits. It does not prove that a payment belongs to the caller's tenant, that money has not already been refunded, or that a cumulative limit has not been reached. The payments service must resolve those facts authoritatively and reject violations.

The two illustrations above are not yet joined. `roles.yaml` expresses the refund entitlement as the `tools.payments.refund` scope, while the policy reads a scalar `payments_refund_entitlement` claim; the rule by which the issuer derives one from the other belongs in the claims contract. The `50000` literal is generated from `refund_limit_minor_units` and not read from the token, because every claim reaches the policy as a string tag and cannot be compared numerically. A role with a different limit needs its own generated policy and a claim value that distinguishes it.

Platform baseline rules and workload permits have separate owners. Both need allow/deny tests using the generated target schema. Enforce policies for acceptance tests; observe-only mode cannot prove a denied operation was blocked.

## Delegated and autonomous credentials

Use delegated credentials when the downstream operation must follow the user's permissions. Use client credentials for explicitly autonomous operations with a documented service permission set. An agent execution role must not convert a denied user request into a privileged autonomous request.

Credential-provider ownership includes registration, consent callbacks, allowed redirect URLs, rotation, revocation, and failure handling. Shared providers are acceptable only when their credential and authorization boundary fits all consumers. Do not treat a provider per external system as universally sufficient for every tenant.

Never persist access tokens in prompts, skills, manifests, traces, or repository configuration. Audit identifiers and authorization outcomes without exposing raw credentials.

## Isolation and bypass prevention

Derive memory actor and tenant identifiers from verified context. Store a binding between user and runtime session; reject attempts to reuse another user's session. A namespace template helps organize memory but must be paired with permitted read/write paths and application checks.

Test direct runtime calls, alternate target URLs, token substitution, stale scopes, absent claims, service callers impersonating users, and scripts that attempt to bypass the governed tool path. Direct REST calls are permitted only when an explicitly approved architecture provides equivalent authorization and audit controls.

## Ownership and acceptance

Identity owners manage issuer configuration and claims. Platform owners manage gateway auth, credential infrastructure, and baseline controls. Agent teams manage context propagation and session binding. Service teams enforce data and transaction permissions.

Acceptance requires positive and negative tests for each role, two tenants, user and machine callers, expired tokens, and gateway bypass. Record the actual principal seen at every policy boundary. An authorization design is incomplete until these observations match the intended connection matrix.
