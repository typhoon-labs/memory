# chain-sts

> **Owner:** platform team · **Type:** runbook · **Checked:** 2026-11-03 against chain-sts 0.2.1 (chart 0.4.0), Agentgateway 1.7.0

As built in the dev cluster. The release is in `helmfile.yaml`. What the
service does is in
[`components/chain-sts`](../../../../../components/chain-sts/README.md), and why
each wait below is as long as it is in its
[`docs/key-rotation.md`](../../../../../components/chain-sts/docs/key-rotation.md).

- chain-sts 0.2.1 (chart `agent-platform/charts/chain-sts` 0.4.0) in
  namespace `chain-sts`, at `http://chain-sts.chain-sts.svc.cluster.local`,
  with no host port. `task sts:install` applies it, and `task up` runs that
  right after `task publish`; `task sts:status` shows what runs.
- **The policy** is `policy.yaml`: `chat-assistant` first, `remediation-agent`
  and `comms-agent` after it or for a user who calls them directly,
  `max_chain` 4, tokens of at most 300 s, each for one target: a gateway
  route that takes its tokens, named by its in-cluster URL (`audiences`, which
  the chart checks against `delegation.resources` in `../../identity.yaml`;
  see [Tokens per target](#tokens-per-target)). Whose user tokens it accepts
  is `../../identity.yaml` too. Its NetworkPolicy lets in namespaces
  `agents`, `tools` and `agentgateway-system`, and it sends traces and its
  audit records to the Collector in `telemetry` over OTLP/HTTP.
- **Two replicas** and a PodDisruptionBudget, `maxUnavailable: 1`. An
  eviction (a node drain) waits until the other pod is ready; a pod deleted
  outright does not ask the budget. Each pod sleeps 5 seconds before it stops
  (`preStopSleepSeconds`), so that the Service has stopped sending it
  connections by then. kind has one node, so both pods run on it.
- **The actor check is a TokenReview**, and the service's account may do
  nothing else in the API: ClusterRole `chain-sts-token-review` allows
  `create` on `tokenreviews` (`authentication.k8s.io`), and
  ClusterRoleBinding `chain-sts-auth-delegator` binds ServiceAccount
  `chain-sts/chain-sts` to it. The binding keeps the name it had when it
  bound the built-in `system:auth-delegator`, which also allows
  `subjectaccessreviews`. A binding's `roleRef` cannot change: on a cluster
  made before chart 0.3.0, delete the binding right before `task
  sts:install`, which creates it again (exchanges fail with 503 in between).
- **Checks and drills.** `task sts:check` runs the exchange's denied paths,
  each next to its allowed twin (the gateway's rules on chain tokens,
  chain-sts's own rules, who may reach it; under a minute; two pods made and
  deleted): [`agent-platform/tests`](../../../../../agent-platform/tests/README.md).
  `task demo:chain` follows one Apply from a Chat UI sign-in through
  chat-assistant, remediation-agent and delivery-mcp, prints side by side
  chain-sts's audit lines, the gateway's access-log lines for that request's
  trace, delivery-mcp's audit lines and `applied_via`, and a decoded token
  of the same chain, and ends with `task demo:reset`; `task demo:backup:sts-down` scales chain-sts to zero,
  shows the agents fail closed, and puts back two replicas.

## Who exchanges here

`chat-assistant` since 0.1.10, and
`remediation-agent` and `comms-agent` since 0.1.3, with
`DELEGATION_METADATA_URL` (this service's metadata) and
`DELEGATION_ACTOR_TOKEN_FILE` set in their releases. Each pod mounts a token
of its own ServiceAccount for the audience `chain-sts`, valid 600 seconds, at
`/var/run/secrets/chain-sts/token`, through `projectedToken` in the shared
chart [`agent-platform/charts/agent`](../../../../../agent-platform/charts/agent/values.yaml);
no RBAC is involved. None of them sends its caller's own token on: not to
`delivery-mcp`, not to the model route, not to another agent. Each asks for
the target it is about to call, as `resource`: the address it calls the
target at (`chat-assistant` since 0.1.14, the other two since 0.1.4). A
refused or failed exchange stops the call, and nothing goes downstream. The
chains the dev cluster sees:

| Caller | Chain in the token sent on |
|---|---|
| A user, through the Chat UI or `/a2a/chat-assistant` | `[chat-assistant]` |
| Alertmanager at `/hooks/alert`, as `alert-automation` (`user` in the audit line: `service-account-alert-automation`) | `[chat-assistant]` |
| A user's Apply or Draft button on the card, which `chat-assistant` hands to `remediation-agent` or `comms-agent` | `[remediation-agent, chat-assistant]`, `[comms-agent, chat-assistant]` |
| A user who calls `/a2a/remediation-agent` or `/a2a/comms-agent` directly, as `demo/scenarios/drive.py` and `demo/backup/registry-down.sh` do | `[remediation-agent]`, `[comms-agent]` |
| `chat-assistant` asking `diagnosis-agent` | `[chat-assistant]`, at `/a2a/diagnosis-agent`. `diagnosis-agent` does not exchange: it calls its tools with credentials of its own, and the alert hook records its diagnosis with a token exchanged from the hook's (see [kagent and Agent Substrate in a chain](../60-kagent/README.md#kagent-and-agent-substrate-in-a-chain)) |

The gateway trusts its tokens on the routes that take them, each route for
its own target only, and so do the three services behind it that verify a
caller's token themselves: `delivery-mcp`, `remediation-agent` and
`comms-agent`, since 0.1.2, with `DELEGATION_ISSUER` and
`DELEGATION_JWKS_URL` bound in their releases, and `DELEGATION_AUDIENCE`,
their own route's target, since 0.2.2 and 0.1.4. Every pod of namespaces
`agents` and `tools` can reach it on its container's port (`delegation` in
the boundaries in [`80-policies`](../80-policies/helmfile.yaml)).

## Tokens per target

Each token chain-sts issues is for one target, the gateway route the agent
is about to call, and only that route takes it. So an agent cannot present
the token it was called with anywhere else: `remediation-agent`, handed a
platform engineer's `[chat-assistant]` token for its own route, cannot use it
for `restart_workload` at `/mcp/delivery` or at the model route. The targets
and what checks them are in
[`docs/contracts.md`](../../../../../docs/contracts.md#agents-acting-for-a-user-chain-sts);
the names and URIs in `delegation.resources` of `../../identity.yaml`.

Before chain-sts 0.2.1 every token was for one audience, `agentgateway`.
The rollout from that has two phases: first everything that takes chain
tokens accepts both the shared audience and its own target, then the shared
audience goes. The dev cluster went through both on 2026-11-03, the second
at 09:21, six minutes after the last agent rolled out; `task sts:check`
then passed with the replay refused. Another cluster still moving from a
shared audience follows the same steps.

Apply the steps in this order, each finished before the next, and no request
fails: an agent asks for a target only once chain-sts issues it (step 1),
and its route and service accept it (steps 2 to 4), and every service accepts
the shared audience while a caller not yet updated may send it. All commands
run from the repository's root, as `mise exec -- task ...`.

| Step | What changes | Commands |
|---|---|---|
| 1 | chain-sts 0.2.1 issues for each target, and for `agentgateway` as before | `task chain-sts:build chain-sts:push`, then `task sts:install` |
| 2 | The gateway: each route that takes chain tokens accepts its own target and `agentgateway` (route-auth 0.7.0); `/a2a/chat-assistant`, the alert hook and `/mcp/observability` (chart 0.5.0) stop trusting chain-sts at all | `task deploy -- -l name=delivery-mcp-route-auth -l name=remediation-agent-route-auth -l name=comms-agent-route-auth -l name=diagnosis-agent-route-auth -l name=model-route-auth -l name=chat-assistant-route-auth -l name=chat-assistant-alert-hook-auth -l name=observability-mcp` |
| 3 | delivery-mcp 0.2.2 accepts chain tokens for its route and for `agentgateway` | `task delivery-mcp:build delivery-mcp:push`, then `task deploy -- -l name=delivery-mcp` |
| 4 | remediation-agent and comms-agent 0.1.4 accept both, and ask for one target per call | `task remediation-agent:build remediation-agent:push comms-agent:build comms-agent:push`, then `task deploy -- -l name=remediation-agent -l name=comms-agent` |
| 5 | chat-assistant 0.1.14 asks for one target per call | `task chat-assistant:build chat-assistant:push`, then `task deploy -- -l name=chat-assistant` |
| 6 | Wait 6 minutes after step 5's rollout has ended: a token for `agentgateway` lives at most 300 s, and the gateway takes it 60 s past `exp` | |
| 7 | The drop, five lines, each ending with `# shared audience` (`git grep -n '# shared audience$' agent-deployments`): delete the line in `../../identity.yaml` and in `policy.yaml` here; in the values of `delivery-mcp`, `remediation-agent` and `comms-agent`, cut `,agentgateway  # shared audience` from `DELEGATION_AUDIENCE`. Delete the `ROLLOUT ONLY` comment above each. Then apply them | `task sts:install`, then `task deploy -- -l name=delivery-mcp-route-auth -l name=remediation-agent-route-auth -l name=comms-agent-route-auth -l name=diagnosis-agent-route-auth -l name=model-route-auth -l name=delivery-mcp -l name=remediation-agent -l name=comms-agent` |
| 8 | Check: each refusal next to its allowed twin, the replay included | `task sts:check` |

The chain-sts chart refuses to render while `policy.yaml` and
`identity.yaml` disagree about the targets, so step 7 cannot drop the shared
audience from one and not the other. The drills in step 8 expect the end of
the rollout; run before step 7, `chain-exchange.sh` sees chain-sts still
issue for `agentgateway`. Steps 3 to 5 roll single-replica agents and a
service as any release of them does, so apply them outside an apply in
progress.

## The signing keys

One Secret per key in namespace `chain-sts`, with the PEM in `key.pem`,
never in a file. Each carries the labels `app.kubernetes.io/name=chain-sts`,
`app.kubernetes.io/component=signing-key` and `signing-key-role`:

| `signing-key-role` | The key |
|---|---|
| `sign` | signs every token, and is published at `/jwks` |
| `next` | published, does not sign yet |
| `previous` | published until the last token it signed has expired |
| `retired` | no longer published; its Secret is about to be deleted |

Those labels are the only record of which key does what. No tracked file
names a key: `keys.yaml.gotmpl` asks `scripts/signing-key.sh values` for the
chart's `signingKey.secretName`, `.next` and `.previous` each time the
release is rendered (`task sts:install`, `task deploy`, `task up`). So:

- A new cluster has no key. The render names `chain-sts-signing-key`, and the
  release's presync hook creates it (openssl, 2048 bits) labeled `sign`.
- A sync after a rotation renders the keys the cluster has. It never names a
  Secret that was deleted, because the role went with it, and never makes
  another key sign, because only the rotation steps change a role, each after
  its checks.
- Git and the cluster cannot disagree about the keys.

The render stops, and nothing is applied, when no key has `sign`, two keys
share a role, a key has no role beside others, the API server does not
answer, or chain-sts runs with no key Secret at all.

`task sts:rotate:check` prints each key's role, each pod's `/healthz` keys
(read with `kubectl exec`), when the Deployment's last rollout ended, and the
kids in the gateway's copy of `/jwks` (the `jwks-store` ConfigMap in
`agentgateway-system` for `http://chain-sts.chain-sts.svc.cluster.local/jwks`).

## Rotating the key

One task per step; each refuses to run early or out of order, says why, and
can run again after it stopped halfway.

```sh
task sts:rotate:new        # 1. new Secret chain-sts-signing-key-<UTC time> as `next`, synced; prints its kid
task sts:rotate:check      # 2. until it exits 0: at least 360 s after that rollout, and the gateway has the kid
task sts:rotate:promote    # 3. `next` signs, the old key is `previous`; synced
task sts:rotate:check      # 4. until it exits 0: at least 420 s after that rollout
task sts:rotate:drop       # 5. the old key is `retired`, synced, then its Secret is deleted
```

`task sts:rotate:new -- <name>` names the Secret. The key comes from
`python -m chain_sts.rotate new-key` in the component's `.venv` (`task
chain-sts:sync`). The waits count from the end of the Deployment's last
rollout, so any later rollout only makes them longer:

- **360 s before promote:** the gateway's controller fetches `/jwks` every
  300 s (`cacheDuration`) and never on an unknown kid, and a minute for it to
  push the keys, a retried fetch and a stopping pod. The Python verifiers
  fetch on an unknown kid (`remediation-agent` and `comms-agent` not within
  30 s of their last fetch), well inside that wait.
- **420 s before drop:** a token lives `token_ttl_seconds` (300, read from
  `policy.yaml`), the gateway accepts it 60 s past `exp`, and a minute.

Between the steps, `until task sts:rotate:check; do sleep 30; done` waits
for the next one. Each step's rollout replaces one pod at a time, and each
stopping pod serves 5 seconds more, so the service answers throughout.

If a step's sync fails after its labels changed, the labels are ahead of the
pods: `task sts:rotate:check` says so, and `task sts:install` finishes it.
Each step also syncs the chart and values in the working tree, so run them
from a clean one.

Not run, and not covered by the tasks, which never skip a wait:

- **A key that leaked.** Every token it signed must stop working at once,
  so there is no overlap: `scripts/signing-key.sh new <name>` makes the new
  key as `next` without a sync; label the leaked Secret
  `signing-key-role=retired` and the new one `sign` (`kubectl label --overwrite`,
  with the repository's kubeconfig and context); `task sts:install`; `task
  sts:rotate:drop` deletes the retired Secret; restart `remediation-agent`
  and `comms-agent`, whose `PyJWKClient` keeps every key it has seen. The
  gateway refuses the new key's tokens until its next fetch, up to 5
  minutes.
- **A key Secret deleted** while chain-sts runs. `task sts:install` refuses,
  because a new key would sign tokens no verifier knows. The running pods
  still hold the key; with none left, delete `deployment/chain-sts` and run
  `task sts:install`, which makes a new first key, accepted by the gateway
  after its next fetch.

## The rotation run in this cluster

The run of 2026-10-21, step by step with its timings, is in
[`docs/measurements.md`](../../../../../docs/measurements.md#key-rotation-2026-10-21).
