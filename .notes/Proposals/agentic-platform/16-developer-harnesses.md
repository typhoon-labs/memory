# Developer harnesses, Xcode and portable artifacts

| | |
|---|---|
| Status | Proposal, with verified capabilities. Commercial facts dated 4 November 2026 |
| Versions checked | Kiro IDE 1.4.62 (28 October 2026), Kiro CLI 3.0.0 (3 November 2026). Claude Code 2.1.318 (4 November 2026). Codex CLI 0.166.0 (29 October 2026). Xcode 27.2 (29 October 2026). Agentdesktop 0.5.0 (23 October 2026). Sources: kiro.dev, code.claude.com, learn.chatgpt.com, developer.apple.com (including its documentation data), GitHub releases |

## Recommendation

1. **Supported path: Claude Code, routed through Agentgateway to Bedrock,**
   for Claude models. It is the only candidate that documents a custom
   Anthropic-format gateway, managed settings that pin it
   (`allowedProviders: ["customEndpoint"]`, v2.1.285+), full OTel (metrics,
   events, traces in beta), skills, plugins, MCP with OAuth, and a GitLab
   CI integration.
2. **Second supported harness: Codex,** only if OpenAI models on Bedrock are
   approved. Codex uses OpenAI models only, and its gateway must serve the
   Responses API (`POST /v1/responses`); Agentgateway does.
3. **Kiro stays for current users during the pilot,** measured, not
   expanded. It cannot route through a gateway (documented), so its traffic
   is outside the platform's identity, budgets and telemetry.
4. **Xcode:** terminal harnesses plus Xcode's MCP bridge first; Xcode's
   native agents after a Mac-based validation of gateway routing.
5. **One set of portable artifacts:** AGENTS.md for instructions, Agent
   Skills (SKILL.md) for workflows-as-guidance, MCP for tools, installed by
   the org CLI into each harness's own location.

## Comparison (documented upstream unless marked)

