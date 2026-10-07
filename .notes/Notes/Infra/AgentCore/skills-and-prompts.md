# Service skills and prompt publishing

Status: Proposed publication and consumer contract. Updated 5 October 2026.

A service team can publish skills and prompts without publishing an agent or MCP server. Its repository owns guidance for using its existing API. The platform supplies packaging, artifact storage, catalog publication, and review conventions; consumers choose when to adopt a release.

## Ownership and package boundaries

Use `<service>-agent-assets` for an independent content repository, or `agent-assets/` inside the service API repository when ownership and releases are coupled. Shared organizational content may have a separate owner and repository later.

| Asset | Meaning | Consumer responsibility |
|---|---|---|
| Skill | Instructions, references and optional scripts for a task | Load approved version and constrain execution permissions |
| Prompt template | Task-specific text with declared inputs and outputs | Validate variables and choose composition point |
| Compatibility contract | Supported service/API/tool versions and capabilities | Verify dependencies before release |
| Publication manifest | Artifact locations, hashes and provenance | Resolve and verify exact content |

An asset version describes a content release; it does not create API credentials or enable a tool. A consumer may use an approved REST client directly or an existing governed tool integration. The connection must satisfy the [identity design](identity-and-authorization.md).

A skill that ships scripts is executable code, not only guidance. AWS states that any code running in the runtime microVM can obtain the execution role's credentials, so a publisher's script runs with the consumer agent's permissions. Treat script-bearing skills as a code dependency: review the scripts at publication, and let a consumer reject bundles that contain them. [AWS runtime security guidance](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/runtime-security-best-practices.html)

## Proposed asset declaration

Illustrative internal YAML, not an AWS resource schema:

```yaml
schema_version: 1
service: payments
owner: payments-team
bundle_version: 1.4.0
compatibility:
  api_major: 2
  client_capabilities: [payment_lookup, refund_request]
skills:
  - name: use-payments-api
    path: skills/use-payments-api
prompts:
  - name: explain-payment
    path: prompts/explain-payment/template.txt
    variables:
      payment_status: {type: string, required: true}
      locale: {type: string, required: true}
    output_contract: plain-language-explanation
```

Start with a single version for the service bundle. Introduce independent asset versions only when separate release cadences justify the dependency complexity. Compatibility declarations are claims backed by tests, not guarantees inferred from semantic version numbers.

## Artifact layout and integrity

```text
s3://agent-assets/payments/1.4.0/
├── manifest.json
├── skills/use-payments-api/
│   ├── SKILL.md
│   ├── references/api-guide.md
│   └── scripts/
└── prompts/explain-payment/
    ├── prompt.yaml
    └── template.txt
```

Publish a complete directory tree for harness S3 loading; an archive may be provided as an additional build artifact. The consumer must not assume an uploaded ZIP is directly usable as a harness skill source.

Generate per-file hashes and record source commit, publisher identity, schema version, supported API versions and test evidence. Reject reuse of a published version with different content. Use enforced object/prefix immutability and retention appropriate to the release policy, or copy verified content into an immutable consumer artifact. A directory URI alone does not perform content-integrity verification.

Artifact publishers can write only their service namespace. Execution roles read approved dependency prefixes with scoped bucket and KMS access. Test artifact tampering, deletion, missing references, and unsupported scripts before rollout.

## Publication workflow

1. Service CI validates skill frontmatter, links, scripts, prompt variables and contracts.
2. Tests exercise service fixtures or a test tenant and check instructions against the API contract.
3. CI creates immutable content and a manifest, then proposes a publication in `agentcore-deployments`.
4. Terraform creates the records through `asset-publication`, using verified provider support.
5. Publication review checks provenance, ownership, compatibility, evidence and data sensitivity, and reviews any scripts as code.
6. Approval exposes the publication to authorized consumers; no consumer configuration changes automatically.

Proposed `publication.yaml` fields are service, manifest URI/hash, destination registry, asset names/versions, owner, classification, and evidence reference. The registry record may repeat discoverable metadata, but the manifest remains the source for exact artifact content.

Registry supports `SKILL` and `CUSTOM` records; prompts use an internal custom schema. Skill records do not store the remaining bundle files. The registry is moving to a new namespace; see the [catalog lifecycle](release-and-promotion.md#catalog-lifecycle). [AWS registry descriptors](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/registry-supported-record-types.html)

Use a distinct catalog record per asset version; one `publication.yaml` per service lists the versions registered in a catalog. Confirm exact uniqueness and provider lifecycle behavior in the pilot. Catalog retirement does not revoke already downloaded content or prevent a pinned consumer from using it. An urgent security revocation needs deployment and execution controls in addition to catalog removal.

## Consumer adoption and prompt composition

An update bot can open a consumer merge request (MR) that changes a version pin. The agent build verifies artifact integrity and compatibility, then tests the complete agent using that content. Its manifest records the resolved files or immutable references. A deployment MR selects the resulting agent release.

Harnesses support four skill sources (pre-built AWS Skills, Git, S3 and filesystem paths) and fetch skill content once per session. The proposal favors immutable S3 paths or skills baked into a runtime image to make dependency selection reproducible. [AWS harness skill loading](https://docs.aws.amazon.com/bedrock-agentcore/latest/devguide/harness-skills.html)

Service prompts are task templates. Declare variable types, size limits, sensitivity rules, output expectations, and how untrusted service data is inserted. Treat user/service text as data rather than instructions. Consumer system instructions remain agent-owned. The harness integration must prove that the selected prompt composition approach is supported; custom runtimes can implement the rendering explicitly.

## Tests and breaking changes

Publisher tests verify accurate API guidance, prompt rendering, script behavior, authentication failures and compatibility. Consumer tests verify tool selection, task outcomes, policy adherence and interactions with other content. Passing publisher tests cannot replace consumer tests.

Version breaking changes when variables, output contracts, required tools, authentication assumptions or API compatibility change. Maintain previous supported releases through an agreed transition period. Record migration guidance and known affected consumers. Security fixes may require accelerated adoption, with a named incident owner and explicit approval.

## Failure and retirement

| Failure | Proposed response |
|---|---|
| Validation or service tests fail | Publish nothing; correct the source |
| Partial upload | Keep incomplete version unavailable; retry with integrity checks |
| Catalog publication fails | Retain artifacts; repair the publication without changing consumers |
| Consumer evaluation fails | Keep its current content pins |
| Published guidance is unsafe | Stop new adoption, notify owners through the agreed process, remediate deployed consumers |
| Service retires an API version | Identify consumers, migrate dependencies, then retire publication and artifacts |

Retirement requires reference-aware cleanup. Preserve files needed by active releases, rollback windows, audit evidence and explicitly supported older consumers.
