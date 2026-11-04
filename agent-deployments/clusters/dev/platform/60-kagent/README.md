# kagent and Agent Substrate

> **Owner:** platform team · **Type:** runbook · **Checked:** 2026-11-03 against kagent and Agent Substrate 1.0.0-rc1

As built in the dev cluster. Releases and their order are in `helmfile.yaml`;
the charts' shared values are in `agent-platform/profiles/kagent/`. The one
agent that runs on it is `diagnosis-agent`
([`components/diagnosis-agent/`](../../../../../components/diagnosis-agent/README.md)).

- kagent 1.0.0-rc1, Agent Substrate 1.0.0-rc1, kagent-tools 0.3.0, since
  2026-11-02 (before: kagent 1.0.0-alpha17 on Substrate 0.6.0-alpha3). The
  runtime image (golang-adk) and the worker image are pinned by digest, and
  `scripts/tools.sh` checks `kubectl-ate` and the kagent CLI against the
  release's digests. 831 MiB in 18 pods after use, measured 2026-11-02
  (`ate-system` 423, `kagent` 395, `podcertificate-controller-system` 13);
  alpha17 held 841. Tasks: `kagent:install`, `kagent:uninstall`,
  `kagent:status`, `kagent:ui-secret`, `kagent:tools`, `kagent:ate`,
  `diagnosis-agent:deploy`, `diagnosis-agent:ask`, `diagnosis-agent:eval`,
  `diagnosis-agent:checks`, `diagnosis-agent:trace`.
- **Moving to another version has been a reinstall.** Substrate's upgrade
  runbook supports no move between minor releases before 1.0. From 0.6 to
  1.0 its migrations were squashed and its kinds moved from
  `ate.dev/v1alpha1` to `ate.dev/v1` without conversion, and kagent edited
  its one migration in place. So every agent, conversation and snapshot goes,
  and both databases are made again: `task kagent:uninstall`,
  `task kagent:install`, then the workloads that live in `kagent` again
  (`task diagnosis-agent:deploy`). Substrate's compatibility policy applies
  from 1.0.0, so whether rc1 moves to 1.0.0 in place is not yet known. The
  versions are a pair, read from kagent's `go/go.mod` at the tag: the
  installation page no longer names Substrate's. `scripts/uninstall.sh` also
  removes the alpha7 layout, and on the kind node, which outlives the
  uninstall, `/var/lib/ate/image-cache` and `/var/lib/ate/actors`: an atelet
  that finds an image cache in an older layout does not start, and the Actor
  directories of a former install are kept by the next one.
- **What rc1 needs besides the version numbers.** Changing those alone
  renders without an error and does not work:
  - Substrate's router takes mutual TLS only. The controller reaches it at
    `https://atenet-router.ate-system.svc:443` with its pod certificate, and
    the router admits callers by SPIFFE id, kagent's controller alone
    (`atenetRouter.ingressAllowedSPIFFEIDs` in the profile; empty refuses
    everyone).
  - Preview gate `PerTemplateSnapshotLocation`: kagent sets a snapshot
    location on every agent, and without the gate Substrate's API refuses it
    and no agent compiles.
  - `actorIdentityJWTProvider` is gone from the API server's
    `authentication.yaml`, which it now reads strictly.
  - `kubectl-ate` lost `--any-state`: any Actor can be deleted.
