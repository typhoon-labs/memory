# Identity, delegation and the interoperability profile

| | |
|---|---|
| Status | Proposal. The profile is a contract that any future STS or IdP product must pass |
| Updated | 4 November 2026 |
| Versions checked | Keycloak **26.8.1** (13 October 2026; the demo runs 26.7.5). MCP specification revision **2026-07-28**. RFC 8693, 8707, 8414, 9068, 8725, 9700, 9728, 9207. IETF drafts as listed. Okta, Ping and Solo documentation read 4 November 2026 |

## Decision

1. **Okta or Ping stays the source of people**, on the tier the organization
   already licenses: sign-in, MFA, groups, the immutable user ID and
   deprovisioning.
2. **Keycloak is the platform's authorization server and IdP broker.** It
   issues access tokens for platform audiences, which a base-tier Okta
   cannot (Okta's org authorization server issues tokens only for Okta's own
   APIs; custom authorization servers need the API Access Management add-on).
   This is the demo's production design (`docs/production-design.md`,
   section 1.5), and this review agrees with its reasoning.
3. **chain-sts stays narrow:** RFC 8693 delegation only, per-target tokens,
   five-minute lifetime. Keycloak cannot replace it today (below).
4. **The profile in this page is the boundary.** chain-sts is replaceable by
   any product that passes the conformance suite, and the decision to buy
   one is a test result, not a feature list.
