# Keycloak

> **Owner:** platform team · **Type:** runbook · **Checked:** 2026-11-03 against Keycloak 26.7.5, chart `local/identity/keycloak` 0.2.0

The release `keycloak` is in `helmfile.yaml`, whose header says what it
installs and why. The chart, its realm files and its key script are in
[`local/identity/keycloak`](../../../../../local/identity/keycloak/Chart.yaml),
because one Keycloak pod with no database exists only on kind. Its addresses,
and how its signing keys outlive a restart, are in
[`docs/cluster.md`](../../../../../docs/cluster.md).

## Realm corp: a stand-in enterprise IdP

A second realm, `corp`, in the same Keycloak stands in for the enterprise
identity provider, and realm `demo` brokers it as the OIDC identity provider
`corp`. That is the design of
[`production-design.md`, section 2](../../../../../docs/production-design.md#2-the-design-the-enterprise-idp-behind-keycloak),
run here: corp signs the person in, and the demo realm still issues every
token the platform sees. Both realms are imported at start, from
`files/corp-realm.json` and `files/demo-realm.json`, and a change to either
restarts the pod.

- **To try it,** press **Corp (stand-in enterprise IdP)** on any demo sign-in
  page, the Chat UI's for one, and sign in as `alex.rivera` (developer, team
  `search`), `sam.okafor` (incident-manager, `incident`) or `jo.chen`
  (platform-engineer, `platform`), password `corp-demo`, a demo-only value
  written in the realm file. The demo realm names the user `corp.<name>`. A
  fourth corp user, `mallory`, carries the email of the demo user
  `developer`, to show that it cannot take that account. The demo realm's own
  users, clients and passwords are as before, and so are `task token` and the
  drills.
- **The identity provider's settings,** checked against Keycloak 26.7's
  [server administration guide](https://www.keycloak.org/docs/26.7.5/server_admin/index.html),
  "Integrating identity providers", and its source at tag 26.7.5 for the
  mapper and flow names:

  | Setting | Value | Why |
  |---|---|---|
  | Authorization URL | `${KC_HOSTNAME}/realms/corp/protocol/openid-connect/auth` | The browser goes there. Keycloak fills in `${KC_HOSTNAME}`, the chart's `publicUrl`, when it imports the realm |
  | Token, user info and JWKS URLs | `http://localhost:8080/realms/corp/protocol/openid-connect/...` | Keycloak calls them itself, inside its own pod |
  | Issuer | `${KC_HOSTNAME}/realms/corp` | The `iss` of corp's ID tokens, on whichever address they are asked for, because `KC_HOSTNAME` is a full URL. The broker refuses any other (documented upstream) |
  | Client at corp | `agentplatform-demo`, confidential, PKCE S256 | Section 2.2's one OIDC application per environment |
  | Mappers, sync mode `force` | Claim to Role: `groups` value `app-agentplatform-<role>` to realm role `<role>`. Attribute Importer: `primary_team` to `team`, and `sub` to `idp_sub` | Section 2.2, items 3 to 5. `chat-ui` and `mcp-client` emit `idp_sub` |
  | Username | `${ALIAS}.${CLAIM.preferred_username}` | A corp user cannot take a local user's name |
  | First login flow | `corp first broker login`: Review Profile, only if a field is missing, then Create User If Unique, required | An email or user name that already exists stops at Keycloak's error page, HTTP 409, and nothing offers to link it (observed in the demo) |

- **Who may administer what.** Three confidential clients, each with a
  demo-only secret in its realm file and only these realm-management roles:
  corp `directory-reader`, `view-users`, the job's read-only directory; demo
  `reconciler`, `view-users` and `manage-users`, the job itself; and corp
  `idp-admin-test`, `view-users` and `manage-users`, used only by the drill
  to disable and enable a corp user as the IdP's administrators would.
- **Different from section 2.2 on purpose.** The IdP is an extra button, not
  the default of the Identity Provider Redirector, because the demo's
  scripts sign in as the demo realm's own users. Corp sends all of a person's
  groups, because Keycloak's group mapper has no prefix filter; the demo
  realm maps only the platform's. Both realms share one Keycloak, over HTTP.

Run from the repository's root:

| Task | Does |
|---|---|
| `task identity:broker-check` | What corp sends; a brokered sign-in for `mcp-client`, its claims (never the token) and tools/list at `/mcp/delivery`; the same sign-in for `chat-ui`; and the email takeover, refused. `-- <corp user>` for one user. `local/identity/broker_check.py` |
| `task identity:reconcile` | The reconciliation job of section 2.2, item 6, once: disables a linked user whose corp account is disabled, deleted or in no platform group, and ends their sessions; ends the sessions of one who lost a platform group, so the next sign-in maps the roles again. `-- --dry-run` changes nothing. `local/identity/reconcile.py` |
| `task identity:revocation-drill` | Disables a corp user, runs the job, and times each step until the gateway refuses the user's tokens: about 35 minutes, `-- --quick` stops before the wait. Puts the user back. `local/identity/revocation_drill.py` |

Their timings belong in [`docs/measurements.md`](../../../../../docs/measurements.md).

**Limits.** Observed in the demo:

- The gateway verifies a token by itself, from Keycloak's keys, and never asks
  Keycloak whether the session still exists. A person the job has disabled
  keeps every access token issued before it until that token's `exp`. Before
  the job runs, a refresh, or a sign-in on the demo realm's session, which
  never goes to corp, still gives a new one.
- The job never enables a user. A person enabled again at corp stays disabled
  here until someone enables them.
- A brokered user lives only as long as the pod. After a restart the next
  sign-in creates the user again, with a new `sub` and the same `idp_sub`.
- Brokered users carry Keycloak's default roles in `roles`
  (`default-roles-demo`, `offline_access`, `uma_authorization`); the demo
  realm's own users do not.
- `manage-users` lets the job do more than it needs, such as setting a
  password.