- **Checked by version.** What was run on alpha17 and rc1, with what
  result, is in
  [`docs/measurements.md`](../../../../../docs/measurements.md#kagent-and-diagnosis-agent-checked-by-version).
- **One database for both.** Neither chart deploys PostgreSQL any more. Only
  `kagent install` does, and it asks for a provider key, which the profile
  deliberately has none of. So release `kagent-postgresql` (chart
  `agent-platform/profiles/kagent/postgres`) runs it, from upstream's manifest,
  with client-certificate logins and no passwords, and
  `scripts/postgres-setup.sh` runs both projects' `setup.sql`. Its volume
  holds kagent's conversations and Substrate's Actors. Agentregistry keeps its
  own database, so a reinstall here does not touch the catalog.
- **Certificates** come from release `substrate-podcert`, in namespace
  `podcertificate-controller-system`. `scripts/bootstrap-identity.sh` creates
  its signing pools first, and no chart does. The four CA pools are Ed25519,
  as `kagent install` makes them, and the egress gateway's is ECDSA P-256.
  Each names its key type, because `kubectl-ate`'s default changed to ECDSA
  P-256 in Substrate 1.0.
- **Traces.** The controller, the runtime, and Substrate's components and
  router export to the cluster's collector. Substrate's chart has no such
  setting for its egress proxy, so `scripts/egress-tracing.sh`, a Helm
  post-renderer, adds one; delete it and the `postRenderer` line to remove
  it. One request is then one connected trace, where alpha7 gave 17 pieces.
  Substrate 1.0's API server also writes a span for each statement it sends
  to PostgreSQL. The collector drops those of its authorization check
  (`40-observability`); before it did, an rc1 turn came in 336 to 418
  pieces. [The figures](../../../../../docs/measurements.md).
- **Images from the local registry.** Substrate's node agent (atelet) pulls
  the images it mounts into an Actor itself, not through containerd, so the
  registry mirror kind's nodes have does not reach it, and in its pod
  `localhost:5002` is the pod. `substrate-values.yaml` gives it
  `--localhost-registry-replacement=agentgateway-demo-registry:5000`, which
  rewrites a localhost registry to the registry's name on the kind network
  and allows plain HTTP for it. It is what lets kagent mount
  `diagnosis-agent`'s skill image. kind only: on EKS that image is in ECR.
- **A workload's own credential:** a kagent agent here calls the model route,
  and any MCP route it uses, with a key the gateway issued to that workload,
  not with its caller's token. How the key works is in the header of
  [`model-access/values.yaml`](../../../../../agent-platform/profiles/kagent/model-access/values.yaml),
  the chart that makes it. kagent
  could not forward one when this was built; since alpha17 it can
  (`tokenPassthrough` on `ModelConfig` and `RemoteMCPServer`), which is not
  used or tried here. kagent keeps one credential per host name. Charts:
  `agent-platform/profiles/kagent/` (`model-access`, `tool-access`).
  - **Evaluated and not adopted: gateway Actor tokens** (`actorJwt`, kagent
    #3359, new in rc1). Substrate's egress gateway would mint a token of
    about 15 minutes per Actor (issuer `https://idp.ate-system.svc`, subject
    `actor/kagent/session-<id>`). No Secret to rotate, but the token names a
    conversation and not the workload; the gateway would have to trust a
    second issuer, which serves its keys over HTTPS with a private CA; and
    the tools of such a server drop out of the controller's discovery and
    the UI's catalog. `diagnosis-agent` keeps its gateway key.
- **Substrate's object store has a console** (RustFS, the chart's default
  keys): `task ui -- rustfs`, then `http://localhost:18093/rustfs/console/`.

## The UI

The UI is at `http://localhost:18087`, for `platform-engineer` only
(password `demo`). It is on in this cluster's `values.yaml` and off in the
profile. The path is browser, the chart's oauth2-proxy (which signs in with
Keycloak, client `kagent-ui`), the UI's nginx, the controller. The two
pods held 13 MiB together on alpha7.

- **What guards it.** kagent reads the user from the token without
  verifying its signature, so the proxy is the only check (rc1 does refuse
  a token that has expired). Only the proxy has a NodePort; the UI's
  Service stays ClusterIP, and the NetworkPolicy `kagent-ui-callers` (in
  the profile) lets nothing but the proxy reach the UI. Checked from a pod
  in `sample-app` on alpha17: the UI and the controller do not answer, and
  the proxy answers a token the pod wrote itself with 403.
- **What it opens.** kagent authorizes no person (the open source
  controller sets no authorizer, in rc1 as in alpha17; only an Actor is
  limited, to its own agent, session and memory): whoever signs in can
  create, change and delete agents, `diagnosis-agent` included, which the
  release would put back only at its next sync. A chat started in the UI
  reaches the agent through the controller and not through the gateway
  route, so the route's policy and the gateway's records do not cover it.
  That is why one role is let in, and why the UI is not part of the show.
  From rc1 the owner of a conversation is an opaque id made from the
  token's issuer and user, not the user name.
- **Signing in.** Without a session the proxy answers 403 on every path
  but the UI's `/login` page (and what that page loads). Its 403 page sends
  the browser there, and from there a fresh browser goes straight to
  Keycloak. When a session has ended, the UI's own page says "Your session
  has expired. Sign in again to continue." and its **Sign in with SSO**
  button goes through Keycloak again.