5. **Upgrade Keycloak to 26.8.1 before the pilot.** It fixes
   CVE-2026-97846 ("Standard Token Exchange bypasses required mTLS certificate
   binding") and an introspection bug that dropped `act` on delegated tokens.

## Principals and canonical identity

| Principal | Proven by | Token the gateway sees | Canonical identifier |
|---|---|---|---|
| Person | IdP sign-in and MFA, brokered by Keycloak | Keycloak access token | Keycloak `sub`, pinned in realm-as-code; `idp_sub` carried for joins to the IdP |
| Agent acting for a person | Its Kubernetes service account (projected token, audience chain-sts, TokenReview) | chain-sts token: `sub` = person, `act.sub` = agent | Person's `sub`; agent's `system:serviceaccount:<ns>:<name>` |
| Workload acting for itself (automation, schedules, alerts) | Projected service-account token as client assertion at Keycloak (federated client authentication, supported since 26.6) | Keycloak client-credentials token | Keycloak client ID, mapped 1:1 to the service account |
| Workload that cannot carry a token (last resort) | Gateway-issued key, stored as a hash | None (key at the gateway) | Key ID, mapped to an owner and workflow in the catalog |
| Any workload calling AWS | EKS Pod Identity (AWS recommends it over IRSA where available) | Not applicable: SigV4 to AWS | IAM role ARN with session tags |

Rules:

- **AWS credentials never carry user identity,** and user tokens never reach
  AWS. Bedrock is called only by the gateway's role. Attribution to a user
  reaches AWS only through `AssumeRole` session tags set by the gateway.
- **`sub` is the join key across issuers.** Keycloak and chain-sts both issue
  tokens whose `sub` is the Keycloak user ID. Separation of duties and audit
  join on `sub` alone, as the demo found (`docs/production-design.md`, section
  2.5). If a second subject issuer is ever trusted, chain-sts adds the
  subject issuer as a claim and the key becomes the pair.
- **Users are disabled, never deleted,** and Keycloak's database is backed up,
  because `sub` lives there.
- **Accounts link by the IdP's immutable ID only,** never by email.
  **Observed in the demo:** a corp user whose email matched a local user was
  refused with HTTP 409.

## The interoperability profile

Three levels. **Required** is what every issuer, verifier and replacement
must do. **Optional profile** is adopted per environment once tested.
**Policy** is this organization's choice and lives in configuration, not in
the standard.

### Required

| # | Requirement | Source |
|---|---|---|
| R1 | Authorization servers publish RFC 8414 metadata (or OIDC discovery) at an HTTPS issuer reachable from clients and the gateway | RFC 8414; MCP 2026-07-28 |
| R2 | Access tokens are JWTs signed with an algorithm from a pinned allowlist per issuer (RS256 or ES256 today); `none` and symmetric algorithms rejected | RFC 8725 §3.1, §3.2 |
| R3 | Every access token has `iss`, `sub`, `aud`, `exp`, `iat`, `jti`; verifiers check `iss`, `aud`, `exp` and the algorithm | RFC 8725 §3.8, §3.9; RFC 9068 §2.2 |
| R4 | **Explicit typing.** Access tokens carry `typ: at+jwt`; chain tokens carry `typ: at+jwt` or a private type, and verifiers reject ID tokens and untyped tokens on every route. Keycloak's `at+jwt` is a per-client option, off by default: turn it on. chain-sts 0.2.1 emits `typ: JWT` and must change | RFC 9068 §2.1; RFC 8725 §3.11; rfc8725bis says `JWT` is not explicit typing |
| R5 | **One audience per token for hop tokens.** A token used at a route or MCP server is issued for exactly that resource (RFC 8707 `resource` = canonical URI). MCP servers reject tokens not issued for them | RFC 8707; MCP 2026-07-28 ("MUST validate that access tokens were issued specifically for them") |
| R6 | **No token passthrough to a different audience.** A component that calls another resource obtains a new token for it. The gateway forwarding a token to the backend the token was issued for is not passthrough in this sense | MCP 2026-07-28 ("MUST NOT accept or transit any other tokens") |
| R7 | **Delegation, not impersonation.** A token obtained by an agent for a person carries the person as `sub` and the agent as `act.sub`. Impersonation is refused | RFC 8693 §1.1, §4.1 |
| R8 | **Current actor only for authorization.** Access decisions use top-level claims and `act.sub`. Nested `act` (prior actors) is recorded for audit and never used to allow or deny | RFC 8693 §4.1 ("informational only") |
| R9 | **Exchanges only narrow.** Issued scope ⊆ subject token scope ∩ target policy; issued roles ⊆ subject roles; lifetime ≤ subject's remaining lifetime | RFC 8693 §2.1 (policy); this profile |
| R10 | **Delegation is authorized per agent, per target.** The STS refuses an agent not permitted to act on that target, or to follow the previous actor | This profile; RFC 8693 §4.4 `may_act` is one way to express it |
| R11 | Chain tokens live at most 300 seconds and carry no refresh token | This profile; RFC 9700 §2.2 (short-lived) |
| R12 | Actor authentication uses a projected service-account token with audience = the STS, lifetime ≤ 600 s, validated by TokenReview or JWKS plus a `jti` replay cache (Keycloak keeps none for Kubernetes assertions) | Keycloak federated client authentication docs; rfc7523bis |
| R13 | Interactive clients use authorization code with PKCE S256; no password grant; exact redirect matching; public-client refresh tokens rotated | RFC 9700 §2.1, §2.2.2, §2.4; MCP 2026-07-28 |
| R14 | MCP servers publish RFC 9728 protected-resource metadata and answer 401 with `resource_metadata`; insufficient scope answers 403 with all required scopes in one challenge | MCP 2026-07-28 |
| R15 | Signing keys rotate with overlap: the next key is published in JWKS at least 10 minutes before first use, the previous key stays until every token it signed has expired | Agentgateway refetches JWKS every 5 minutes and not on an unknown `kid` (issue #2798) |
| R16 | Clock skew tolerance at most 60 s at every verifier; hosts run NTP | RFC 7519; observed: gateway 60 s, services 30 s |

### Optional profiles (adopt after a test passes)

| # | Profile | When | Note |
|---|---|---|---|
| O1 | Sender-constrained tokens (DPoP) for user tokens held by desktop clients | When a harness supports DPoP to the gateway | Keycloak supports DPoP since 26.4; survival through exchange undocumented |
| O2 | Client ID Metadata Documents for third-party MCP clients | When clients that are not pre-registered must sign in | MCP: SHOULD; Keycloak: experimental. Do not build on DCR, which MCP 2026-07-28 deprecates |
| O3 | ID-JAG (Okta Cross App Access, MCP Enterprise-Managed Authorization) | When Okta or Ping issues ID-JAGs to the platform | Draft -06; Keycloak accepts only experimentally (draft -01); Okta caps 250 ID-JAGs per user per resource app per month without Okta for AI Agents |
| O4 | Transaction Tokens inside the trust domain | When the draft is published and a product supports it | Draft -11, IESG target December 2026 |
| O5 | Shared Signals (CAEP) from the IdP to end sessions | When the IdP supports it on the licensed tier | Would shorten the leaver window below the reconciliation interval |
| O6 | Per-request `AssumeRole` with session tags for Bedrock attribution | After latency at volume is measured | Agentgateway feature; fails closed |

### Policy (configuration, not standard)

- Which agent may act for which roles on which target, and after which
  previous actor (the demo's `act_for_users` and `after`).
- Maximum chain depth: 4 (the demo's value; Okta's limit is 5).
- Token lifetimes: user access token 15 minutes (the demo used 30); chain
  token 5 minutes; Keycloak SSO session 8 hours; offline sessions per task.
- Claim mapping: IdP groups with a naming convention (`app-agentplatform-<role>`)
  filtered at the IdP; `roles` and `teams` as arrays (the demo's single
  `team` string must change).
- Deactivation-to-refusal objective, for example 15 minutes, which sets the
  reconciliation interval.

## Keycloak, chain-sts and commercial options against the requirements

| Requirement | Keycloak 26.8.1 alone | chain-sts (built) | Okta (custom AS / for AI Agents) | Ping Identity for AI | Solo Enterprise STS |
|---|---|---|---|---|---|
| Platform-audience access tokens on base-tier IdP | Yes | No (not an AS) | Needs API Access Management | Edition-dependent | No (not an AS) |
| RFC 8707 `resource` on token exchange | **No** ("does not yet have support"); experimental `resource-indicators` flag on authorize and token endpoints only | Yes | To verify | To verify | Not documented |
| Delegation with `act` | **Preview** (`token-exchange-delegation`), consent via `may_act`; a token with `act` cannot be exchanged again | Yes, nested per hop | Yes, nested to 5 actors; agent exchange needs Okta for AI Agents | Yes (`act`, `may_act`) | Yes (Enterprise only) |
| Multi-hop chains | Not supported | Yes | Yes | Documented on the AI page | `act` nesting not documented |
| Narrowing only | `scope` can **add** scopes; narrowing needs the `downscope-assertion-grant-enforcer` policy | Today copies all claims: **must change** (R9) | To verify | To verify | To verify |
| Kubernetes service account as actor | Yes (federated client authentication, supported) | Yes (TokenReview) | Not documented | Not documented | Yes |
| Runs inside the organization's AWS account | Yes | Yes | No (SaaS) | Varies by product | Yes |
| License | Open source; Red Hat build for support | Code the platform owns | Add-on SKUs; **license to verify** | "Contact your account executive" | Separate Solo license |

Conclusion: no single product meets R5, R7, R8 and R10 with multi-hop chains
on base-tier licenses today. chain-sts fills that gap in about 1,750 lines of
Python, with 3,100 lines of tests, that the platform owns. It must change in four places before production:
explicit `typ` (R4), narrowing (R9), a `jti` replay cache for actor
assertions (R12), and a KMS signer with scheduled rotation (R15). Okta for
AI Agents or Ping Identity for AI are plausible replacements once licensed;
the conformance suite decides.

## Lifecycle events

| Event | Behavior | Bound |
|---|---|---|
| Role change at the IdP | Takes effect at the next IdP sign-in; Keycloak SSO and refresh keep the old roles meanwhile (**observed in the demo**) | Keycloak SSO session (8 h) unless the reconciliation job forces logout on group change |
| Leaver | IdP disable → reconciliation job disables the Keycloak user and ends sessions (**observed:** 0.12 s after the job ran) → refresh fails → last access token works until `exp` (**observed:** refused 1.2 s after `exp`) → chain tokens die with it (≤ 5 min) | Job interval + access-token lifetime. With 5-minute job and 15-minute tokens: 20 minutes |
| Agent or workload removed | Service account deleted → TokenReview fails → chain-sts refuses at once | Immediate for new exchanges; ≤ 5 min for issued chain tokens |
| Workload key compromised | Delete the key's hash entry at the gateway | Seconds (gateway config reload) |
| Signing key compromise | Remove the key from JWKS; verifiers refetch within 5 minutes | ≤ 5 min plus cache |
| Keycloak outage | New sign-ins and refreshes fail; issued tokens work until `exp`; chain-sts keeps exchanging valid subject tokens (it caches Keycloak's JWKS) | Access-token lifetime |
| chain-sts outage | Agents cannot call downstream for users; fail closed | Until restored (3 replicas, zone-spread) |
| JWKS endpoint unreachable at gateway start | Agentgateway fails initial config load (issue #3616) | Mitigate with cached JWKS and readiness gating |

### Token caching

- An agent may cache a chain token keyed by **(hash of the subject token,
  target)** until 30 seconds before `exp`, as chat-assistant does. Never key
  by user ID alone, never share a cache across replicas, never cache across
  subjects. A conformance test (CACHE-1) proves two users never receive each
  other's tokens under concurrency.
- Verifiers cache JWKS for at most 5 minutes and refetch on an unknown `kid`
  where the library allows.

### Long-running tasks

A task that outlives the user's access token must not hold a copy of that
token. Recommended, using standard capabilities:

1. At submission, the user's client requests `offline_access` for the
   workflow service's confidential client (consent screen names the task
   type). The workflow service stores the **offline refresh token**,
   envelope-encrypted with KMS, keyed by task ID.
2. At each step that acts for the user, the service refreshes to get a fresh
   user access token, exchanges it at chain-sts for the step's target, and
   discards both after the call.
3. The offline session is revoked at task end and at the task deadline. When
   the user is disabled, the reconciliation job also revokes the user's
   offline sessions through the admin API, so a refresh fails even before
   the job's next run would matter. (**To validate:** that Keycloak 26.8
   refuses an offline-token refresh for a disabled user without the explicit
   revocation; test LONG-1 covers both.)

Refresh tokens in Keycloak are bound to the client and need its client
authentication, so a stolen refresh token alone is not enough. The failure
mode is clean: a leaver's task fails at its next step with
`invalid_grant`, which the workflow records as "authorization lost" and
routes to a human.

Tasks that do not act for a user (scheduled reports, MR review) run as their
own workload identity and never need this.

### Downstream business authorization and approvals

The gateway decides whether a caller may reach a tool. The tool decides
whether this caller may do this thing to this resource now. For any write:

| Rule | Enforced by the executing tool |
|---|---|
| The approval record holds a digest of action name, canonical parameters and the target resource version (for example Helm revision or Deployment `resourceVersion`) | At approval |
| Approval expires (for example 30 minutes) | At execution |
| At execution, the tool recomputes the digest from the request and the **live** resource version; any difference refuses with "stale approval" | At execution |
| Proposer ≠ approver; approver ≠ executor where policy says so; compared on `sub` | At approval and execution |
| Execution is idempotent by operation ID; a replay returns the first result | At execution |
| The approval and execution are written to the audit stream before the response | At execution |

The demo's tool did the state machine, idempotency and proposer ≠ approver,
but not the digest, expiry, revalidation or separation at apply
([demo review](20-demo-review.md), gap 1).

## Executable conformance suite for any STS or IdP replacement

A black-box pytest suite in a container, parameterized by issuer URL, a test
user, two test agents' service accounts and two targets. It runs in CI
against chain-sts on every change, and against any candidate product before
a purchase decision. The same suite runs against the gateway and a reference
MCP server to prove verifiers.

| ID | Test | Pass condition |
|---|---|---|
| DISC-1 | Fetch RFC 8414 metadata | `issuer` matches the URL exactly; `token_endpoint`, `jwks_uri`, `grant_types_supported` includes token exchange |
| ALG-1 | Present a token signed with `none`, HS256, or an unlisted algorithm | Verifier rejects |
| TYP-1 | Present an ID token, or a token with `typ: JWT`, as an access token | Every route and MCP server rejects |
| AUD-1 | Exchange for target A; present at target B | B rejects |
| AUD-2 | Exchange with no `resource` and two configured targets | STS returns `invalid_target` |
| AUD-3 | Exchange naming a target outside the allowlist | `invalid_target` |
| ACT-1 | Agent A exchanges a user token | Result has `sub` = user, `act.sub` = A, no `may_act` leakage |
| ACT-2 | Agent B exchanges A's chain token for a target where B may follow A | `act.sub` = B, `act.act.sub` = A |
| ACT-3 | Policy allows target T only when the current actor is B; present a token whose current actor is A and prior actor is B | Rejected (prior actors are not used for allow) |
| DEL-1 | An agent not permitted on the target exchanges | Refused |
| DEL-2 | An agent appears twice in a chain, or the chain exceeds depth 4 | Refused |
| DEL-3 | Exchange without `actor_token` (impersonation attempt) | Refused |
| DEL-4 | Actor token for a deleted pod (TokenReview) | Refused |
| NAR-1 | Request a scope or role the subject token lacks | Not present in the result |
| NAR-2 | Subject token expires in 60 s | Result `exp` ≤ subject `exp` |
| LIFE-1 | Any chain token | `exp - iat` ≤ 300; no refresh token returned |
| REPL-1 | Reuse the same actor assertion `jti` | Second use refused |
| SKEW-1 | Token with `iat` 90 s in the future; with `exp` 30 s in the past | Both rejected (skew ≤ 60 s) |
| ROT-1 | Rotate the signing key per runbook during a 15-minute load test | Zero verification failures |
| ROT-2 | Sign with a key published less than 5 minutes ago | Documented failure mode observed; runbook prevents it |
| REV-1 | Disable the test user at the IdP | Refresh fails within the job interval; last access token refused ≤ 60 s after `exp`; chain exchange refused once the subject expires |
| OUT-1 | Stop Keycloak | Valid tokens keep working until `exp`; sign-in returns a clear error |
| OUT-2 | Stop chain-sts | Agent calls fail closed with a typed error, no fallback to the user's own token |
| CACHE-1 | 50 concurrent users through one agent replica | No user ever receives a token whose `sub` is another user's |
| LONG-1 | Long task across a token expiry | Step after expiry succeeds via offline refresh; after user disable, next step fails with "authorization lost" |
| MCP-1 | Unauthenticated MCP request | 401 with `resource_metadata`; metadata names the authorization server |
| MCP-2 | MCP client flow end to end with PKCE and `resource` | Token's `aud` = the MCP server's canonical URI |
| APR-1 | Approve a change, then change the live resource version, then execute | "Stale approval" refusal |
| APR-2 | Execute after the approval's expiry | Refused |
| APR-3 | Proposer approves own change; approver applies when policy forbids | Refused |
| APR-4 | Execute twice with the same operation ID | One effect; second returns the first result |
| AUDIT-1 | Any allowed or refused call | Audit record has `sub`, `act` chain, `jti`, `sid` where present, target, decision, operation ID |

A replacement that passes every Required test may replace chain-sts. A
failure in ACT, DEL, NAR, AUD or APR is disqualifying; a failure elsewhere
needs a recorded exception.
