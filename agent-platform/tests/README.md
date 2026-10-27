# Platform checks

Checks of the platform's controls against a running cluster. Each proves two
halves: the path around a control fails, with the exact refusal, and the
allowed path next to it works, so that a check cannot pass because nothing
answers. Each prints one line saying what it is about to show, one entry per
attempt, and a result line; its exit status is the number of entries marked
`WRONG`. Each puts back what it changed, also when it is interrupted.

Which cluster and whose tokens come from the environment, never from the
default kubeconfig ([`lib.sh`](lib.sh)): `PLATFORM_KUBECONFIG`,
`PLATFORM_CONTEXT` and `PLATFORM_TOKEN_CMD`. The root Taskfile sets all three
for the dev cluster, and so does `scripts/lib/cluster.sh` for a script that
sources it.

| Check | Shows | Run it with |
|---|---|---|
| [`model-route.sh`](model-route.sh) | The model route: a token's completion, and 401 without a token or with another audience, 403 for a model not approved | `task smoke` |
| [`bypass-tool.sh`](bypass-tool.sh) | A pod calls delivery-mcp around the gateway: no connection; through the gateway: answered | `task demo:backup:bypass-tool` |
| [`bypass-model.sh`](bypass-model.sh) | A pod calls the model endpoint around the gateway: no connection; the gateway: 401, then a completion | `task demo:backup:bypass-model` |
| [`policy-override.sh`](policy-override.sh) | A team's gateway policy that weakens a platform rule, and two ways around a route: refused at admission | `task demo:backup:policy-override` |
| [`chain-gateway.sh`](chain-gateway.sh) | Tokens chain-sts issued, replayed where the gateway expects another agent (403, or a tool not offered) or none (403); a Chat UI sign-in past chat-assistant (401, `InvalidAudience`); chain-sts's claims signed with another key (401) | `task demo:backup:chain-gateway` |
| [`chain-exchange.sh`](chain-exchange.sh) | chain-sts refuses no actor token, an actor token for the API server, an account its policy does not name, a token bound to a deleted pod, a wrong order, a chain past `max_chain`, a Chat UI sign-in for an agent other than chat-assistant, a forged subject | `task demo:backup:chain-exchange` |
| [`chain-network.sh`](chain-network.sh) | A pod of the Sample App cannot reach chain-sts; pods in `agents` and `tools` can | `task demo:backup:chain-network` |

`task sts:check` runs the three `chain-*` checks, all of them, and exits with
the number that were not as expected. They take under a minute together.

## How the chain checks work

- **Tokens.** A user's comes from `PLATFORM_TOKEN_CMD <user>`; a Chat UI
  sign-in from `PLATFORM_TOKEN_CMD <user> --chat-ui`, which for the dev
  cluster is the browser's code flow with PKCE, scripted
  (`local/identity/chat_ui_login.py`). An agent's own token is `kubectl
  create token <account> --audience chain-sts --duration 10m`, as the agents
  mount it. An exchange is sent from inside remediation-agent's pod, which
  may reach chain-sts, as a form whose fields are read from standard input
  ([`pod_probe.py`](pod_probe.py) `form`).
- **No token is printed, and none is on a command line.** Tokens are kept in
  shell variables and handed on through standard input (to `kubectl exec`,
  `curl -H @-`, `mcp.py @-`). What a check shows of a token is its chain or
  its decoded claims; of an exchange, its status, `error` and
  `error_description`.
- **A forged token** has the claims of a real chain-sts token, issued now,
  signed RS256 with a key made for the call by `openssl` and thrown away
  (`forge` in `lib.sh`).
- **The deleted pod.** `chain-exchange.sh` starts an idle pod in `agents` as
  chat-assistant's account (no API token mounted), exchanges with a token
  bound to it, deletes it, and asks again every 2 seconds for up to 30. The
  API server goes on accepting a token it has just accepted for about 10
  seconds (it caches a successful authentication); the refusal came 10 to 13
  seconds after the deletion in every run so far.
- **`max_chain`.** With the dev cluster's policy no third agent may follow
  another, so no chain reaches the limit of 4. The check starts a test
  instance of the deployed image in namespace `chain-sts`, from the
  release's ConfigMap, with a key of its own, an issuer nothing trusts, the
  cluster's keys for the actor (no TokenReview, so no permission), and two
  more accounts in line so that a chain can reach the limit; it listens on
  127.0.0.1 only and is asked through `kubectl exec`. The fifth agent is
  refused. Both pods are deleted at the end, and end by themselves after 300
  seconds if a run is cut off before it can delete them.

## Helpers

| File | |
|---|---|
| [`lib.sh`](lib.sh) | Sourced by every check and by the drills in `demo/backup/`: output, `kubectl` and `helm` with the cluster from the environment, the probes, and the chain helpers (`actor_token`, `exchange`, `exchange_for`, `chain`, `claims`, `gw`, `forge`) |
| [`pod_probe.py`](pod_probe.py) | One connection, POST, form or GET from inside a pod, as one line of JSON; standard library only |
| [`mcp.py`](mcp.py) | One MCP exchange from this machine: `list` or `call`, as a user (`PLATFORM_TOKEN_CMD`), with no token (`-`), or with a token on standard input (`@-`) |