- **Sessions** last 25 minutes, shorter than the token (30 minutes),
  because the proxy does not renew a session. alpha17's controller did not
  look at a token's expiry; rc1's refuses an expired token, and a session
  that ends first never hands it one.
- **Secret `kagent-ui-oidc`** (client id, client secret, cookie key) is
  made by `scripts/ui-secret.sh` before each sync. The client secret is the
  demo-only value in the realm file.
- Before sign-in the UI's icon is refused (403): the chart exempts
  `favicon.ico` and the UI asks for `favicon.svg`. Nothing else is affected.

## Limits found

They were found on alpha17 unless a line names rc1.

- **Every agent gets built-in tools nobody asked for.** kagent's Go
  runtime adds them next to the tools an agent names, with or without a
  skill; on alpha7 only a skill brought them. `bash`, `list_files`,
  `grep_file` and, from rc1, `ask_user` are switched off here
  (`config.runtimeDefaults.builtinTools` in the profile; `disableAskUser`
  is kagent #3298). `ask_user` ends a turn to wait for an answer, and
  nobody answers an agent that an alert or another agent calls. rc1 has no
  switch for `read_file`, `write_file` and `edit_file`: its built-in tools
  configuration has only `disable_file_search`, `disable_bash`, a path
  for bash's virtualenv and `disable_ask_user`. So those three stay, and
  `diagnosis-agent` is offered 13 tools: its 7, those 3, and the three of
  the skill toolset (`list_skills`, `load_skill`, `load_skill_resource`),
  which rc1's runtime adds when it finds a skill and which only read the
  skill's files. Without its skill it was offered 10. Measured on
  `diagnosis-agent` on alpha17, with a stub in place of the model:
  - **`bash` before the switch.** Root inside gVisor, with no ServiceAccount
    token, and the gateway key nowhere in the sandbox. But the environment
    holds placeholders that the egress gateway swaps for the stored
    credentials, so `bash` could call the model route and list all 20 tools
    of `observability-mcp`; the Kubernetes tool server, which takes no
    credential, listed all 9. The template offers 7 of the 29, and the rest
    are read tools too. Every other gateway route answered 401, addresses
    off the egress list returned nothing, and the collector accepted a post.
    So it widened what the agent could read, and not what it could change.
  - **What stays.** The file tools read and write anything in the Actor's
    sandbox, its compiled configuration and `/proc` included, and are
    refused on the read-only mounts. They have no way to the network, and
    `bash` called by name now answers "not found". `/data/workspace`
    survives a suspend within one conversation; `/tmp` and the root do not,
    and a new conversation sees none of it.
  - **A conversation keeps what it started with.** After the switch, one
    opened before it was still offered 14 tools, `bash` among them. The 14
    test conversations of that revision were deleted. Do the same after
    any change here: `task kagent:ate -- delete actor <name> -a kagent`.
  - **The check.** The agent's model route records what the model is offered
    on each call (access log attribute `gen_ai.request.tools`; nothing else
    holds this), and `task diagnosis-agent:checks` fails unless that is the
    agent's own 7 tools, these 3 and the 3 skill tools, and unless the
    compiled revision has bash, file search and `ask_user` off. It needs
    one model call on record: `task diagnosis-agent:ask`, which is logged
    even if the model is down.
- **Skills, on rc1.** `diagnosis-agent`'s runbook is a skill since
  2026-11-02, from an image, `localhost:5002/diagnosis-agent-skills`,
  pinned by digest. kagent turns it into an image volume of the Actor;
  Substrate's node agent pulls it (see **Images from the local registry**)
  and the runtime copies the skill into `/skills` when it starts, before
  the golden snapshot. The model sees the skill's name and description,
  and loading it is one more model call per turn, which costs time and
  tokens against the runbook in the prompt
  ([measurements](../../../../../docs/measurements.md#diagnosis-agent)). A
  skill from git failed on alpha7 ("Could not resolve host: github.com") and
  was not tried again: the Actor would fetch it through the egress gateway,
  and `substrate-egress-boundary` would stop github.com.
- kagent does not verify the signature of a person's token (rc1's source
  as alpha17's), so the gateway route, the UI's sign-in proxy and two
  NetworkPolicies guard its port. An Actor's token it does verify.
- An agent whose `ModelConfig` has provider OpenAI gets `api.openai.com:443`
  on its egress list, whatever its `baseUrl`; on rc1 too, as
  `task diagnosis-agent:checks` lists. It leads nowhere here:
  `substrate-egress-boundary`.
- A turn can lose its last spans, when the Actor suspends before they are
  exported. On alpha17, with the stand-in, two resumed turns gave 12 and 2
  pieces and five later ones 1. With the real model, 14 of 15 turns gave 1
  and one fresh turn gave 2: `a2a.request` lost its parent, which looks
  like the same loss; the cause was not proven. On rc1, 17 of 18 turns
  gave 1, and one fresh turn gave 2 the same way: the missing parent is the
  agent runtime's gRPC server span of `SendMessage`, the last span of the
  turn to end in the Actor. `task diagnosis-agent:trace` checks this, and
  allows for it.
- `kagent-api` discovery fails Unauthorized (the RemoteMCPServer shows
  Accepted=False), as on alpha7 and alpha17. Nothing depends on it.
- Substrate's components try to send metrics to `localhost:4317` every
  minute and log a warning, the chart's default; on rc1 too. Traces are
  not affected.
- rc1's `kubectl-ate` prints a warning on standard error when it is given
  no `--token-file`. The command still runs.
- A brand-new pod can reach outside the cluster for a moment, until the
  network plugin sees it. Namespace `agents` shows the same, so it is not
  specific to this install. After 20 seconds the boundary holds.

## kagent and Agent Substrate in a chain

Why a kagent agent can be only the last agent in a chain of
[chain-sts](../../../../../components/chain-sts/README.md) tokens, and why an
Agent Substrate agent, such as diagnosis-agent, cannot be one at all. Moved
here from chain-sts's README, because they are facts about kagent.

**kagent's limits.** Read from kagent's source (kagent-adk 1.0.0a7 and
1.0.0a16, the Go runtime in v1.0.0-alpha7 and alpha16, and alpha17 and
1.0.0-rc1, whose `go/adk/pkg/sts` is unchanged from alpha16), not all run:

- Only tools get the exchanged token. A call to another A2A agent carries the
  raw incoming token, and only with token propagation on
  (`KAGENT_PROPAGATE_TOKEN=true` in alpha7, `runtimeDefaults.tokenPropagation`
  from alpha16). A kagent agent can therefore be the last agent in a chain but
  not one in the middle,
  without a change upstream.
- The Go runtime's plugin does not put the exchanged token on MCP calls
  either: the raw token goes instead (`sts/plugin.go`, kagent#2803, closed
  unmerged; on Agent Substrate the exchange is no longer to be done in the
  agent runtime). Its STS client itself works with this service.
- No CRD field. alpha7 reads the `KAGENT_STS_*` variables ([How agents call it](../../../../../components/chain-sts/README.md#how-agents-call-it)); alpha16 to
  rc1 have the controller-wide `runtimeDefaults.tokenPropagation`, and
  `RemoteMCPServer.spec.tokenPassthrough` (Go only), which sends the raw token
  to a tool and overrides the exchange.
- One audience per agent: kagent sends the same `audience` and `resource` for
  every tool. Since chain-sts 0.2.1 issues each token for one route, a kagent
  agent that exchanged would get tokens for one target only, and be refused
  at every other route. No kagent agent here exchanges.
- Without a token file kagent asks without an actor, and the service refuses.

**Agent Substrate.** `diagnosis-agent` runs as a Substrate actor in the shared
worker pool `kagent-default`, whose pods run as `kagent:kagent-default`, with
no token of its own. Until Substrate gives each actor a credential this service
can verify, a Substrate agent cannot be an actor here, and `diagnosis-agent`
stays outside the chain. Substrate (0.6 and 1.0) gives each actor an actor JWT
that the agent process cannot read; its egress gateway can put it in an
outbound header (`actor_jwt`), which kagent uses for its own port. From
1.0.0-rc1 kagent's CRDs expose it too (`actorJwt`, kagent #3359): a token of
about 15 minutes from Substrate's issuer (`https://idp.ate-system.svc`) that
names the conversation's Actor (`actor/kagent/session-<id>`), not the agent.
This service would have to read it from that header, check it against
Substrate's issuer, and map the Actor to its agent. Not built or tried.
