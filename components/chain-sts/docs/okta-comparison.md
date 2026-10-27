# Okta for AI Agents vs. Keycloak + chain-sts: cost and capability

This document compares Okta for AI Agents (O4AA) with what this repository
runs instead, Keycloak plus [chain-sts](../README.md), on cost and on
capability. It was researched on 2026-10-21, and every web source was accessed
on 2026-10-21 unless a different date is given. Dollar figures are USD list
prices as of 2026-10-21 unless stated. Okta publishes no price for the
products the comparison turns on (O4AA, API Access Management, and the
Professional and Enterprise suites), so a quote from Okta decides it: the
figures here frame that quote and do not replace it.

**Unverified** marks a claim that could not be tied to a source, or that rests
only on one weak secondary source. **Estimate** marks a figure worked out for
this document from assumptions or from other figures (the run and people cost
of Keycloak + chain-sts, the totals, the break-even prices, and per-user
figures derived from published totals); it is neither a published price nor a
quote. What this document says about chain-sts and the dev cluster follows
[the component's README](../README.md); prices, terms and product dates are a
snapshot of 2026-10-21.

## Summary

Okta publishes no price for any of the products this decision depends on. Okta
for AI Agents (O4AA), API Access Management (API AM), and the Professional and
Enterprise suites are all "contact sales" (okta.com/pricing, 2026-10-21).
Okta's own Service-Specific Terms (Rev. 06/12/2026) settle three things that
change the question:

- **The metric.** O4AA is licensed per **"User per Month"**, not per agent, so
  cost grows with the number of people whose requests pass through agents.
- **API AM is bundled.** The O4AA SKU **includes API Access Management**,
  limited to AI-agent use. A separate API AM purchase is needed only for
  tokens that serve non-agent traffic.
- **Contract restrictions.** O4AA may not be used by affiliates. It is
  excluded from HIPAA standards and from the Canada- and India-hosted cells.
  It allows Okta to throttle or charge for "unreasonable" use.

Technically, Okta now does what chain-sts does. Its documented agent-to-agent
token exchange (ID-JAG, then a JWT-bearer grant at a custom authorization
server) returns a token whose `sub` is the user, with nested `act` claims
marked `sub_profile: ai_agent`. Agent-to-Agent Connections has been GA since
2026-07-21.

Okta still differs from chain-sts in five ways:

- It documents no way for an agent to authenticate with a Kubernetes
  service-account token. Agents need a registered key or secret. Keycloak 26.6
  supports Kubernetes service-account tokens natively.
- It does not document a maximum chain depth, or carrying user claims such as
  `roles` and `team` into chain tokens.
- Each hop takes two token calls against rate-limit buckets whose values Okta
  no longer publishes.
- The first hop needs an ID token minted for that agent.
- The `act` values are Okta IDs, not service-account names.

Running Keycloak + chain-sts yourself costs roughly **$35k–$145k a year**
(**estimate**), mostly people; the assumptions are in section 4. Okta wins if
its per-user price times the number of agent users comes in under that. The
break-even (**estimate**) is about $3–$12 per user per month at 1,000 users,
and about $0.60–$2.40 at 5,000 users. Okta also wins if the team cannot staff
24x7 on-call for a security-critical service. Self-hosting wins for large user
counts with few agents, for strict Kubernetes-native identity, or where O4AA's
compliance exclusions apply. By the estimates in section 4.5, a third option
is cheaper than both: basic Okta + chain-sts with no Keycloak.

## 1. Okta pricing and pricing model

### 1.1 Workforce Identity suites (the base you already pay for)

| Suite | List price | API AM | Source, date |
|---|---|---|---|
| Starter | $6/user/month, billed annually | Add-on | okta.com/pricing, 2026-10-21 |
| Core Essentials | $14/user/month | Add-on | okta.com/pricing, 2026-10-21 |
| Essentials | $17/user/month | Add-on | okta.com/pricing, 2026-10-21 |
| Professional | Contact sales | Add-on | okta.com/pricing, 2026-10-21 |
| Enterprise | Contact sales | **Included**, with Machine-to-Machine Tokens | okta.com/pricing, 2026-10-21 |

- Workforce Identity has a **$1,500 annual contract minimum**
  (okta.com/pricing, 2026-10-21).
- Okta's support plans add a percentage of annual spend. Premier Success
  Silver is 15% of ARR for $20k–$200k a year, and Gold is 25% and required
  above $200k. Basic support is included below $20k. Source: Corma's
  2026-10-05 article, citing Okta's Premier Success datasheet of October 2025.
  This is a secondary source; confirm it in a quote.
- Negotiated discounts, per Vendr's Okta buyer guide (updated February 2026):
  - 14% average savings.
  - 15–30% off list for multi-year or competitive deals.
  - 10–20% more for prepayment.
  - Volume breaks at 100, 500, 1,000 and 5,000 users.
  - Median buyer spend $44,616 a year, across 2,035 purchases.

### 1.2 API Access Management (custom authorization servers)

- **Current list price:** not published. It is an add-on to Starter through
  Professional and included in Enterprise (okta.com/pricing, 2026-10-21).
  Corma (2026-10-05) also says Okta no longer publishes add-on prices.
- **Historical reference:** $2/user/month, from SuperTokens (2024-07-02), when
  Okta still published per-product prices. Treat it as **stale**.
- **Third-party estimates:**
  - Zluri (updated 2026-01-08): "$11,000 to $22,400 for 200 users and up to
    $35,900 to $72,800 for larger teams." If these are annual totals, that is
    about $4.60–$9.30 per user per month (**estimate**). **Unverified**: the
    source doesn't say what is included.
  - A search index attributed "$19,900–$40,400 for 1,000 users" to Vendr. The
    Vendr page fetched for this document does not show it. **Unverified.**
- **Licensing detail.** M2M tokens are licensed as access tokens issued under
  the client-credentials grant per subscription year. Source: the Licenseware
  wiki (retrieved 2026-10-06), citing Okta's Product Subscription Reference
  Guide (2026-09-23). This is secondary; the guide itself could not be opened,
  because it redirects to Highspot.
- **Why it matters.** API AM is what basic Okta lacks. Okta says Okta itself
  is the only app that should validate access tokens from the org
  authorization server (developer.okta.com, validate-access-tokens guide).
  On-behalf-of token exchange needs API AM and two custom authorization
  servers (Okta support article, "on behalf of token exchange requires use of
  two custom authorization servers").

### 1.3 Okta for AI Agents (Workforce Identity)

- **Name and status.**
  - "Okta for AI Agents" was announced 2026-03-16, with GA on 2026-04-30 (Okta
    press release, Showcase 2026). The 2026-08-24 Agent SSO press release says
    "generally available since May 2026".
  - Agent-to-Agent Connections went GA on 2026-07-21 (Okta product-innovations
    page). It had been in EA since 2026-06-17.
  - Agent Gateway went GA on 2026-10-08, after an Oktane deck (September 2026)
    said "GA Q3 CY26".
  - Multi-MCP Custom Auth Servers went GA on 2026-10-06.
  - Registering AI agents with CIMD went GA on 2026-10-01.
- **SKUs.** Okta's Service-Specific Terms (SST), Rev. 06/12/2026, sections 4.1
  and 4.2, define two SKUs:
  - **Okta for AI Agents.** Its "Agentic Identity Services" include ISPM,
    Universal Directory, SSO, **API Access Management**, Okta Privileged
    Access, and Access Governance.
  - **Okta for AI Agents – Core.** Includes Universal Directory, SSO, **API
    Access Management**, and Access Governance. It is the public-sector and
    FedRAMP variant ("Public Entity Use Only").
- **Metric.** "Okta for AI Agents is licensed based on the number of Users per
  Month" (SST 4.1.3).
  - Per the Product Subscription Reference Guide, as quoted by Licenseware: a
    User is someone in Active status "who [is] assigned to a User sign-on
    application associated with an AI Agent in an Active Status".
  - Quantities cannot be decreased during the term. Add-ons are co-termed at
    the same price.
  - A legacy metric, "Agent-to-Identity Connections per Month", existed
    (Licenseware, citing Okta's Legacy SKU guide). **Unverified** beyond that
    wiki.
- **Price:** not published. Okta's pricing page lists O4AA under "Customize
  your base suite" with no price, linking to
  /products/govern-ai-agent-identity/, which has no price either.
  - One blog (aimagicx.com, 2026-04-17) claims "$6/agent/month for up to 100
    agents" was shown at Showcase. **Unverified**, and it contradicts the
    per-User metric in Okta's contract terms. Do not budget on it.
  - WorkOS (2025-11-03) also reports that Okta's agentic pricing "is not
    publicly disclosed".
- **Scope limits (SST 4.1.2):** O4AA may not be used to "identify,
  authenticate, govern or manage any employee, contractor, partner, customer
  or other human identity for purposes of directly accessing any system,
  application or other computing resource that is not an AI Agent". This
  document reads that as: the bundled API AM covers agent traffic, but not,
  for example, users calling the gateway directly with their own tokens.
  **Confirm with Okta.**
- **Other contract terms that affect cost or eligibility:**
  - **2.1.4 "Reasonable Use":** usage that threatens platform stability "or
    results in a material increase in Okta's costs" "may be subject to
    additional fees, throttling, or suspension".
  - **4.1.5 "Customer Use Only":** affiliates and subsidiaries may not use it.
  - **4.1.6 Exclusions:** the Canada- and India-hosted cells, "any Health
    Insurance Portability and Accountability Act standards", FedRAMP and DoD
    authorizations not yet granted, and the Okta for Government Moderate, High
    and US Military cells. Okta's product page instead says the *full* O4AA
    SKU is for HIPAA, and the Core SKU is for FedRAMP Moderate/High and DoD
    IL5. **The two sources conflict.**

### 1.4 Agent SSO / Cross App Access (free, but not enough)

- **Agent SSO** brings Cross App Access (XAA, which uses ID-JAG) into core
  Okta SSO. Okta's press release (2026-08-24) says it is "included in core
  Okta SSO at no additional cost", and the Oktane 2026 deck repeats "at no
  extra cost".
- **It does not cover agent chains.** Okta Support says "Okta requires Okta
  for AI Agents (O4AA) to establish agent-to-agent connections"
  (support.okta.com, last updated 2026-09-30). The same article lists API
  Access Management under "Applies To", without calling it a prerequisite.
- **It needs XAA-enabled resources.** Agent SSO connects an agent to
  XAA-enabled OIN, SAML or OIDC apps. This repository's resources are its own
  MCP servers and agents, which under Okta would sit behind a custom
  authorization server: the O4AA path (section 2).

### 1.5 Auth0 for AI Agents (Customer Identity, a different product)

- **Price.** Auth0 sells "Auth0 for AI Agents" as an add-on to Essentials and
  Professional that "Adds 50% to the base price" (auth0.com/pricing,
  2026-10-21). At 500 MAU it starts at:
  - $18/month (B2C Essentials) or $120/month (B2C Professional).
  - $75/month (B2B Essentials) or $400/month (B2B Professional).
  - Enterprise is contact sales.
  - Auth0's terms (SST 3.4.1) say the add-on is offered only on Enterprise and
    Growth plans. That wording differs from the pricing page.
- **Delegation support.** Auth0's on-behalf-of (OBO) token exchange produces
  nested `act` claims up to five levels. It fails if the subject token already
  has four (auth0.com docs). It is limited to 30 RPS without the add-on, or
  the plan's Authentication API limit with it (SST 3.4.2 and the Auth0 docs).
  It needs "Custom API" clients and does not accept Kubernetes tokens. Auth0's
  XAA support for resource apps is in EA (2026-08-05).
- **Fit.** Auth0 is a separate tenant and platform from Workforce Okta. It
  would be a third identity system federated from Okta. It is included here
  for completeness; it is not the Workforce answer.

### 1.6 Metering summary

| Meter | Okta Workforce | Source, date |
|---|---|---|
| Per user | Suites and O4AA ("Users per Month") | okta.com/pricing; SST Rev. 06/12/2026 |
| Per agent | Not in current terms. A legacy "Agent-to-Identity Connections per Month" metric existed | Licenseware (2026-10-06); **unverified** |
| Per token | M2M (client-credentials) tokens per subscription year | Licenseware, citing the PSRG (2026-09-23) |
| Per MAU | Customer Identity (Okta CIC, Auth0) only | okta.com/pricing; auth0.com/pricing |
| Usage ceiling | "Reasonable Use" can bring fees or throttling | SST 2.1.4 |

**Budget sensitivity.** The O4AA price is unknown, so the useful number is
what each $1 per user per month costs. That is $12 per user per year: $2,400 a
year at 200 agent users, $12,000 at 1,000, and $60,000 at 5,000. These are
arithmetic on a hypothetical $1, not an estimate of the price.

## 2. Which edition is needed for which capability

| Capability | What Okta requires | Evidence |
|---|---|---|
| Access tokens for our own APIs, with our audience and claims | A custom authorization server, which needs API AM. API AM is an add-on, included in Enterprise and inside the O4AA SKU for agent use | okta.com/pricing; SST 4.1.1.1; Okta support (OBO needs two custom ASes and API AM) |
| Token exchange, user → agent → resource | **O4AA subscription.** "An Okta org that's subscribed to Okta for AI Agents", with a super admin, a registered agent, a resource connection, and custom scopes on the custom AS | developer.okta.com, AI agent token exchange guide |
| Nested `act`, agent → agent → resource | O4AA (Agent-to-Agent Connections, GA 2026-07-21). Each hop repeats ID-JAG at the org AS, then a JWT-bearer grant at the custom AS. Each agent adds an `act` level | Okta support (2026-09-30); developer guide |
| Machine-started chains (like this repository's Alertmanager hook) | O4AA "machine access": a client-credentials token from a custom AS as the subject, plus a "delegation link" | Developer guide |
| Agent identity from a Kubernetes projected service-account token | **Not documented.** Agents can use a CIMD URL, client ID only, a client secret, or a public/private key (a JWK you upload, or one Okta generates). A `jwks_uri` field exists on generic OAuth clients but is not mentioned for AI agents | help.okta.com, "Add AI agents manually"; developer.okta.com OAuth clients API. Kubernetes token support **unverified/absent** |
| Kubernetes workloads in Okta at all | Okta Privileged Access "workload connections" list a Kubernetes JWT provider and a generic JWKS issuer. They issue *OPA* tokens, not OAuth tokens for agents. OPA is inside the full O4AA SKU. Using OPA to hand an agent its Okta credential is **unverified** | help.okta.com (OPA workload connection); SST 4.1.1.1 |
| A separate audience per route or resource | Each custom AS has one configured audience. Okta now supports RFC 8707 `resource`, which switches the audience. "Multi-MCP Custom Auth Servers" (GA 2026-10-06) lets one custom AS cover many MCP servers with per-server tokens. The agent guide says multi-resource ASes "support only the user-access flow" | Okta support, updated 2026-08-21; okta.com product-innovations; developer guide (authserver variant) |

## 3. Feature gaps, both ways

### 3.1 Token shape

| | chain-sts (this repository) | Okta for AI Agents (documented) |
|---|---|---|
| `sub` | The user's IdP `sub`, unchanged | The user's Okta ID in the ID-JAG, or the service client ID for machine flows |
| Actor claims | `act: {sub: system:serviceaccount:<ns>:<sa>, client_id: <agent>}`, nested, newest outermost | `act: {sub: <agent principal ID>, sub_profile: "ai_agent"}`, nested, newest outermost. Machine flows end with `sub_profile: "service"` |
| Carried claims | `preferred_username`, `roles`, `team`, `email`, `name` (`carry_claims`) | Docs show `scope`, `sub_profile` and the `act` chain. Custom AS claims (groups, profile attributes) on ID-JAG/JWT-bearer tokens are **not documented: unverified** |
| `aud` | From the `audiences` allowlist: the requested `audience` and `resource` values, which may repeat, else the first of `audiences` | The custom AS audience, or a resource indicator |
| Lifetime | ≤ 300 s, and never past the subject's `exp` | ID-JAG 300 s; access token 3,600 s in the examples. Configurable for agent flows: **unverified** |
| Chain depth | `max_chain` (4 in dev), configurable. The dev cluster's `after` rules allow at most two agents | Examples show two agents (three `act` levels with the initiating service). **No documented maximum**. Auth0's OBO caps at five levels |
| Who may follow whom | `after:` per agent; `act_for_users` | Resource connections (agent → agent or resource) and "user access" settings |
| First hop | A trusted identity provider's token without `act`, for an audience the agent may exchange (`subject_audiences`), to an agent with `act_for_users`; the agent's service-account token is the actor. In the dev cluster `chat-assistant`, `remediation-agent` and `comms-agent` may each be the first agent | "Okta accepts only ID token subject tokens minted for the current requesting client". The first agent must be the OIDC client the user signed into |

Downstream verifiers (the gateway's routes, `delivery-mcp`,
`remediation-agent` and `comms-agent`) would change under Okta. The issuer
changes; the `act.sub` values, which the gateway's rules on the newest actor
compare with service-account names, become Okta IDs; and `roles`/`team` would
have to come from custom AS claims if Okta supports that for these grants.
Okta's July 2026 announcement says Agent-to-Agent Connections "embed the
complete chain of custody directly into the token".

### 3.2 Chains longer than two

- **Okta:** the docs say the nesting "depends on the authentication chain" and
  add one `act` level per agent hop. The examples stop at two agents, and no
  limit is published. Treat user → A → B → C → tool as **unverified** until
  tested.
- **chain-sts:** depth is whatever `max_chain` allows, and chain-sts refuses a
  token that already names the same agent. In the dev cluster `max_chain` is
  4, but the `after` rules
  ([`policy.yaml`](../../../agent-deployments/clusters/dev/platform/90-chain-sts/policy.yaml))
  let no agent follow `remediation-agent` or `comms-agent`, so the longest
  chain there is two agents.

### 3.3 Audit

- **Okta, what it logs.**
  - Okta's agent-to-agent blog (2026-06-17) says its audit log records the
    delegation chain for every call, and the record persists after the token
    expires.
  - An Okta Learning course says the System Log shows "M2M token grants and
    XAA token exchange events".
  - Generic token grants appear under `app.oauth2.token.grant.*` (org AS) and
    `app.oauth2.as.token.grant.*` (custom AS), per Okta Support. The exact
    event types for ID-JAG issuance and redemption, and whether each event
    carries the full `act` chain, are **unverified**.
- **Okta, retention:** 90 days (Okta's data retention policy and its
  "Exporting Okta Log Data" article). Keeping logs longer needs the API or log
  streaming (EventBridge or Splunk, per a secondary guide). Whether log
  streaming is on your SKU is **unverified**.
- **chain-sts:** one JSON audit line per decision (issued or refused, user,
  chain, `jti`, `aud`, `exp`, error) goes to stderr ([Logs and
  audit](../README.md#logs-and-audit)). You keep it, and you choose the
  retention and the SIEM, and you run them yourself.

### 3.4 Token endpoint rate limits

- **Okta: two calls per hop.** Each hop is an ID-JAG exchange at the **org**
  AS `/oauth2/v1/token` and a JWT-bearer grant at the **custom** AS
  `/oauth2/{id}/v1/token`. chain-sts needs one.
- **Okta: the buckets.**
  - The org AS bucket is separate from the custom AS bucket. All custom ASes
    in an org share one bucket (Okta Support, updated 2026-06-04).
  - The org AS bucket is also where all workforce OIDC sign-ins exchange
    codes. **Unverified** that ID-JAG calls land in the same bucket, but they
    hit the same endpoint.
  - By default each OAuth app may use up to 50% of a bucket
    (developer.okta.com).
  - Quotas vary by subscription, license count and DynamicScale
    (developer.okta.com rate-limit overview). The overview's only published
    example is 1,200/min for `/oauth2/v1/authorize`.
  - Okta's public docs no longer list per-endpoint values for the token
    endpoints. They live in each org's Rate Limit Dashboard.
  - A search-engine snippet showed 300 / 1,200 / 2,000 per minute for the
    custom AS token endpoint across editions. **Unverified.**
  - Okta also caps 4 token requests per second per username on
    `/oauth2/v1/token`, aimed at password flows. Whether it applies to these
    grants is **unverified**.
  - There is a contractual throttle as well (SST 2.1.4).
- **Okta: what that means.** At an illustrative 1,200/min shared custom-AS
  bucket, a two-agent chain with no token caching supports about 600 chained
  user requests per minute (10/s) across the org (**estimate**). Caching each
  agent's token for its lifetime (ID-JAG 5 min, access token 60 min) cuts this
  by orders of magnitude, but long-lived chain tokens trade away revocation
  speed.
- **chain-sts:** scales horizontally. The limits are one Kubernetes
  TokenReview per exchange against the API server, and, if signing moves to
  KMS, the KMS asymmetric quota: 1,000 RSA/ECC operations per second per
  region by default since 2024 (AWS), and adjustable.

### 3.5 Other gaps

- **Okta has, and chain-sts does not:**
  - Agent registry with owners, access certifications and shadow-agent
    discovery.
  - Universal Logout and an Agent Gateway kill switch (GA Q4 CY26 per the
    Oktane deck).
  - Vendor SLAs and attestations.
  - XAA to SaaS apps.
  - A token lifetime and revocation model maintained by Okta.
- **chain-sts and Keycloak have, and Okta does not document:**
  - Kubernetes-native actor identity, with no agent secret. chain-sts uses
    TokenReview. Keycloak 26.6 promoted "federated client authentication" with
    Kubernetes service-account client assertions to *supported* (release notes
    26.6.x).
  - Exact control of claims and audiences.
  - No per-user license meter.
  - Works in air-gapped or self-hosted clusters.
  - No Okta compliance-scope exclusions.
- **Gaps in chain-sts itself** (its README, [What is not
  done](../README.md#what-is-not-done)):
  - No key in a KMS: a KMS signer is described, not written. The key is a
    Secret.
  - Key rotation is done in the dev cluster (2026-10-21, with `task
    sts:rotate:*`, two replicas serving, 2,926 requests and no failure), but
    nothing rotates on a schedule, and the tasks run from a workstation with
    the cluster's admin kubeconfig.
  - The dev cluster runs two replicas with a PodDisruptionBudget, but both on
    kind's one node. Every agent call depends on the service, and without it
    the agents fail closed.
  - The TokenReview grant is narrow: ClusterRole `chain-sts-token-review`,
    `create` on `tokenreviews` and nothing else, in place of
    `system:auth-delegator`. A TokenReview is cluster-wide, so the service may
    still ask about any token in the cluster.
  - One audience for every issued token (`agentgateway`), so an agent can
    reuse a token it received wherever its caller is accepted as the newest
    actor; tokens for one target each (RFC 8707 `resource`) would close that.
    The refusals are checked by script (`task sts:check`) and drilled
    (`task demo:chain`, `task demo:backup:sts-down`) in the dev cluster.
  - The gateway's rules read `act`, but only the newest actor is checked. A
    user's own token without `act` still works on every route its roles allow,
    and `delivery-mcp` records the chain but decides nothing by it.
  - kagent can only be the last agent in a chain.
  - `diagnosis-agent` runs on Agent Substrate with no credential of its own
    that chain-sts can verify, so it stays outside the chain.
  - A Keycloak 26.8.1 test showed Keycloak's own delegation (preview) records
    only one `act`.

## 4. Cost of running Keycloak + chain-sts in production

### 4.1 Assumptions

- You already run a production Kubernetes platform with 24x7 on-call, and
  Keycloak runs on it. The marginal cost is what is counted here.
- Basic Okta stays as Keycloak's upstream IdP for sign-in, and Okta groups map
  to `roles` and `team`. That is the production arrangement assumed here; in
  this repository Keycloak stands in for Okta and keeps its own demo users
  ([`docs/contracts.md`](../../../docs/contracts.md)).
- Load is modest: tens of sign-ins per second at peak and hundreds of token
  requests per second at most.
- People cost is an **assumed** $150k–$250k per year per fully loaded FTE.
  Substitute your own rate.
- All ranges below are **estimates, not quotes**. Cloud prices are rough
  on-demand list prices and are **unverified**; check them in your provider's
  calculator.

### 4.2 Run cost (infrastructure)

| Component | Sizing basis | Rough monthly cost (estimate) |
|---|---|---|
| Keycloak, 3 pods | Keycloak sizing guide: 1 vCPU per 15 password logins/s, and per 120 client-credentials or refresh requests/s, plus 150% headroom; about 1,250 MB base memory per pod; the worked example uses 3 pods. With Okta doing the password check, logins are cheap | $50–$300 on shared nodes (**estimate**) |
| PostgreSQL, HA (managed multi-AZ) | The guide suggests db.t4g.large (2 vCPU) to db.t4g.xlarge (4 vCPU) for about 410 requests/s | $150–$600 (**unverified** list-price estimate) |
| chain-sts, 2+ replicas with a PDB | Stateless Python; one TokenReview per exchange | $10–$50 (**estimate**) |
| KMS signing key | AWS: $1/key/month, plus $1/month for each of the first two rotations; Sign on asymmetric keys priced in AWS's ECC example at $0.15 per 10,000 requests. 1M exchanges/month is about $15, 10M about $150 | $2–$150 (**estimate**) |
| Logs and SIEM retention for audit lines | Depends on your platform | Marginal (**estimate**) |
| **Total infrastructure** | | **About $300–$1,500/month ($4k–$18k/year)** (**estimate**) |

Vendor reference points:

- Skycloak's own self-hosting estimate (updated 2026-10-20) is "a minimum of
  $1,230 per month" for a 3-node HA cluster with PostgreSQL. That includes
  only 3 hours a week of labor at $30/hour and excludes compliance audits. The
  source is a vendor.
- Managed Keycloak: Skycloak Business is $599/month for 2 clusters with a
  99.9% SLA, and Enterprise is custom (skycloak.io/pricing, 2026-10-21). A
  search result showed Exoscale's Glasskube Keycloak Professional, an HA setup
  with 2 nodes, at €379/month; that page was not opened (**unverified**).

### 4.3 People cost

- **Steady state:** about 0.2–0.5 FTE, or roughly **$30k–$125k a year**
  (**estimate**). It covers:
  - Keycloak upgrades. Minor releases come roughly quarterly (26.5.0 in
    January 2026, 26.6.0 in April 2026, 26.8.x by October), plus patch
    releases. Zero-downtime *patch* updates are supported since 26.6.
  - PostgreSQL upgrades and backups.
  - Signing-key rotation.
  - CVE triage for Keycloak and chain-sts dependencies.
  - Owning a security-critical custom service that sits on every agent call
    and fails closed.
  - Audit-log retention.
  - 24x7 on-call. chain-sts down means every agent call fails.
- **One-time productionization of chain-sts:** about 1–3 engineer-months
  (**estimate**). The estimate was made when every item below was open and is
  kept as it was; the status after each item is from chain-sts's README. It
  covers:
  - Key rotation with overlapping JWKS. Done in the dev cluster, by hand with
    `task sts:rotate:*` ([the rotation
    run](../../../agent-deployments/clusters/dev/platform/90-chain-sts/README.md#the-rotation-run-in-this-cluster));
    nothing rotates on a schedule.
  - KMS signing. Not done: described, not written.
  - Multi-replica HA and SLOs. The dev cluster runs two replicas with a
    PodDisruptionBudget, both on kind's one node ([Several
    replicas](../README.md#several-replicas)).
  - A narrower TokenReview ClusterRole. Done: `chain-sts-token-review`.
  - Drills and negative tests. Done in the dev cluster: `task sts:check`
    ([the checks](../../../agent-platform/tests/README.md)), `task
    demo:chain` and `task demo:backup:sts-down`.
  - A threat model and an external penetration test. The cost of an external
    pen test is **unverified**.

### 4.4 Red Hat build of Keycloak

Red Hat says it is "not available for purchase as a separate and distinct
product". It is entitled through Red Hat Runtimes, Red Hat Application
Foundations or OpenShift Container Platform (including OpenShift Platform Plus
and ROSA/ARO/OSD). Its usage "counts towards the cores" of those subscriptions
(access.redhat.com/articles/7044244, updated 2025-10-24). No public per-core
price for Runtimes was found (**contact Red Hat**). If you already have
OpenShift subscriptions with spare cores, the marginal license cost may be
zero. chain-sts has no vendor support in any case.

**All-in estimate:** about **$35k–$145k a year** (**estimate**: infrastructure
plus people), dominated by people. One-time hardening comes on top.

### 4.5 Cheaper variant: basic Okta + chain-sts, no Keycloak

Okta's org authorization server signs ID tokens that relying parties can
validate with its JWKS. Okta's ID-token validation guide covers that; it is
access tokens from the org AS that only Okta should consume. So chain-sts
could accept the user's **Okta ID token**, minted for the Chat UI's OIDC app,
as the first subject token, and issue every downstream token itself. That is
what Okta does with ID-JAG.

- **What it removes:** Keycloak and its database, which is about half the
  infrastructure and a share of the people cost.
- **What it costs:**
  - chain-sts must map Okta groups to `roles` and `team`, which Keycloak would
    do in the arrangement of section 4.1 (in this repository Keycloak's demo
    realm sets them itself).
  - ID tokens become subject tokens.
  - Custom profile claims in org-AS ID tokens are **unverified**. Groups
    claims are supported.
  - You still own the STS.
- **Rough cost:** about $20k–$90k a year (**estimate**).

## 5. Recommendation framework

### 5.1 When Okta for AI Agents (with API AM, bundled or bought) wins

- The O4AA per-user price times the number of agent users is below about
  $35k–$145k a year (**estimate**). Break-even (**estimate**):

  | Agent users | Break-even price (estimate) |
  |---|---|
  | 200 | ≈ $15–$60 per user per month |
  | 1,000 | ≈ $3–$12 per user per month |
  | 5,000 | ≈ $0.60–$2.40 per user per month |

- The platform team cannot staff on-call for a security-critical custom STS,
  or does not already run Keycloak and PostgreSQL in production.
- Compliance wants vendor attestations, agent governance (owners,
  certifications, kill switch), and one audit trail for humans and agents.
  Your cell, region and regulatory scope must not be among O4AA's exclusions
  (HIPAA per the SST, the Canada/India cells, the Government cells).
- Many agents call SaaS apps that support XAA, not just in-house MCP servers.
- Agents can hold a registered key, ideally a KMS-held key the pod reaches
  through cloud workload identity (**unverified** with Okta), or can publish a
  CIMD.

### 5.2 When Keycloak + chain-sts (or 4.5) wins

- A large user population with few agents. Per-user metering grows with
  people, not agents.
- Kubernetes-native agent identity with **no agent secret** is a hard
  requirement.
- You need exact control of the token: carried `roles`/`team`, service-account
  names in `act`, an `after` policy, `max_chain`, 5-minute tokens.
- You need chains deeper than Okta will confirm, or self-hosted or air-gapped
  clusters, or data residency outside O4AA's cells.
- The team already runs Keycloak and PostgreSQL 24x7, so the marginal people
  cost is near the bottom of the range.
- Affiliates or subsidiaries need the same agent platform. O4AA's terms say
  "Customer Use Only".

### 5.3 Decision steps

1. Get an O4AA quote per "User per Month" for the realistic number of agent
   users. Also get the API AM price for any non-agent tokens.
2. Compare it with the self-host range above (an **estimate**), adjusted for
   your FTE rate.
3. Check the compliance exclusions.
4. Test the four functional unknowns in an O4AA trial org:
   - Chain depth of 3 or more.
   - Carried user claims.
   - Kubernetes or keyless agent authentication.
   - Rate limits at expected peak.

### 5.4 Questions for Okta sales

1. **Price and metric.** What is the list and quoted price per O4AA "User per
   Month", and how is a User counted? For example: is every user assigned to
   the Chat UI app counted, and are machine subjects (like our Alertmanager
   hook) counted? What are the minimum quantity, the term, and the multi-year
   or prepay discounts? Is O4AA – Core cheaper?
2. **API AM scope.** Does the API AM inside the O4AA SKU cover every custom
   authorization server we need for agent → agent and agent → MCP tokens? Does
   it also cover users calling the gateway with their own tokens, given SST
   4.1.2? If not, what does a separate API AM cost? How many custom ASes are
   included, and what is the M2M token allowance?
3. **Chain depth.** What is the maximum `act` depth? Is user → agent → agent →
   agent → MCP supported in the *user-access* flow, not only machine access?
   Does it work with multi-resource ("Multi-MCP") authorization servers, which
   the docs say support only user access?
4. **Carried claims.** Can custom AS claims (groups or roles, `team`,
   `preferred_username`, `email`) be added to tokens issued from an ID-JAG
   through the JWT-bearer grant, and do they reflect the original user at
   every hop?
5. **Kubernetes identity.** Can an AI agent authenticate with a Kubernetes
   projected service-account token (an external OIDC issuer or JWKS URL, or
   workload identity federation)? If not, when? Is `jwks_uri` or a KMS-held
   key supported for agent credentials, and how do we rotate keys without
   downtime? Can OPA workload connections (Kubernetes) supply agent
   credentials?
6. **Rate limits.** What are the per-minute quotas on the org AS and custom AS
   token endpoints for our edition and license count? Does each hop count
   twice? What does "Reasonable Use" (SST 2.1.4) mean in numbers? What does an
   increase or DynamicScale cost on Workforce?
7. **Audit.** What are the exact System Log event types for ID-JAG issuance
   and JWT-bearer redemption? Does each event carry the full `act` chain,
   user, agents, resource, scopes, and refusals? Is log streaming included?
   What retention is available beyond 90 days?
8. **First hop.** The first hop requires an ID token minted for the requesting
   agent. How does a user or CLI call a downstream agent directly (for
   example, our
   [`demo/scenarios/drive.py`](../../../demo/scenarios/drive.py))? How are
   "delegation links" configured for machine-started chains?
9. **Token lifetime.** Can agent access tokens be set to 5 minutes? Does
   Universal Logout or the kill switch revoke chain tokens that did not go
   through Agent Gateway?
10. **Compliance.** The SST excludes O4AA from HIPAA standards and the
    Canada/India cells, but the product page says the full SKU is for HIPAA.
    Which is current for our cell? Can affiliates use it?
11. **Automation.** Do Terraform and the Management API cover AI agents,
    resource connections, delegation links and key rotation, so we can keep
    the setup in Git?
12. **Trial.** Is there a trial or preview org with O4AA and Agent-to-Agent
    enabled for a proof of concept? Is Premier Support required at our spend,
    and at what percentage?

## Comparison table

| Dimension | Basic Okta (today) | Okta for AI Agents (incl. API AM) | Keycloak + chain-sts (self-run) | Basic Okta + chain-sts (no Keycloak) |
|---|---|---|---|---|
| Access tokens for our APIs | No (org AS only) | Yes (custom AS) | Yes | Yes (chain-sts issues them) |
| User `sub` plus nested `act`, newest outermost | No | Yes (documented, 2-agent examples) | Yes | Yes |
| Chains of 3+ agents | No | Not documented: **unverified** | Yes, up to `max_chain` (the dev cluster's `after` rules allow two agents) | Yes |
| Carries `roles`/`team` | n/a | Not documented: **unverified** | Yes | Yes, if mapped from Okta groups |
| Agent identity from a Kubernetes SA token | No | Not documented; needs key, secret or CIMD | Yes (TokenReview; Keycloak 26.6 also supports it) | Yes |
| Per-route or per-resource audience | No | Yes (RFC 8707; Multi-MCP AS, GA 2026-10-06) | Yes (allowlist) | Yes |
| Token calls per hop | n/a | 2 (org AS and custom AS) | 1 | 1 |
| Audit of each exchange | n/a | System Log, 90 days; exact events **unverified** | JSON audit line; you keep it | Same |
| Governance (owners, reviews, kill switch) | No | Yes | No | No |
| Compliance attestations | Okta's | Okta's, with SST exclusions (HIPAA, CA/IN cells, gov cells) | Yours | Yours |
| License cost | Already paid | Contact sales; per "User per Month"; $1,500/yr Workforce minimum | RHBK only via OpenShift/Runtimes cores; else none | None beyond basic Okta |
| Run and people cost | n/a | Low ops; integration work plus agent key management | About $35k–$145k/yr (**estimate**) | About $20k–$90k/yr (**estimate**) |
| Biggest risk | Can't do it | Price unknown; metric grows with users; K8s identity gap; rate limits | Owning a security-critical STS on every call | Same, with ID tokens as subject tokens |

## Sources

All accessed 2026-10-21 unless noted.

### Okta pricing, terms and announcements

| URL | Date of content | Supports |
|---|---|---|
| https://www.okta.com/pricing/ | Live page, 2026-10-21 | Suite prices ($6, $14, $17, contact sales); $1,500 minimum; API AM add-on or included in Enterprise; O4AA listed without price |
| https://www.okta.com/content/dam/okta---digital/en_us/legal/okta-service-specific-terms-06-12-2026.pdf | Rev. 06/12/2026 | O4AA and O4AA – Core SKUs include API AM; "Users per Month" metric; scope limit; Customer Use Only; exclusions; Reasonable Use; Auth0 OBO RPS and Auth0 for AI Agents add-on terms |
| https://wiki.licenseware.io/wiki/okta-privileged-access-and-ai-agents-licensing/ | Retrieved by the author 2026-10-06 | PSRG definition of an O4AA User; legacy agent-connection metric; M2M tokens per year (secondary) |
| https://www.okta.com/newsroom/press-releases/showcase-2026/ | 2026-03-16 | O4AA GA 2026-04-30; API AM as a supporting feature |
| https://www.okta.com/en-gb/newsroom/press-releases/okta-brings-first-class-identity-to-ai-agents-with-agent-sso/ | 2026-08-24 | Agent SSO GA at no additional cost; O4AA a separate subscription, GA since May 2026 |
| https://support.okta.com/help/s/article/okta-introduces-agent-sso-for-cross-app-access-xaa | Updated 2026-09-30 | Agent-to-agent requires O4AA; "Applies To" includes API AM |
| https://s205.q4cdn.com/566291348/files/doc_events/2026/Sep/23/Okta-Oktane-2026-Announcements.pdf | September 2026 | Agent-to-Agent GA; Agent Gateway GA Q3 CY26; kill switch GA Q4 CY26; Agent SSO no extra cost; OPA Kubernetes EA Q1 CY27 |
| https://www.okta.com/blog/product-innovations/ | Entries through 2026-10-08 | GA dates: Agent-to-Agent (2026-07-21), CIMD (2026-10-01), Multi-MCP Custom Auth Servers (2026-10-06), Agent Gateway (2026-10-08) |
| https://www.okta.com/en-au/newsroom/articles/okta-july-2026-product-innovations/ | 2026-07-22 | Agent-to-Agent GA; "chain of custody directly into the token" |
| https://www.okta.com/blog/product-innovation/securing-agent-to-agent-connections/ | 2026-06-17 | The audit log records the delegation chain per call; EA at the time |
| https://www.okta.com/products/govern-ai-agent-identity/ | Live page | Core vs. full SKU; HIPAA claim that conflicts with the SST |

### Okta developer docs, help and support

| URL | Date of content | Supports |
|---|---|---|
| https://developer.okta.com/docs/guides/ai-agent-token-exchange/-/main/ | Undated (© 2026) | O4AA prerequisite; two-step exchange; nested `act` with `sub_profile`; lifetimes; delegation links; client assertion |
| https://developer.okta.com/docs/guides/ai-agent-token-exchange/authserver/main/ | Undated (© 2026) | ID token must be minted for the requesting agent; multi-resource AS supports user access only; `act` nesting |
| https://developer.okta.com/docs/guides/xaa-request-token-ex/main/ | Undated (© 2026) | ID-JAG claims; private_key_jwt or client secret |
| https://help.okta.com/oie/en-us/content/topics/ai-agents/ai-agent-add-manually.htm | Live page | Agent client-registration methods; custom AS needed for machine access |
| https://help.okta.com/oie/en-us/Content/Topics/privileged-access/pam-configure-workload-connection.htm | Live page | OPA workload connections: Kubernetes and generic JWKS providers; OPA tokens |
| https://developer.okta.com/docs/api/resources/oauth-clients | Live page | `jwks_uri` field on OAuth clients |
| https://support.okta.com/help/s/article/oidc-does-okta-support-the-resource-parameter-and-audience-switching | Updated 2026-08-21 | RFC 8707 audience switching |
| https://support.okta.com/help/s/article/on-behalf-of-token-exchange-requires-use-of-two-custom-authorization-servers | Live page | OBO needs two custom ASes and API AM |
| https://developer.okta.com/docs/guides/validate-access-tokens/main/ and https://developer.okta.com/docs/guides/validate-id-tokens/main/ | Live pages | Org-AS access tokens are for Okta only; ID tokens can be validated with the JWKS |
| https://support.okta.com/help/s/article/how-the-rate-limits-work-for-authorization-servers | Updated 2026-06-04 | Separate org AS bucket; shared custom AS bucket |
| https://developer.okta.com/docs/reference/rl2-token-oauth/ | Live page | 50% per-app default |
| https://developer.okta.com/docs/api/getting_started/rate-limits | Live page | Quotas vary by subscription, licenses and DynamicScale; 1,200/min authorize example |
| https://developer.okta.com/docs/reference/rl-global-enduser | Live page | 4/s per-user limit on `/oauth2/v1/token` |
| https://support.okta.com/help/s/article/Exporting-Okta-Log-Data and https://support.okta.com/help/s/article/Okta-Data-Retention-Policy | Policy dated 2025-10-01 | 90-day System Log retention |
| https://support.okta.com/help/s/article/view-oauth-and-oidc-token-grant-events-for-a-specific-okta-application | Live page | Token-grant event prefixes |
| https://learning.okta.com/control-access-and-audit-agent-activity | Undated | System Log shows M2M token grants and XAA token exchange events |

### Third-party Okta pricing and news

| URL | Date of content | Supports |
|---|---|---|
| https://www.corma.io/blog/okta-pricing | 2026-10-05 (prices checked 2026-09-28) | No public add-on prices; Premier Success percentages (secondary) |
| https://vendr.com/buyer-guides/okta | Updated February 2026 | Median spend; discount ranges |
| https://www.zluri.com/blog/okta-pricing | Updated 2026-01-08 | API AM estimate for 200 users (**unverified**) |
| https://supertokens.com/blog/okta-pricing-the-complete-guide | 2024-07-02 | Historical API AM $2/user/month (stale) |
| https://www.aimagicx.com/blog/okta-ai-agents-identity-permissions-2026 | 2026-04-17 | The "$6/agent/month" claim (**unverified**; conflicts with the SST) |
| https://workos.com/blog/okta-vs-workos-agent-identity-enterprise-authentication | 2025-11-03 | Agentic pricing not disclosed |
| https://tech-insider.org/entra-id-vs-okta-mindshare-gap-2026/ | 2026-10-17 | Agent SSO GA 2026-08-24; no price |

### Auth0

| URL | Date of content | Supports |
|---|---|---|
| https://auth0.com/pricing | Live page | Auth0 for AI Agents add-on (+50%); starting prices; Custom Token Exchange plan |
| https://auth0.com/docs/secure/call-apis-on-users-behalf/on-behalf-of-token-exchange | Live page | Nested `act`, maximum depth 5; 30 RPS; Custom API clients |

### Keycloak, Red Hat and AWS

| URL | Date of content | Supports |
|---|---|---|
| https://access.redhat.com/articles/7044244 | Updated 2025-10-24 | RHBK entitlement only through Runtimes, Application Foundations or OpenShift; counts toward cores |
| https://www.keycloak.org/docs/26.6.4/release_notes/ | 26.6.x | Federated client authentication with Kubernetes SA tokens supported; zero-downtime patch updates |
| https://www.keycloak.org/2026/01/keycloak-2650-released and https://www.keycloak.org/2026/04/keycloak-2660-released | 2026-01, 2026-04 | Release cadence (from URLs in search results) |
| https://www.keycloak.org/high-availability/single-cluster/concepts-memory-and-cpu-sizing | Current guide (26.8.1 selectable) | CPU, memory and database sizing rules |
| https://aws.amazon.com/kms/pricing/ | Live page | $1/key/month; rotation charges; $0.15 per 10,000 in the ECC signing example |
| https://docs.aws.amazon.com/kms/latest/developerguide/requests-per-second.html and https://aws.amazon.com/about-aws/whats-new/2024/07/aws-kms-increases-default-service-quotas-cryptographic-operations | 2024-07 announcement | RSA/ECC quota 1,000/s default, adjustable |
| https://skycloak.io/blog/what-is-the-cost-of-self-hosting-keycloak/ | Updated 2026-10-20 | Vendor self-host estimate, $1,230/month minimum |
| https://skycloak.io/pricing/ | Live page | Managed Keycloak $599/month Business (2 clusters, 99.9% SLA) |

### This repository

| File | Supports |
|---|---|
| [`components/chain-sts/README.md`](../README.md) | chain-sts token shape, rules, policy, audit line, replicas, key rotation, the TokenReview grant, and "What is not done"; the Keycloak 26.8.1 delegation test |
| [`agent-deployments/clusters/dev/platform/90-chain-sts/README.md`](../../../agent-deployments/clusters/dev/platform/90-chain-sts/README.md) | The dev cluster's two replicas and PodDisruptionBudget, ClusterRole `chain-sts-token-review`, and the rotation run of 2026-10-21 |
| [`agent-deployments/clusters/dev/platform/90-chain-sts/policy.yaml`](../../../agent-deployments/clusters/dev/platform/90-chain-sts/policy.yaml) | The dev cluster's agents, their `after` rules, and `max_chain: 4` |
| [`docs/contracts.md`](../../../docs/contracts.md) | Keycloak stands in for Okta; the claims `preferred_username`, `roles` and `team` |
| The chain-sts design note (working material, not in this repository) | Okta as Keycloak's upstream IdP; groups mapped to `roles`/`team` |
