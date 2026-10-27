# chain-sts

As built in the dev cluster. The release is in `helmfile.yaml`; what the
service does, and why each wait below is as long as it is, is in
[`components/chain-sts`](../../../../../components/chain-sts/README.md).

- chain-sts 0.1.2 (chart `agent-platform/charts/chain-sts` 0.3.0) in
  namespace `chain-sts`, at `http://chain-sts.chain-sts.svc.cluster.local`,
  with no host port. `task sts:install` applies it, and `task up` runs that
  right after `task publish`; `task sts:status` shows what runs.
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
  `task demo:chain` follows one Apply through every record and ends with
  `task demo:reset`; `task demo:backup:sts-down` scales chain-sts to zero,
  shows the agents fail closed, and puts back two replicas.

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
  fetch on an unknown kid and need no wait.
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

On 2026-10-21, from Secret `chain-sts-signing-key` (kid
`DeD-u9kqSAONbshYsorPNqK3pgtdDDZTEx4tZIKwe9k`) to
`chain-sts-signing-key-202610211048` (kid
`4A-v1fts-t4P_nLgOF1t61no_oDd_gyJESwJcEVg8-4`), with two replicas. A loop ran
every 3 s from 10:46:58 to 11:07:52 UTC: platform-engineer's Keycloak token
exchanged in `remediation-agent`'s pod with a `kubectl create token
--audience chain-sts` actor token for `chat-assistant`, that token exchanged
again for `remediation-agent`, the first used for `remediation-agent`'s agent
card and the second for `tools/list` and a `list_incidents` call at
`/mcp/delivery`, through `localhost:18080`, so the gateway and
`delivery-mcp` verified each. **418 rounds, 2,926 requests, no failure.**

| UTC | What happened | Pods (`/healthz`) | Gateway's copy |
|---|---|---|---|
| 10:48:04 | `task sts:rotate:new`; rollout done 10:48:12 | sign `DeD-…`, next `4A-…` | `DeD-…` |
| 10:52:09 | the gateway's fetch | | `DeD-…`, `4A-…` |
| 10:54:20 | `task sts:rotate:promote`, allowed at 362 s; rollout done 10:54:28 | sign `4A-…`, previous `DeD-…` | `DeD-…`, `4A-…` |
| 10:54:28 | the loop's first token signed by `4A-…`; its last by `DeD-…` was at 10:54:25 | | |
| 10:55:18 | `task sts:install` (below); rollout done 10:55:25 | the same | |
| 10:57:09 | the gateway's fetch | | `4A-…`, `DeD-…` |
| 11:02:42 | `task sts:rotate:drop`, allowed at 429 s after 10:55:25; rollout done 11:02:51; `chain-sts-signing-key` deleted | sign `4A-…` | `4A-…`, `DeD-…` |
| 11:07:09 | the gateway's fetch | | `4A-…` |

The promote's sync picked up a chart change that was in the working tree,
the narrower ClusterRole, and helm stopped at the binding's `roleRef` after
applying the rest: the pods rolled to the new key, and the task stopped
before its check. `task sts:install` with the committed chart finished the
release at 10:55:18, and the drop's wait counted from that rollout. A
`task sts:install` after the drop changed nothing.
