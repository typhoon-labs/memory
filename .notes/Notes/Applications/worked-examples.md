# Application worked examples

Status: Illustrative proposed workflows. Updated 5 October 2026. [Notes index](README.md)

These examples follow a team through each customization level and show how an upstream change reaches it. Component names and versions are hypothetical. No commands, packages or test outcomes have been demonstrated.

Deployment steps use the EKS option's terms. Under AgentCore the selection is a `deployment.yaml` change that sets a candidate release before activation, as its own [worked examples](../Infra/AgentCore/worked-examples.md) describe. The steps inside the component repository are the same for both.

## A team launches an assistant without writing code

The people team wants a benefits assistant that answers leave questions using two existing read-only tools. This is level 0.

1. The team renders the agent starter and chooses the content-only form. The repository has `prompts/`, `skills/`, `evals/`, a `.gitlab-ci.yml` that includes pinned components and `.copier-answers.yml`. It has no `src/` and no Dockerfile.
2. The team writes its system prompt, pins the guidance bundles it needs, names an approved model and the two tools, and adds scenarios that include one denied tool call.
3. CI builds an image from the pinned base application image and the content, runs the scenarios against dev endpoints and publishes one digest.
4. A selection MR in environment configuration names the digest, the assistant's own workload identity and its tool and model bindings. Tool permissions are reviewed there. The prompt cannot grant them.
5. Verification in dev includes a useful answer and the denied call. The same digest is then promoted.

The team owns behavior and scenarios. It did not choose a framework, write an entry point, configure telemetry or set execution limits. It also cannot add a hook, a route or a second agent at this level.

## A service team adds a tool for it

The assistant needs leave balances, which no tool exposes. The service that owns leave data adds an MCP adapter in its own repository. This is level 1, and it follows the existing publishing examples. [EKS](../Infra/AgentGateway/worked-examples.md#payments-publishes-an-mcp-capability), [AgentCore](../Infra/AgentCore/worked-examples.md#a-team-adds-a-restricted-mcp-refund-tool)

The MCP starter supplies the layout, the pipeline include and one permitted and one denied authorization test. The adapter is written in the service's language.

The assistant adopts the tool by adding it to its selection and scenarios. No assistant code changes and the base image is untouched. The same tool is available to other consumers, including existing developer clients.

## A team needs a hook in the request path

The benefits assistant must mask national identity numbers before text reaches the model. That is code in the request path, so the assistant moves from level 0 to level 2.

1. The team changes its starter answer through `copier update`, not by editing the answers file. The update adds `src/` and a Dockerfile. Prompts, skills and scenarios stay where they are.
2. `src/` is an entry point that imports the server package, registers the masking hook and starts the server. The lockfile pins the packages.
3. CI now builds the team's own image. The team adds a scenario in which an identity number must not appear in model input.
4. A selection MR names the new digest. Identity and bindings are unchanged, so the review covers a behavior change and not a permission change.

From here the team receives package fixes as lockfile bumps instead of base image bumps. If masking is required of every assistant, it belongs at the gateway and not in this hook; that question is in the [validation plan](validation-plan.md#open-decisions).

## A team replaces the UI

A support team embeds the assistant in its own console. It keeps the server package, drops the UI package and speaks the UI to server protocol directly. This is level 3.

The team now owns rendering of every message part, accessibility and its own upgrades. It still receives server, chart and pipeline updates. A protocol change is a breaking change under the [package contract](README.md#package-contract) and reaches this team as a major version with migration notes.

This example depends on a published protocol between UI and server, which is not yet chosen.

## An upstream fix reaches every level

The shared library fixes a defect in token limit enforcement and publishes `1.4.1`.

1. Before publication, platform CI renders each starter against `1.4.1` and runs the generated tests.
2. The update bot opens a lockfile MR in every repository that pins the library. That includes `chat-assistant` and each level 2 application.
3. A level 2 team's pipeline runs its tests and scenarios. The team merges, CI publishes a new digest and a selection MR follows.
4. The `chat-assistant` owners merge and publish a new base image digest.
5. The bot then opens a digest bump MR in every level 0 repository. Each pipeline rebuilds, runs that assistant's scenarios and publishes a digest. A selection MR follows.
6. A level 3 team receives the fix for the packages it still uses.

Level 0 has the longest path: library, base image, assistant image, selection. For a security fix the time for that whole chain is a value to agree and measure. A team that has not merged keeps running its current version; nothing changes underneath it.

Other kinds of change arrive the same way.

| Change | Arrives as | Team does |
|---|---|---|
| CI/CD component | A component reference bump in `.gitlab-ci.yml` | Merges once its pipeline passes on the new component |
| Chart or workload module | A version bump in its environment selection | Reviews the rendered difference |
| Starter plumbing | A `copier update` MR | Reviews, and resolves conflicts in files it edited |

## A starter update conflicts with a local edit

The platform changes the generated Dockerfile to run as a non-root user. One team had edited its Dockerfile to install a system package.

Copier regenerates the project from the old template tag, works out what the team changed, applies the new template and re-applies the team's changes. Where both touched the same lines it leaves conflict markers in the file by default, or a `.rej` file beside it. [Copier updating](https://copier.readthedocs.io/en/stable/updating/)

The team resolves the Dockerfile as it would any merge. It may also decline the update and stay on its template tag. Because the starter holds only plumbing, staying behind withholds no library or image fix.

If the same file conflicts for several teams, the starter holds something teams need to vary. Move it into a starter question, a component input or a chart value. How the update bot presents a conflicted update in an MR has not been verified.

## A team defers a breaking version

Library `2.0.0` changes the session store interface. A level 2 team with its own session store receives the major version MR and its build fails.

The team closes the MR and stays on `1.x`, which receives security fixes through the support window. It schedules the migration from the published notes.

Level 0 teams never see the interface change. The `chat-assistant` owners absorb it, and those teams receive only a base image bump. That is the main reason to stay at level 0 when it is enough.

## An update fails a team's checks

A base image bump for the benefits assistant fails a scenario: a lower default iteration limit cuts a long task short. The MR is not merged, no digest is published and the running selection is unchanged.

The team reports it to the `chat-assistant` owners. A default that alters behavior is a breaking change under the package contract, so either the release is corrected upstream or the team sets the limit explicitly and records why. Other assistants adopt or decline the same bump on their own results.