| Criterion | Claude Code | Codex | Kiro | Xcode native |
|---|---|---|---|---|
| Bedrock | Direct (`CLAUDE_CODE_USE_BEDROCK`, Invoke API) or Mantle | Direct, OpenAI models only (`amazon-bedrock` provider) | No; Kiro hosts inference | Not native |
| Custom gateway | `ANTHROPIC_BASE_URL` plus `ANTHROPIC_AUTH_TOKEN` or `apiKeyHelper`; or Bedrock-format base URL with `CLAUDE_CODE_SKIP_BEDROCK_AUTH` | `[model_providers.<id>]` with `base_url`, `wire_api = "responses"`, auth command | **None.** Proxy variables only; BYOK and base-URL requests open (issues #8939, #10636) | Chat providers: **Chat Completions API only** ("If you add another provider, it needs to support the Chat Completions API") |
| Lost through a gateway | claude.ai-login features (cloud sessions, Remote Control, server-managed settings, Code Review, Slack, Chrome). Through Bedrock also web search, fast mode. If the gateway strips `anthropic-beta` or body fields: 400 errors; if it strips `cache_control`: caching silently lost | Codex cloud, fast mode, image generation, voice, SAML SSO, Compliance API | Not applicable | |
| Admin model control | `availableModels`, `deniedModels`, `modelOverrides` in managed settings | Workspace or provider-level | Remove models only; Auto may route outside the approved list | Per-provider sign-in |
| Instructions | CLAUDE.md; reads AGENTS.md when no CLAUDE.md exists (v2.1.277+) | AGENTS.md native | AGENTS.md always included; steering files | Agent-specific folders under `~/Library/Developer/Xcode/CodingAssistant/` |
| Skills, plugins, MCP | Agent Skills in `.claude/skills`; own plugin format; MCP stdio and HTTP with OAuth; hooks; subagents | Skills in `.agents/skills`; Agent Plugins; MCP with OAuth; hooks | Skills in `.kiro/skills`; Powers (Agent Plugins); MCP with OAuth | Plug-ins bundling skills and MCP (Xcode 27); Xcode as an MCP server |
| OpenTelemetry | Metrics, events, traces (beta); `cost.usage`, `token.usage`, `session.id`, `user.email` | Exporters for metrics and traces; token counts; no cost metric | Enterprise: daily metrics at 02:00 UTC only | None |
| Headless and CI | `claude -p`, Agent SDK, GitLab CI/CD integration (beta, maintained by GitLab) | `codex exec`, SDK | `kiro-cli chat --no-interactive` | No |
| Billing | Seats (Team, Enterprise $20/seat plus usage) **or** pure token billing on the gateway's Bedrock account | Seats or API or Bedrock | Credits only: Pro $20 for 1,000; overage $0.04 per credit | Free; uses linked accounts |

**Through Agentgateway, a specific risk:** the gateway's Bedrock *Runtime*
route translates Anthropic Messages into Converse, which drops document and
server-tool blocks and the `?beta=true` query string. Claude Code expects
beta values and body fields to pass unchanged. Route Claude Code to Bedrock
**Mantle** (native Messages) where Bedrock serves the model there, or use
Claude Code's Bedrock mode with the gateway in passthrough. **This is the
first test of step 1** ([Implementation plan](09-implementation-plan.md)).

Also pin model IDs on Bedrock. Unpinned, Claude Code maps `opus` to Opus
5.5 but `sonnet` and the background model to Sonnet 4.5. Set
`ANTHROPIC_DEFAULT_SONNET_MODEL` and siblings in managed settings.

## The Kiro concerns, revalidated

| Concern | Status on 4 November 2026 |
|---|---|
| Credit economics differ from token pricing | **Documented limitation.** Credits only, no bring-your-own-key. Kiro states that models with the same multiplier do not necessarily use the same credits per task |
| Sonnet 5 and 5.5 weighted more heavily than their API price (internal note, 4 October 2026) | **Still holds against current documentation.** At Kiro's 1.3x multiplier and Anthropic list prices ($2/$10 per million tokens, made permanent), Sonnet 5.x buys about 48 to 50% fewer tokens per credit than Opus 5 or Sonnet 4.6. Sonnet 5's 1.3x comes from a secondary source; the current models page omits it. **Needs internal measurement of credits per task**, not per token |
| Model choice | **Documented limitation, partly mitigated.** Curated catalog; admins can only remove models; Auto may route outside the approved list. New Claude models arrived within days |
| Custom inference endpoints and gateway routing | **Documented limitation: not supported** |
| Observability | **Documented limitation, improved.** Daily OTel metrics since September 2026, plus prompt and response logging to S3. No per-session tokens, cost or traces |
| Stability across surfaces | **Documented churn.** CLI 3.0.0 retired the Classic UI, the desktop app and inline suggestions; V2 agents auto-upgrade to V3. Regressions need internal measurement |
| Portable instructions and workflows | **Largely resolved.** AGENTS.md, Agent Skills and Agent Plugins supported. Steering modes, specs, hooks and agent JSON stay Kiro-specific |

The decisive concern is not price but control: Kiro traffic cannot carry the
platform's identity, budgets or audit, and its telemetry is daily totals.

## Xcode and iOS work

| Work | Where it runs | How |
|---|---|---|
| Code changes, refactors, test writing in Swift | Developer's Mac | Claude Code or Codex in the terminal, with Xcode's MCP bridge (`claude mcp add --transport stdio xcode -- xcrun mcpbridge`; the project must be open in Xcode). Or Xcode's native Claude Agent or Codex |
| Build and test diagnosis | Mac or macOS GitLab runner | Harness runs `xcodebuild`, `xcrun simctl`, `swift test`. Xcode 27 previews `xcrun mcp-server enable` without an open workspace, relevant for unattended runners |
| Signing, provisioning, device tests | macOS runners and devices only | Never in EKS; agents never receive signing credentials. Signing stays in the existing pipeline |
| MR preparation and review | EKS (GitLab runner) | The MR reviewer reads diffs; no Apple tooling needed |
| Documentation, release notes, crash triage (symbolicated) | EKS | Ordinary agents with read-only tools |

Constraints that matter:

- Xcode's native agents read their configuration from
  `~/Library/Developer/Xcode/CodingAssistant/{ClaudeAgentConfig,codex,…}`,
  which "only affect agents when you launch them in Xcode". That is a second
  configuration set beside `~/.claude` and `~/.codex`. Pointing them at
  Bedrock or a gateway is reported only by secondary sources: **validate on a
  Mac** before promising it.
- Xcode's chat providers accept only Chat Completions. Agentgateway serves it,
  so Xcode chat through the gateway is plausible; **validate**.
- Xcode 27 needs macOS Tahoe 26.6 or later on Apple silicon.
- MDM can turn the assistant off (`CodingAssistantAllowExternalIntegrations=false`).

CLI support is not native integration: a terminal harness can build and run
tests, but loses Xcode's previews, diffs and permission UI. iOS developers
choose per task; the platform supports both through the same gateway and
artifacts.

## Agentdesktop

[agentdesktop-dev/agentdesktop](https://github.com/agentdesktop-dev/agentdesktop),
Apache-2.0, created July 2026 by people at Solo.io, **0.5.0 and pre-1.0**. A
daemon above MDM that discovers AI tools, inventories MCP servers and skills,
merges managed settings into each tool's native files, translates one
sandbox policy for Claude Code and Codex, and issues short-lived OIDC-backed
JWTs to an LLM gateway such as Agentgateway. It supports Claude Code, Codex,
Cursor, VS Code Copilot and others, **not Kiro or Xcode**, and does not manage
AGENTS.md or CLAUDE.md.

It overlaps the org CLI's `login` and `check`. Evaluate it in step 2 against
plain managed-settings files distributed by MDM. Adopt only if it removes
work the CLI would otherwise do, and accept that it adds a second Solo
dependency beside the gateway.

## Portable artifacts across harnesses

| Artifact | Standard | Claude Code | Codex | Kiro | Xcode agents |
|---|---|---|---|---|---|
| Instructions | AGENTS.md (Agentic AI Foundation) | Reads it when no CLAUDE.md | Native | Native | Via the external agent |
| Skills | Agent Skills (SKILL.md) | `.claude/skills` | `.agents/skills` | `.kiro/skills` | Plug-ins |
| Plugins | Agent Plugins 1.0 (no Anthropic) / Claude Code plugins | Own format | Agent Plugins | Agent Plugins (Powers) | Own |
| Tools | MCP (spec 2026-07-28) | Yes | Yes | Yes | Xcode as MCP server |

Keep one source per skill in GitLab; the org CLI installs it into each
harness's folder. Do not maintain per-harness copies.

## Measuring cost per accepted task

| Element | Definition |
|---|---|
| Accepted task | A merge request merged, pipeline green, not reverted within 14 days. Track attempts per acceptance |
| Cost | Inference (gateway token records priced at Bedrock rates, cache reads and writes included) + seats amortized per task + runner minutes + gateway share. Kiro: daily credits per user × $0.02 included or $0.04 overage |
| Intervention | Developer minutes per accepted task, sampled by a short survey on merge, because it usually dominates |
| Comparison | Same task set per harness, pinned models (including Claude Code's background model), p50 and p90, not means. Check the gateway's cache-hit rate: a gateway that strips caching inflates cost silently |
