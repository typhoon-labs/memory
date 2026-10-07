# Agent platform proposal: page set

Confluence pages kept as Markdown. One file is one page. The number prefix is the page order under the parent page, [Agent platform proposal](00-proposal.md). This file describes the directory and is not a page.

## Pages

| File | Page title | Answers |
|---|---|---|
| [`00-proposal.md`](00-proposal.md) | Agent platform proposal | What are we asking for, and what state is it in? |
| [`01-problem-goals-scope.md`](01-problem-goals-scope.md) | Problem, goals and scope | Why, for whom, and what is deferred? |
| [`02-options-and-comparison.md`](02-options-and-comparison.md) | Options and how they are compared | What are the two options, and on what basis are they compared? |
| [`10-architecture-overview.md`](10-architecture-overview.md) | Architecture overview | What are the parts, which exist already, and how mature are they? |
| [`11-identity-and-authorization.md`](11-identity-and-authorization.md) | Identity and authorization | Who is verified where, and who decides what? |
| [`12-trust-boundaries.md`](12-trust-boundaries.md) | Trust boundaries and bypass prevention | What stops a call going around the gateway? |
| [`13-repositories-and-delivery.md`](13-repositories-and-delivery.md) | Repositories, delivery and rollback | Who writes what, and how does a change reach production and come back? |
| [`14-building-on-the-platform.md`](14-building-on-the-platform.md) | Building on the platform | As a team, which path do I take? |
| [`15-observability-and-operations.md`](15-observability-and-operations.md) | Observability and operations | How is it debugged and run? |
| [`16-cost-model.md`](16-cost-model.md) | Cost model | What will it cost, and what is still unpriced? |
| [`20-demo-one-incident.md`](20-demo-one-incident.md) | The demo: one incident, end to end | What does the demo show? |
| [`21-demo-findings.md`](21-demo-findings.md) | Demo findings and limits | What did building it teach us, and what does it not show? |
| [`30-pilot-plan.md`](30-pilot-plan.md) | Pilot plan | What happens next, in what order, and when do we stop? |
| [`31-decisions-and-risks.md`](31-decisions-and-risks.md) | Decisions, risks and requirements | What is open, who closes it, and with what evidence? |
| [`90-glossary-and-sources.md`](90-glossary-and-sources.md) | Glossary and sources | Terms, upstream documentation and the versions the demo ran |

## Where the content comes from

| Source | Kept in | Used for |
|---|---|---|
| Architecture document, version 0.1, 5 October 2026 | `Docs/AgentGateway/architecture.md` | Pages 01 to 16, 30, 31 and 90 |
| Working notes, 5 October 2026 | `Notes/Infra/`, `Notes/Applications/` | Pages 02, 14, 16 and 30 |
| The demo, as of 7 October 2026 | `agentgateway-demo/` | Pages 20 and 21, and the "Observed in the demo" section of each design page |

The pages are written to be read without access to those directories, so they do not link into them. When a source changes, change the page and its "Updated" date.

## Conventions

- **Header.** Every page starts with its title and a four-row table: Status, Updated, Based on, Parent. The parent page has Audience in place of Parent.
- **Evidence labels.** Four phrases say how far a statement can be trusted: **Working assumption (WA-n)**, **Documented upstream**, **Observed in the demo** and **To validate**. Page 00 defines them. Anything unmarked is proposed design.
- **Component status.** Reused, New, Optional or Candidate, as defined on page 10.
- **Identifiers.** Working assumptions are WA-1 to WA-7 and open decisions are D-1 to D-15. Both are listed on page 31 and keep the numbers of the architecture document.
- **Links.** Relative links to sibling files, to the page and not to a heading inside it. Upstream documentation is linked by URL.
- **Design pages** (10 to 16) end with a section "Observed in the demo": what the demo showed on that topic and what it did not.
- **Language.** American English, sentence-case headings, short declarative sentences.

## Diagrams

- **Mermaid** for sequences, flows, state and decision trees, in fenced `mermaid` blocks inside the page. Confluence needs a Mermaid app or macro to draw them; without one, render each block to an image when publishing.
- **SVG** for layout-heavy pictures, in `diagrams/`. They are generated: edit `scripts/build_diagrams.py` and run it, and do not edit the SVG files by hand.

```sh
python3 scripts/build_diagrams.py
```

