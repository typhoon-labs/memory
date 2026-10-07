# Working in this repository

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

## Reporting

End your work with a report of at most 350 words, in this order:

1. **Built:** paths.
2. **Verified by running:** what you ran and the result.
3. **Written but not verified.**
4. **Deviations** from the contracts or from this file.
5. **Findings others need** (exact names, URLs, versions, schema facts).
6. **Blockers or decisions needed.**

Report failures plainly. Do not paste long logs.
