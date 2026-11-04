# chain-sts: the verifiers, and rotating the signing key

> **Owner:** chain-sts maintainers · **Type:** runbook · **Checked:** 2026-11-03 against chain-sts 0.2.0, Agentgateway 1.7.0

How each service that checks chain-sts's tokens learns a new key, and the
rotation's steps as chart values, for any cluster. The keys themselves, and
how the service holds them, are in [the README](../README.md#the-signing-keys).
The dev cluster's runbook, with its tasks, is
[the release's README](../../../agent-deployments/clusters/dev/platform/90-chain-sts/README.md#rotating-the-key).

## What the verifiers do

Who checks chain-sts's tokens against `/jwks`, how each learns a new key, and
how long each still accepts a token after its `exp`:

| Verifier | Learns a new `kid` | Leeway |
|---|---|---|
| Agentgateway 1.7.0, on every route that trusts `delegation` | Its controller fetches `/jwks` again `cacheDuration` after each successful fetch: `5m` in `route-auth` and in `observability-mcp`'s route, which is also the default and the least the field allows. It stores the keys in a ConfigMap in `agentgateway-system` (label `app.kubernetes.io/component=jwks-store`) and writes them inline into the proxy's configuration. A failed fetch is retried after 200 ms, doubling up to 15 s, and the keys it has stay in use. The proxy never fetches: a token whose `kid` it lacks is refused (401) | 60 s on `exp` and `nbf`, read from the source; a Keycloak token was refused 1.2 s past `exp` on 2026-11-03 (docs/measurements.md, the identity broker). The waits below keep 60 s |
| `remediation-agent`, `comms-agent`: PyJWT 2.15.1's `PyJWKClient` with `cache_keys=True`, `lifespan=3600` | On a `kid` it lacks it fetches again, but not within 30 s (`cooldown_duration`) of its last successful fetch; else it refuses the token | 30 s |
| `delivery-mcp`: FastMCP 3.4.8's `JWTVerifier` | On a `kid` it lacks it fetches again at once; else every hour | 30 s for `nbf`, none for `exp` |
| chain-sts itself, for its own tokens as a subject | Its configuration | 30 s |

So the gateway is the slowest to learn a key, and the most lenient with an
expired token. Sources: Agentgateway's API reference for `RemoteJWKS`
(<https://agentgateway.dev/docs/kubernetes/latest/reference/api/>: "How long a
fetched `jwks` document is used before it is re-fetched from the IdP.
Defaults to `5m`"), and its source at v1.6.0
(<https://github.com/agentgateway/agentgateway/tree/v1.6.0>):
`controller/api/v1alpha1/agentgateway/agentgateway_policy_types.go` (the
`cacheDuration` field and its minimum of 5m),
`controller/pkg/agentgateway/jwks/fetcher.go` (the schedule and the
retries), `jwks/persistence.go` and `jwks/lookup.go` (the ConfigMap, and the
keys written inline), and `crates/agentgateway/src/http/jwt.rs` (a `kid` is
required and looked up, no fetch; `Validation::new`, whose leeway in
jsonwebtoken 11.1.0 is 60 s,
<https://docs.rs/jsonwebtoken/11.1.0/jsonwebtoken/struct.Validation.html>).
At v1.7.0 `persistence.go` and `lookup.go` are unchanged, `fetcher.go` changes
only how a key set is parsed, and the `cacheDuration` field is the same; `jwt.rs`
was not compared.
PyJWT: `PyJWKClient`'s docstring in 2.15.1
(<https://github.com/jpadilla/pyjwt/blob/2.15.1/jwt/jwks_client.py>: "Unknown
key IDs can trigger one forced refresh after the cooldown period configured
by `cooldown_duration`", 30 s by default). FastMCP:
`fastmcp/server/auth/providers/jwt.py` in 3.4.8, `JWTVerifier._get_jwks_key`.
The leeways of the Python services are their `CLOCK_SKEW_SECONDS`.

## Rotating the key

**In the dev cluster** each step is a task, `task sts:rotate:new`,
`sts:rotate:promote` and `sts:rotate:drop`, with `task sts:rotate:check` for
the waits; which Secret signs is a label on the Secrets, not a value in Git,
and each task refuses to run early. The runbook, and the rotation run there
on 2026-10-21 with no failed request, are in
[the release's README](../../../agent-deployments/clusters/dev/platform/90-chain-sts/README.md#rotating-the-key).
Below, the steps as chart values, for any cluster.

Every step is a change to the release's values and a sync, and each rolls the
pods. A stopping pod serves on for `preStopSleepSeconds` (5) before it gets
SIGTERM, until the Service no longer sends it connections: without that, the
rollout to 0.1.2 refused one exchange. With the Deployment's defaults (25%,
rounded down for `maxUnavailable` and up for `maxSurge`) one or two replicas
get a new pod ready before an old one stops, so for a while old and new
replicas answer side by side; each step is safe with both. The waits count
from the end of the rollout (`kubectl rollout status`), and are what `python
-m chain_sts.rotate steps` prints for a token lifetime of 300 s:

1. **Publish the next key.** Create its Secret beside the old one, as the
   old one was made (in the dev cluster `task sts:rotate:new` does this
   step, labels included):

   ```sh
   PYTHONPATH=src .venv/bin/python -m chain_sts.rotate new-key |
     kubectl -n chain-sts create secret generic chain-sts-signing-key-2 --from-file=key.pem=/dev/stdin
   ```

   Then `signingKey.next: chain-sts-signing-key-2`. `/jwks` lists the new
   `kid` after the one that signs.
2. **Wait at least 6 minutes**, the gateway's 5-minute refresh and a minute
   for the controller to store and push the keys, a retried fetch, and a
   stopping pod. The Python services would have it after 30 s. Before going
   on, check that the gateway has it:
   `kubectl -n agentgateway-system get configmap -l
   app.kubernetes.io/component=jwks-store -o yaml | grep <new kid>`.
3. **Promote it:** `signingKey.secretName: chain-sts-signing-key-2`,
   `signingKey.previous: chain-sts-signing-key`, `signingKey.next: ""`.
   Every pod's `/healthz` then says `keys.signing` is the new `kid`.
4. **Wait at least 7 minutes**: a token the old key signed lives at most
   `token_ttl_seconds` (300; never longer than its subject), the gateway
   accepts it 60 s past `exp`, and a minute's margin.
5. **Drop the old key:** `signingKey.previous: ""`, and once that rollout is
   done, delete Secret `chain-sts-signing-key`.

Skipping step 1 is what fails: a replica that signs with a key nobody has
seen makes the gateway refuse its tokens until its next fetch, up to 5
minutes, and `PyJWKClient` refuse them for up to 30 s
(`tests/test_rotation.py` shows the second).

**A key that leaked** cannot wait for this. Make the new key sign at once,
with no `previous`: every token the old key signed fails from then on, and so
do the new key's tokens at the gateway until its next fetch, up to 5
minutes. Restart `remediation-agent` and `comms-agent` too: their
`PyJWKClient` keeps every key it has used (`cache_keys`) until the process
ends, whatever `/jwks` says. A token is a bearer token until its `exp`, so
the old key's tokens stay usable elsewhere for up to `token_ttl_seconds`.