| File | Shows | Used on |
|---|---|---|
| `platform-overview.svg` | The platform on a page, by layer and status | 00, 10 |
| `options-side-by-side.svg` | The EKS agent platform and AgentCore, concern by concern | 02 |
| `deployment-topology.svg` | One environment: namespaces, gateway, workloads, state | 10 |
| `identity-at-each-hop.svg` | The credential on each connection and who authorizes it | 11 |
| `trust-boundaries.svg` | The governed path and the five bypass paths | 12 |
| `configuration-authority.svg` | One writer per object | 13 |
| `customization-levels.svg` | The four levels at which a team builds on the platform | 14 |
| `demo-topology.svg` | The demo's kind cluster and what stands in for what | 20 |
| `demo-coverage.svg` | Which parts of the architecture the demo ran, stood in for or left out | 21 |

## Screenshots

`screenshots/` holds PNG captures of the running demo at 1920 by 1080. Files 01 to 21 are from one incident on 7 October 2026; files 22 to 26 are the kagent console about half an hour later. They were taken by `scripts/capture_screenshots.mjs`, which runs the incident on the demo's kind cluster in headless Chrome with a separate browser session for each role, and resets the demo when it ends.

```sh
node scripts/capture_screenshots.mjs            # one whole incident, about two minutes
node scripts/capture_screenshots.mjs --probe    # the pages as they are; changes nothing in the cluster
node scripts/capture_screenshots.mjs --kagent   # the kagent console only, files 22 to 26; changes nothing
```

It needs the demo up with its pre-flight all GO, Google Chrome and `playwright-core`; the header of the script names the environment variables. A run costs about $0.15 in model calls. Retake all of them together, so that the incident, the times and the token counts on the pages agree with each other, and then check the figures quoted on pages 16, 20 and 21.

| File | Shows | Used on |
|---|---|---|
| `01-sample-app-search-healthy.png` | The Sample App's search page before the incident | 20 |
| `02-registry-tool-servers.png` | The registry's two tool servers | 20 (linked) |
| `03-registry-agents.png` | The registry's four agents | 20 |
| `04-chat-no-incident.png` | The Chat UI before the incident, as `developer` | 20 (linked) |
| `05-sample-app-search-unavailable.png` | The search page after release 2.1.0 | 20 |
| `06-grafana-sample-app-failing.png` | The Sample App dashboard while search fails | 15, 20 |
| `07-chat-card-diagnosing.png` | The incident card while the diagnosis runs | 20 |
| `08-chat-developer-diagnosis.png` | The card with the diagnosis and its evidence | 20 |
| `09-chat-developer-proposed.png` | The developer's card after proposing | 20 |
| `10-chat-engineer-refused-by-service.png` | Apply before approval, refused by the tool server | 11, 20 |
| `11-chat-manager-status-draft.png` | The incident manager's drafted status update | 20 |
| `12-chat-manager-approved.png` | The incident manager's card after approving | 20 |
| `13-chat-engineer-verifying.png` | The platform engineer's card while the rollback is verified | 20 |
| `14-chat-engineer-resolved.png` | The resolved incident | 00, 20 |
| `15-sample-app-search-recovered.png` | The search page after the rollback | 20 (linked) |
| `16-grafana-sample-app-recovered.png` | The Sample App dashboard after the rollback | 20 |
| `17-langfuse-model-calls.png` | Langfuse's table of model calls, by user or workload | 15, 20 |
| `18-langfuse-cost-breakdown.png` | The cost breakdown of the largest diagnosis call | 16, 20 (linked) |
| `19-langfuse-model-call-detail.png` | One model call opened: trace, prompt and answer | 20 |
| `20-grafana-platform-overview.png` | The gateway's view: routes, refusals, tokens, tool calls | 15, 20 |
| `21-grafana-agentgateway.png` | The dashboard that ships with Agentgateway, LLM row | 15, 20 |
| `22-kagent-agents.png` | The kagent console: the one agent and how template, harness and agent relate | 20 |
| `23-kagent-agent-details.png` | The diagnosis agent in kagent: template, harness, revision, model, tools and conversations | 20, 21 |
| `24-kagent-tool-servers.png` | The tool servers kagent knows, with the Kubernetes server's tools | 14, 20 (linked) |
| `25-kagent-models.png` | kagent's model configurations and the agent's gateway key | 11, 20 (linked) |
| `26-kagent-substrate.png` | Agent Substrate: worker pool, actor templates and actors | 10, 20 |
