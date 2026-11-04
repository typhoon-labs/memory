# Working in this repository

> **Owner:** coordinator · **Type:** reference · **Checked:** 2026-11-03 against this repository's layout and tasks

The rules for everyone building a part of this demo, and the report each piece
of work ends with.

What the parts agree on is in [`docs/contracts.md`](docs/contracts.md), and the
cluster's names, ports and commands are in [`docs/cluster.md`](docs/cluster.md).
If something there is wrong or you must deviate, do not edit those files: say
so in your report and the coordinator updates them.

Background: [`README.md`](README.md) and the architecture document at
`../Docs/AgentGateway/architecture.md` (next to this repository, not in it; the
section the layout follows is copied in
[`docs/architecture-layout.md`](docs/architecture-layout.md)).

## Ground rules

- Work only inside this repository. You may read `../Docs/AgentGateway/` and
  `../Notes/` for the architecture. Do not read or reuse any other project on
  this machine.
- This machine runs **Docker Desktop for Linux** (a VM with 8 CPUs and 31 GiB).
  Create, change and remove only this project's own Docker resources: the
  kind cluster `agentgateway-demo`, the container `agentgateway-demo-registry`,
  and containers you start yourself for a test. Leave everything else on the
  machine alone, and do not name it in this repository's files.
- Use only the host ports listed in [`docs/cluster.md`](docs/cluster.md). Port
  7070 is the model endpoint.
- Never use the default kubeconfig or the current kube context. Always use
  `KUBECONFIG=<repo>/local/kind/kubeconfig` (git-ignored).
- Do not `git commit`. Do not put secrets in tracked files; demo-only passwords
  in the Keycloak realm are the one allowed exception, marked as such.
- kagent 1.x, Agent Substrate, Agentgateway resources, A2UI and kmcp are
  alpha or fast-moving. Check the current upstream documentation before
  writing a resource or calling an API. Do not write schemas from memory.
- Edit only the directories your brief assigns. If you need a change
  elsewhere, report it.
- Write American English, in prose, comments, names and data alike: `color`,
  `catalog`, `gray`, `organize`, `canceled`, "check" for a tick. A name that
  belongs to someone else keeps its own spelling, such as Python's
  `asyncio.CancelledError` and HTML's `aria-labelledby`.
- Put scratch material (pulled charts, downloads, experiments) under
  `.scratch/` at the repository root, which is git-ignored, and CLI tools you
  install under a `.tools/` directory. Leave nothing else behind.

## Where things go

The README's Layout table says what each top-level directory holds. In short:
reusable charts and policies in `agent-platform/`; what runs in a cluster, and
who may call what, in `agent-deployments/`; a component's source, its catalog
entry and its own notes in `components/<name>/`; anything that exists only
because this is kind in `local/`; presenting in `demo/`.

## Documentation

Four rules decide where a document goes and what it holds.

1. **A document lives with its owner.** The three top-level directories stand
   in for three kinds of repository, and a document must be able to move with
   the code it describes. A component's reference goes in
   `components/<name>/`, a release's runbook beside its helmfile in
   `agent-deployments/`, a chart's or policy's notes in `agent-platform/`.
   Only documents about the whole system go in `docs/`.
2. **Each file has one job.** Start: what it is and how to run it.
   Explanation: how and why it works. Proposal: what production should be.
   Reference: the exact names, values and rules. Runbook: how to do a task.
   Record: what happened when it was run. A file that does two jobs is split.
3. **One home per fact.** State a fact once, where its owner keeps it, and
   link to it everywhere else. A copy is how a fact goes stale. The homes of
   the facts most often repeated:

   | Fact | Home |
   |---|---|
   | Identities, tokens, audiences, which agent may call which tool, bindings, audit fields | [`docs/contracts.md`](docs/contracts.md) |
   | Names, namespaces, ports, addresses, tasks | [`docs/cluster.md`](docs/cluster.md) |
   | Every timing, token count and cost, with its date | [`docs/measurements.md`](docs/measurements.md) |
   | How the system works, and why | [`docs/system-architecture.md`](docs/system-architecture.md) |
   | The production design, hardening and open decisions | [`docs/production-design.md`](docs/production-design.md) |
   | What the demo cannot do | [`README.md`](README.md#limits-worth-knowing), "Limits worth knowing" |
   | How a workload key works (diagnosis-agent's credential at the gateway) | The header of [`model-access/values.yaml`](agent-platform/profiles/kagent/model-access/values.yaml), the chart that makes it |
   | kagent's and Agent Substrate's limits, and how this cluster runs them | [`60-kagent/README.md`](agent-deployments/clusters/dev/platform/60-kagent/README.md) |
   | Which chart, profile and policy each release uses | [`agent-platform/README.md`](agent-platform/README.md) |

4. **Every document says how fresh it is.** The first line under its title:

   ```
   > **Owner:** <who keeps it> · **Type:** <start, explanation, proposal, reference, runbook or record> · **Checked:** <date> against <versions>
   ```

   Change the date and versions when you check the document against the
   code, not when you change a sentence.

**Evidence.** A claim says how it is known. **Observed in the demo**: run on
this cluster. **Observed**, with the place named: run elsewhere, such as a
throwaway Keycloak. **Documented upstream**: the vendor's documentation says
so, and it was not tested here. **To validate**: nobody should rely on it
before a pilot result. **To verify**: a vendor fact to check against your
contract or edition. Unmarked text describes this repository or proposes
something.

**A component's README** has these parts, in this order, and leaves out any
that do not apply. Deeper topics go in `components/<name>/docs/`.

1. What it is: the opening paragraph, with no heading.
2. A facts table: built with, serves, route with its roles and agents, model,
   running version, and where its values and route files are.
3. Identity: the issuers it trusts, whether it exchanges at chain-sts, and
   what it refuses.
4. What it serves and returns.
5. Settings: variable, default, and whether it is required. The dev
   cluster's values stay in its values file, which this part links to.
6. Run and test, as `task <name>:...` from the repository's root.
7. Release: where the version is set, and the steps.
8. Limits.

**Before handing in a change to a document,** run `task docs:check`. It
checks relative links and their anchors, American spelling, Mermaid blocks
and the freshness line, and names the file and line of each problem. An
agent's prompt and a skill are inputs to a program, not documentation, so it
leaves them alone.

## Reporting

End your work with a report of at most 350 words, in this order:

1. **Built:** paths.
2. **Verified by running:** what you ran and the result.
3. **Written but not verified.**
4. **Deviations** from the contracts or from this file.
5. **Findings others need** (exact names, URLs, versions, schema facts).
6. **Blockers or decisions needed.**

Report failures plainly. Do not paste long logs.
