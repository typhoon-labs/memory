# AgentCore publishing and deployment examples

Status: Illustrative flows for the proposed architecture. Updated 5 October 2026.

These examples show which repositories change, which artifacts and resources are affected, and how failures are contained. Versions, component names and evidence are illustrative. None of the examples represents a deployment performed or a test result obtained.

## A service publishes only skills and prompts

The payments team owns an existing REST API. It wants to publish API guidance and an explanation template without running an agent or MCP server.

1. In `payments-agent-assets`, the team updates `skills/use-payments-api/SKILL.md`, reference material, and `prompts/explain-payment/template.txt`. It sets bundle version `1.4.0` in `assets.yaml` and declares compatibility with payments API major version 2.
2. Publisher CI validates prompt variables and exercises service fixtures. It checks error guidance, required authentication, unsafe input and script behavior. It does not require a deployed consumer agent.
3. CI publishes the complete directory tree under `s3://agent-assets/payments/1.4.0/` and a manifest hashing every file. The publisher cannot overwrite an existing released version with new bytes.
4. CI proposes a dev publication under `agentcore-deployments/accounts/dev/us-east-1/publications/payments/publication.yaml`.
5. Applying the publication unit creates only catalog records and metadata references. No runtime, memory, gateway or MCP target is created.
6. After review, a separate shared-services publication change registers the same immutable artifacts in the approved catalog. Production consumers remain on their existing pins.

| Change | Owner | Result |
|---|---|---|
| Content and compatibility declaration | Payments team | Tested service guidance |
| Artifact upload | Publisher CI role | Immutable bundle and manifest |
| Catalog publication | Publication deployment unit | Versioned SKILL and CUSTOM records |
| Consumer adoption | Each agent team | Separate later release |

If fixture tests fail, nothing is published. If catalog creation fails after upload, artifacts remain for a safe publication retry. If a curator rejects the publication, current consumers remain unchanged.

## An agent adopts a new service asset version

The finance assistant currently pins payments assets `1.3.0`. Its team decides to adopt `1.4.0`.

1. A merge request (MR) to `finance-assistant-agent` updates the dependency pin and expected manifest hash. It also updates agent scenarios if the asset adds a new task.
2. Agent CI resolves the content and verifies required client/tool capabilities. An agent without a refund-capable client cannot adopt a skill that assumes that capability simply by downloading it.
3. CI publishes finance assistant release `2.1.0`, recording the payments asset hashes, prompt composition, model configuration, dataset and workload policy references.
4. A dev deployment MR sets `candidate_release` to `2.1.0` while keeping `active_release` at `2.0.0`. Candidate memory and tool bindings are selected explicitly.
5. Tests run the complete candidate agent for authorized and unauthorized test users. Evidence records both the release hash and dev binding revision.
6. Dev activation updates the selected release through Terraform. Stage and prod repeat readiness, identity and acceptance checks with the same artifacts and their own bindings.

Loading a prompt template does not grant new payments permissions. Role changes, if required, are separate reviewed changes in `access/roles.yaml` and downstream authorization.

If agent evaluations fail, payments publication `1.4.0` can remain available for other compatible consumers. Finance stays on its previous release. Publication status and consumer deployment status are independent.

## A team adds a restricted MCP refund tool

The tool team adds `issue_refund` to `payments-mcp`. The finance assistant will consume it through a governed gateway.

1. The MCP repo changes server code, tool schema, workload policy template and tests. Inputs include payment ID, integer amount in minor units, currency and idempotency key.
2. Service tests prove payment ownership, duplicate handling, cumulative limits and downstream entitlement enforcement. Policy tests prove an analyst is denied and an authorized approver can request a permitted test refund.
3. CI publishes MCP release `3.0.0` with image digest, schema and policy hashes. A tool-name or schema change is evaluated as a compatibility change.
4. A dev deployment MR creates the candidate server and a target on an isolated candidate gateway. Its policy uses the candidate action names and the current platform baseline.
5. Candidate tests call the tool through that gateway using test tenants. They also attempt direct runtime invocation to prove the gateway cannot be bypassed.
6. After approval, the gateway/server pair that was tested becomes the approved versioned binding; nothing is redeployed between evaluation and approval. Each consumer adopts that binding through its own tested agent release.
7. Retain the prior gateway/server for consumers still using it. Retire it only after consumer references and active sessions permit removal.

This example intentionally uses versioned consumer bindings. It does not split aggregated MCP traffic with HTTP weighted routing. The pilot must quantify the temporary resource cost and operational effort of this isolation approach.

A provider/module upgrade needed for the new target is reviewed as a platform change. Applying that upgrade must not quietly modify shared active gateway behavior during tool evaluation.

## A candidate fails evaluation

Finance assistant `2.1.0` passes deployment readiness but fails a regression scenario because the new prompt suggests an unsupported refund path.

| Item | Required outcome |
|---|---|
| Active selection | Remains `2.0.0` |
| Active skill/prompt bytes | Remain pinned to the previous hashes |
| Active tool target and workload policies | Remain unchanged |
| Production memory | Receives no candidate evaluation writes |
| Candidate status | Quarantined with failed evidence |
| Catalog | Candidate endpoint is not advertised as active |

The team corrects the source and publishes a new version. It does not replace the bytes of `2.1.0` or reuse its passing evidence. Cleanup can remove failed candidate resources once diagnostic retention and shared-reference checks permit it.

If any active dependency changed during this flow, the architecture failed the isolation experiment even though the live endpoint never moved. Record and redesign that mutation path.

## A production release is rolled back

Finance assistant `2.1.1` is active when an incident reveals poor behavior that escaped the release dataset.

1. The incident owner identifies affected release, content, bindings and downstream operations. Unsafe write capabilities can be disabled independently when rollback alone would leave them unsafe.
2. The agent and platform owners identify retained release `2.0.0` and verify that its image/content, API compatibility and gateway binding still exist.
3. An expedited deployment MR selects `2.0.0` with the compatible bindings. The current baseline security controls remain in force.
4. Terraform applies the selection. Operators verify actual routing/content and run authorization and task smoke checks.
5. Existing sessions are drained or explicitly handled according to the tested session policy. Logs record the recovered selection and actual recovery time.
6. Any real refunds or changed memory are investigated separately. Rollback does not reverse completed business transactions.

If prior dependencies are incompatible or unavailable, use an explicitly reviewed corrective release or disable the affected path. Do not claim a successful rollback merely because an endpoint points at an older runtime version.

## A shared platform upgrade affects multiple consumers

The platform team upgrades gateway or identity configuration in `agentcore-platform` and proposes the new platform pin in dev.

The review lists consumers of the affected resources, replacement-sensitive fields, changed claims/schema contracts, and migration order. Tests include representative consumers and negative authorization cases. Workload and baseline policy ownership stay distinct.

Promote the platform change independently of unrelated component releases. If replacement is required, build parallel resources and migrate consumers before retirement where the service supports it. Stateful replacement needs a migration plan and cannot be disguised as ordinary release rollback.

## Review questions for every example

For each flow, reviewers should identify the state owner, artifact identity, user/service principal, evidence binding, activation mutation, rollback dependency and cleanup condition. An unknown answer becomes an item in the [validation plan](validation-plan.md), not an implied guarantee.
