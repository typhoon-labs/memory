# Application validation plan

Status: Proposed experiments. Updated 5 October 2026. No results recorded. [Notes index](README.md)

This plan lists what must be agreed, decided and demonstrated before the application conventions are adopted. It adds to the platform plans for the [EKS option](../Infra/AgentGateway/validation-plan.md) and the [AgentCore option](../Infra/AgentCore/validation-plan.md) and does not repeat their experiments. Owners are proposed roles, not assigned people.

## Requirements to agree

| Requirement | Current value | Used to assess | Proposed owner to agree |
|---|---|---|---|
| Whether an existing client or UI meets the need | Not assessed | Whether a chat application is built at all | Platform and consuming teams |
| First hosted application and its owner | Not selected | Which application the packages are extracted from | Platform and agent teams |
| Languages supported first | Proposed: TypeScript for the chat application, the owning service's language for MCP adapters | Which library and starters exist first | Platform team |
| Support window for a superseded major version | Not agreed | Deferral and the package contract | Platform team and component owners |
| Time for a security fix to reach every production selection | Not agreed | The fix propagation experiment | Security and platform teams |
| Update bot and its credential | Not selected | Every update MR | Platform and security teams |

Both platform options start with existing clients, so the first row comes before any application work. Propose the first hosted application as the representative hosted workload of the [shared pilot](../Infra/README.md#shared-pilot-workload), so that one application serves both pilots. An experiment can produce observations before its value is agreed, but cannot be declared a pass.

## Open decisions

| Question | Proposed starting point | Evidence needed | Proposed owner |
|---|---|---|---|
| Which published protocol connects UI and server? | None chosen; do not define one | The stock UI and a second client each complete a streamed task with tool calls over it | Chat application owner |
| Can the TypeScript server meet kagent's bring-your-own contract? | Check before building | The server image passes the contract in [execution choices](../Infra/AgentGateway/workload-deployment.md#execution-choices), or the adaptation is recorded as delivery effort | Runtime owner |
| Is level 0 content baked into the image or loaded at start? | Baked | For loading: integrity check, start-up failure behavior and caching shown, as [consumer adoption](../Infra/AgentGateway/skills-and-prompts.md#consumer-adoption) requires | Platform team |
| Which hooks belong at the gateway? | Anything required of every application | The control still holds for an application built without the library | Platform and security teams |
| Where does the chat application's repository live? | A component repository, not the platform repository | A named owner who accepts the package contract | Decision owner |
| What opens update MRs? | Renovate, which has a Copier manager; a scheduled pipeline if it is not available | MRs opened for lockfile, digest and template changes by a credential that cannot merge | Platform team |
| How are the consumers of a version listed? | From lockfiles and selections | A complete list produced within the time an incident allows | Platform team |

Renovate is not in the supplied environment list. A CI/CD job token cannot create an MR, so either mechanism needs a named credential that can open one and cannot merge or deploy. [Renovate Copier manager](https://docs.renovatebot.com/modules/manager/copier/), [reusable pipeline contracts](../Infra/AgentCore/repository-structure.md#reusable-pipeline-contracts)

## Order of work

1. **Platform first:** nothing here precedes the first existing-client workflow in either option. [EKS](../Infra/AgentGateway/validation-plan.md#pilot-sequence), [AgentCore](../Infra/AgentCore/validation-plan.md#exploration-phases)
2. **First application:** build the first hosted application at level 2, as packages from the start.
3. **Library:** extract the shared library from it. Do not design the library first.
4. **Level 0:** offer the base application image when a second assistant wants the same application with different content.
5. **Starters:** render them with Copier once two components share plumbing.

## Experiments and expected evidence

| Experiment | Evidence needed | Proposed owner | Failure would mean |
|---|---|---|---|
| Generate a component and reach a first useful task | Setup time and the files the developer had to edit | Platform and agent teams | The starter saves little over copying an existing repository |
| Launch a second assistant at level 0 | No code or Dockerfile written; its own identity and tool permissions; scenarios run in its pipeline | Agent team | Level 0 does not fit real assistants and teams start at level 2 |
| Move an assistant from level 0 to level 2 | The same repository gains `src/`; content and scenarios are unchanged; no other assistant is redeployed | Agent team | The levels are separate products, not steps |
| Fix propagation | Time from a library release to the last production selection at each level, and the manual steps on the way | Platform team | The level 0 chain is too long for a security fix |
| Starter update with a local edit | An update MR from the bot; the conflict is reviewable; the team resolves it without platform help | Platform and agent teams | Starters are copy-once and are not an update channel |
| Breaking library version | The previous major still builds and deploys through the support window; migration effort is recorded | Platform team | The package contract cannot hold and consumers get stuck |
| Republished version is rejected | The registry refuses a duplicate version; a changed lockfile hash fails the build | Platform team | Released bytes are not immutable |
| A team declines an update | Its pipeline and running selection continue; the platform can list which components are on which version | Platform team | Exposure cannot be known during an incident |
| Application built without the shared library | Authentication, model and tool permissions and network controls still apply to it | Security and platform teams | The library is acting as a control, which a team can remove |
| Same application under both platform options | The same packages and content; only bindings and the deployment selection differ; adaptations are recorded | Platform and agent teams | The application layer is not independent of the platform choice |

The last two experiments reuse the platform plans' bypass and portability experiments with an application built to these conventions.

## Signals to revisit the design

| Observation | Proposed consequence |
|---|---|
| Several teams reach level 3 for the same piece | Move that package boundary or add an extension point there |
| The same starter file conflicts for several teams | Move what varies into a starter question, a component input or a chart value |
| Teams leave update MRs unmerged past the support window | Upgrading costs too much; find which checks or changes cause it |
| No second assistant asks for level 0 | Do not build the base application image; keep one application at level 2 |
| A platform rule holds only because applications use the library | Move it to the gateway, admission or network |

## Scorecard evidence

These conventions add evidence to the shared [scorecard](../Infra/README.md#scorecard). They do not add criteria.

| Criterion | Evidence from this plan |
|---|---|
| Developer value | Generate a component and reach a first useful task; launch a second assistant at level 0 |
| Delivery effort | Packages, starters and the base image written before the first application, counted as custom code |
| Team autonomy | Launch a second assistant with no platform change; a team declines an update |
| Security | Application built without the shared library |
| Release safety | Fix propagation; breaking library version; republished version is rejected |
| Operational burden | Hours spent maintaining packages and starters and helping teams with update MRs |
| Portability | Same application under both platform options |

Create an architecture decision record when a decision is made. Writing these notes builds nothing and selects nothing.
