#!/usr/bin/env python3
"""Builds the SVG diagrams in ../diagrams. Standard library only.

    python3 scripts/build_diagrams.py

Edit the data here and rerun; do not edit the SVG files by hand.
"""
from __future__ import annotations

import html
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "diagrams"
FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif"

# Status palette: fill, stroke, text. Chosen for contrast on white and in grayscale.
STATUS = {
    "reuse":    ("#E8F1FB", "#2F6DB5", "Reuse: exists today"),
    "adopt":    ("#E9F6EE", "#2E8A57", "Adopt: new OSS, run by the platform"),
    "build":    ("#FFF4E0", "#B7791F", "Build: thin, organization-specific"),
    "optional": ("#F3EEFB", "#7A55B3", "Optional: per workload, after a gate"),
    "defer":    ("#F2F2F2", "#8A8A8A", "Deferred: not built until a workload needs it"),
}
INK = "#1F2328"
MUTED = "#57606A"


def esc(text: str) -> str:
    return html.escape(text, quote=True)


class Svg:
    def __init__(self, width: int, height: int, title: str, desc: str):
        self.w, self.h = width, height
        self.parts: list[str] = []
        self.title, self.desc = title, desc

    def add(self, s: str) -> None:
        self.parts.append(s)

    def text(self, x, y, s, size: float = 13, weight="normal", fill=INK, anchor="start", italic=False):
        style = ' font-style="italic"' if italic else ""
        self.add(f'<text x="{x}" y="{y}" font-size="{size}" font-weight="{weight}" fill="{fill}" '
                 f'text-anchor="{anchor}"{style}>{esc(s)}</text>')

    def rect(self, x, y, w, h, fill="#FFFFFF", stroke="#D0D7DE", rx=8, dash=False, sw=1.5):
        d = ' stroke-dasharray="6 4"' if dash else ""
        self.add(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}" '
                 f'stroke="{stroke}" stroke-width="{sw}"{d}/>')

    def box(self, x, y, w, h, title, lines=(), status="reuse", size: float = 13):
        fill, stroke, _ = STATUS[status]
        self.rect(x, y, w, h, fill, stroke, dash=(status in ("optional", "defer")))
        self.text(x + 10, y + 20, title, size=size, weight="600")
        for i, line in enumerate(lines):
            self.text(x + 10, y + 38 + i * 16, line, size=11.5, fill=MUTED)

    def band(self, x, y, w, h, label):
        self.rect(x, y, w, h, fill="#FAFBFC", stroke="#E1E4E8", rx=10, sw=1)
        self.text(x + 12, y + 18, label.upper(), size=10.5, weight="700", fill=MUTED)

    def arrow(self, x1, y1, x2, y2, label=None, color="#57606A", dash=False, lx=None, ly=None):
        d = ' stroke-dasharray="5 4"' if dash else ""
        self.add(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color}" stroke-width="1.6" '
                 f'marker-end="url(#arrow)"{d}/>')
        if label:
            self.text(lx if lx is not None else (x1 + x2) / 2 + 6,
                      ly if ly is not None else (y1 + y2) / 2 - 4, label, size=10.5, fill=color)

    def legend(self, x, y, keys):
        self.text(x, y, "Status", size=11, weight="700", fill=MUTED)
        for i, k in enumerate(keys):
            fill, stroke, label = STATUS[k]
            yy = y + 12 + i * 20
            self.add(f'<rect x="{x}" y="{yy}" width="18" height="12" rx="3" fill="{fill}" stroke="{stroke}"'
                     f'{" stroke-dasharray=\"4 3\"" if k in ("optional", "defer") else ""}/>')
            self.text(x + 26, yy + 10.5, label, size=11, fill=INK)

    def save(self, name: str) -> None:
        head = (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {self.w} {self.h}" '
                f'width="{self.w}" height="{self.h}" role="img" aria-labelledby="t d" '
                f'font-family="{FONT}">\n<title id="t">{esc(self.title)}</title>\n'
                f'<desc id="d">{esc(self.desc)}</desc>\n'
                '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" '
                'markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="#57606A"/>'
                '</marker></defs>\n'
                f'<rect width="{self.w}" height="{self.h}" fill="#FFFFFF"/>\n')
        OUT.mkdir(parents=True, exist_ok=True)
        (OUT / name).write_text(head + "\n".join(self.parts) + "\n</svg>\n", encoding="utf-8")
        print("wrote", OUT / name)


def platform_architecture() -> None:
    s = Svg(1480, 1060, "Enterprise agent platform on EKS: the minimum useful platform",
            "Layers from consumers at the top through identity, the Agentgateway control point, execution, "
            "tools and services, to state and telemetry, with each component colored by whether it is reused, "
            "adopted, built, optional or deferred.")
    s.text(24, 34, "Agent platform on EKS: the minimum useful platform", size=20, weight="700")
    s.text(24, 56, "One governed path for models, tools and agents. Execution stays conventional unless a workload "
                   "earns a second operating model.", size=12.5, fill=MUTED)

    # Consumers
    s.band(20, 72, 1110, 128, "Consumers")
    s.box(34, 98, 200, 92, "Coding harnesses", ["Claude Code, Codex", "Kiro kept during pilot", "macOS, Linux, CI"], "reuse")
    s.box(246, 98, 200, 92, "Xcode (macOS)", ["Native agents: Claude,", "Codex in Xcode 26.3+", "Gateway support: verify"], "reuse")
    s.box(458, 98, 200, 92, "GitLab", ["Source of truth, CI,", "runners in EKS", "MR events and API"], "reuse")
    s.box(670, 98, 210, 92, "Internal UIs and chat", ["Helpdesk, incident chat", "Read-only first"], "build")
    s.box(892, 98, 226, 92, "Automation", ["Alerts, schedules,", "pipelines calling agents", "Client credentials"], "reuse")

    # Identity column
    s.band(1146, 72, 314, 420, "Identity")
    s.box(1160, 98, 286, 78, "Enterprise IdP: Okta or Ping", ["Base tier: sign-in, MFA, groups,", "immutable user ID, deprovisioning"], "reuse")
    s.box(1160, 190, 286, 94, "Keycloak (broker + platform AS)", ["Access tokens for platform audiences", "PKCE, device, client credentials,", "K8s SA token client assertion"], "adopt")
    s.box(1160, 298, 286, 94, "chain-sts (narrow STS)", ["RFC 8693 delegation only: sub = user,", "act = current agent, one resource,", "<= 5 min. Replaceable by contract"], "build")
    s.box(1160, 406, 286, 76, "AWS: EKS Pod Identity", ["Workload to AWS APIs (Bedrock,", "S3, KMS). Never user identity"], "reuse")
    s.arrow(1303, 176, 1303, 190)
    s.arrow(1303, 284, 1303, 298)

    # Gateway
    s.band(20, 214, 1110, 150, "Control point")
    fill, stroke, _ = STATUS["adopt"]
    s.rect(34, 240, 1084, 114, fill, stroke)
    s.text(44, 260, "Agentgateway: the only door to models, MCP tools and agents (OSS, Kubernetes Gateway API controller)",
           size=13, weight="600")
    subs = [
        (44, "Model routes", ["Approved models only; Bedrock credential", "held here (Pod Identity); token limits"]),
        (400, "MCP routes", ["OAuth protected-resource metadata;", "per-tool CEL on role and current actor"]),
        (756, "A2A and HTTP routes", ["Per-agent CEL; hosted agents are", "reachable only from the gateway"]),
    ]
    for x, t, lines in subs:
        s.rect(x, 270, 346, 54, "#FFFFFF", "#9CC9AE", rx=6, sw=1)
        s.text(x + 8, 286, t, size=12, weight="600")
        for i, line in enumerate(lines):
            s.text(x + 8, 301 + i * 14, line, size=11, fill=MUTED)
    s.text(44, 343, "Every route: verify token (Keycloak, chain-sts, workload key)  |  coarse authorization  |  "
                    "rate limits per principal  |  usage record (user, team, workload, workflow, model)  |  OTel span",
           size=11, fill=INK)
    s.arrow(1160, 237, 1118, 262, "validates tokens", lx=1030, ly=232)
    # consumers to gateway
    for x in (134, 346, 558, 775, 1005):
        s.arrow(x, 190, x, 240)

    # Execution
    s.band(20, 378, 1110, 170, "Execution")
    s.box(34, 404, 300, 134, "Conventional Kubernetes apps", [
        "Default for agents, MCP servers,", "workflows. Deployment or Job.",
        "Base chart + agent-integration chart", "Python template (ADK reference)", "Karpenter, Spot where safe"], "adopt")
    s.box(346, 404, 252, 134, "GitLab CI jobs", [
        "Batch agents: MR review,", "scheduled reports. Runner pods", "in EKS, job-scoped tokens,",
        "interruptible, idempotent output"], "reuse")
    s.box(626, 404, 232, 134, "kagent (declarative)", [
        "Simple read-only agents only,", "after the identity gate", "(user token or chain-sts)",
        "1.0 is rc: pin, do not expose", "its console"], "optional")
    s.box(870, 404, 248, 134, "Deferred runtimes", [
        "Agent Substrate snapshots,", "sandboxed coding agents,", "AgentCore Runtime:", "only for a named workload", "that justifies a 2nd model"], "defer")
    # gateway to hosted agents, and agents back through the gateway
    s.arrow(150, 354, 150, 404, "A2A, HTTP", lx=156, ly=372)
    s.arrow(250, 404, 250, 354, "models, tools", lx=256, ly=372)
    s.arrow(472, 404, 472, 354, "models, tools", lx=478, ly=372)

    # Tools and services
    s.band(20, 562, 1110, 118, "Behind the gateway (tools own their business authorization)")
    s.box(34, 588, 260, 82, "Amazon Bedrock", ["Reached only with the gateway's", "IAM role; no app holds a key"], "reuse")
    s.box(306, 588, 260, 82, "Existing APIs", ["Service catalog, runbooks, docs,", "CI, deploy status, tickets"], "reuse")
    s.box(578, 588, 260, 82, "Team MCP servers", ["Re-verify token and current actor;", "enforce approvals and state"], "build")
    s.box(850, 588, 268, 82, "macOS build hosts", ["GitLab macOS runners: Xcode,", "simulators, signing. Not EKS"], "reuse")
    s.arrow(612, 354, 612, 588, "MCP, model calls", lx=618, ly=572)

    # Distribution
    s.band(1146, 506, 314, 174, "Distribution")
    s.box(1160, 532, 286, 64, "GitLab + ECR (OCI)", ["Source of truth; immutable images,", "charts, skill bundles by digest"], "reuse")
    s.box(1160, 606, 286, 64, "Agentregistry + org CLI", ["Catalog index and install; never", "in the request path"], "optional")
    s.arrow(1303, 596, 1303, 606)

    # State
    s.band(20, 694, 720, 128, "State (separate stores by data class)")
    s.box(34, 720, 168, 92, "CloudNativePG", ["App and workflow", "state, Keycloak,", "gateway, Langfuse"], "adopt")
    s.box(212, 720, 168, 92, "Valkey", ["Caches and rate", "counters only.", "Loss is safe"], "adopt")
    s.box(390, 720, 168, 92, "S3", ["Artifacts, audit", "(Object Lock),", "backups, blobs"], "reuse")
    s.box(568, 720, 162, 92, "ClickHouse", ["Existing: usage ledger.", "Dedicated 1-shard", "cluster: Langfuse"], "reuse")

    # Telemetry
    s.band(754, 694, 706, 128, "Telemetry and records (four streams, one collector)")
    s.box(768, 720, 160, 92, "OTel collector", ["Redact, route,", "tail-sample", "(trace-aware)"], "reuse")
    s.box(938, 720, 120, 92, "Dynatrace", ["Sampled ops", "traces, metrics"], "reuse")
    s.box(1068, 720, 120, 92, "Langfuse", ["Agent traces,", "evals, prompts"], "adopt")
    s.box(1198, 720, 120, 92, "Audit store", ["Immutable", "action records"], "build")
    s.box(1328, 720, 120, 92, "Usage ledger", ["Tokens, cost,", "reconciled to CUR"], "build")
    s.arrow(928, 766, 938, 766)

    # Foundation
    s.band(20, 836, 1440, 70, "Foundation (existing)")
    s.text(34, 878, "EKS, VPC, ECR, KMS, Secrets Manager, Istio (mTLS between gateway and tools, where already run), "
                     "Karpenter (On-Demand/RI for tier-0, Spot for interruptible), Kyverno (admission rules that keep the gateway the only door)",
           size=12, fill=INK)

    s.legend(34, 930, ["reuse", "adopt", "build", "optional", "defer"])
    s.text(420, 944, "Reading the arrows", size=11, weight="700", fill=MUTED)
    s.text(420, 962, "Arrows show request direction. Dashed boxes are optional or deferred.", size=11)
    s.text(420, 980, "Every consumer reaches models, tools and agents through Agentgateway. Business authorization stays in tools.", size=11)
    s.text(420, 998, "Nothing in Distribution or Telemetry is in the request path: their outage does not stop agents.", size=11)
    s.save("platform-architecture.svg")


def credential_hops() -> None:
    s = Svg(1480, 616, "The credential on each hop, and who checks it",
            "A person signs in through the enterprise IdP and Keycloak. Their token reaches an agent through the gateway. "
            "The agent exchanges it at chain-sts for a short token naming the user and itself, for one target. "
            "The gateway checks route, role and current actor; the tool checks again and enforces business rules. "
            "Model calls leave the gateway with the gateway's AWS credential.")
    s.text(24, 34, "The credential on each hop, and who checks it", size=20, weight="700")
    s.text(24, 56, "User identity is carried to the tool. AWS credentials never carry user identity. Each token is for one audience.",
           size=12.5, fill=MUTED)
    y = 176
    w = 190
    xs = [24, 314, 604, 894, 1184]
    row = [("Person", ["Harness, UI, CLI"], "reuse"), ("Agentgateway", ["route A: the agent"], "adopt"),
           ("Agent", ["Deployment or Job"], "adopt"), ("Agentgateway", ["route B: the tool"], "adopt"),
           ("MCP tool", ["business rules"], "build")]
    for x, (t, lines, st) in zip(xs, row):
        s.box(x, y, w, 60, t, lines, st)
    s.box(24, 80, w, 60, "Keycloak", ["brokers the IdP"], "adopt")
    s.box(604, 80, w, 60, "chain-sts", ["token exchange"], "build")
    s.arrow(90, 176, 90, 140, "0  sign in", lx=98, ly=162)
    s.arrow(150, 140, 150, 176, "token", lx=158, ly=162)
    s.arrow(214, y + 30, 314, y + 30, "1  token, aud = A", lx=222, ly=y + 22)
    s.arrow(504, y + 30, 604, y + 30, "passthrough", lx=516, ly=y + 22)
    s.arrow(670, 176, 670, 140, "2  exchange", lx=678, ly=162)
    s.arrow(740, 140, 740, 176, "chain token", lx=748, ly=162)
    s.arrow(794, y + 30, 894, y + 30, "3  aud = B", lx=806, ly=y + 22)
    s.arrow(1084, y + 30, 1184, y + 30, "passthrough", lx=1096, ly=y + 22)
    rows = [
        ("Hop", "Credential presented", "Checked by", "Decision made there"),
        ("Person to Keycloak", "IdP session (OIDC broker), MFA at the IdP", "Keycloak", "Who the person is; groups mapped to roles and team"),
        ("Client to gateway, route A", "Keycloak access token, aud = route A, PKCE or device flow", "Gateway", "Valid issuer, audience, expiry; role may call this agent"),
        ("Agent to chain-sts", "subject_token = caller's token; actor_token = projected SA token, aud chain-sts", "chain-sts (TokenReview)", "This agent may act for users on target B; chain length; lifetime"),
        ("Agent to gateway, route B", "Chain token: sub = user, act.sub = agent, aud = route B", "Gateway", "Role allows tool; current actor (act.sub) allowed for this tool"),
        ("Gateway to tool", "Same chain token (passthrough), over mTLS where the mesh runs", "Tool", "Re-verify token and current actor; ownership, approval, state, idempotency"),
        ("Gateway to Bedrock", "Gateway's IAM role (EKS Pod Identity), SigV4", "AWS IAM", "Which models the platform may invoke. No user identity here"),
        ("Workload with no user", "Client credentials at Keycloak, or a per-route workload key", "Gateway", "Workload's own role; attributed to its owner and workflow"),
    ]
    ty = 262
    colx = [24, 254, 744, 954]
    for i, row in enumerate(rows):
        yy = ty + i * 40
        fill = "#F6F8FA" if i == 0 else ("#FFFFFF" if i % 2 else "#FBFCFD")
        s.rect(24, yy, 1430, 40, fill=fill, stroke="#E1E4E8", rx=0, sw=1)
        for j, cell in enumerate(row):
            s.text(colx[j] + 10, yy + 25, cell, size=12 if i else 12, weight="700" if i == 0 else "normal",
                   fill=INK if j != 2 or i == 0 else "#2F6DB5")
    s.text(24, 602, "Current actor only: authorization reads act.sub. Nested prior actors are for audit (RFC 8693, section 4.1).",
           size=11.5, fill=MUTED, italic=True)
    s.save("credential-hops.svg")


def platform_at_a_glance() -> None:
    s = Svg(1240, 652, "The agent platform at a glance",
            "People, pipelines and internal apps reach models, team tools and hosted agents through one door, "
            "Agentgateway, which knows who is calling, what they may use, how much they may use and what it cost. "
            "Identity is on the left: Okta or Ping for people, Keycloak for platform sign-in, chain-sts for agents "
            "acting for people. Records are on the right: Dynatrace, Langfuse, audit and usage. Everything runs on the "
            "EKS clusters, GitLab and AWS accounts already operated.")
    s.text(20, 34, "The agent platform at a glance", size=20, weight="700")
    s.text(20, 56, "Every model, tool and agent call goes through one door that knows who is calling, what they may use "
                   "and what it costs.", size=12.5, fill=MUTED)
    # consumers
    cx = [280, 515, 750]
    s.band(270, 74, 700, 108, "Who uses it")
    s.box(cx[0], 100, 210, 72, "Developers", ["in Claude Code and Xcode"], "reuse")
    s.box(cx[1], 100, 210, 72, "Pipelines", ["MR reviewer, CI triage"], "reuse")
    s.box(cx[2], 100, 210, 72, "Internal apps", ["helpdesk, incident chat"], "build")
    # gateway
    fill, stroke, _ = STATUS["adopt"]
    s.rect(280, 214, 680, 128, fill, stroke)
    s.text(296, 240, "Agentgateway: the only door", size=15, weight="700")
    chips = [("Who is calling", "verified token"), ("What they may use", "routes, tools, models"),
             ("How much", "token limits, budgets"), ("What it cost", "usage per person, team")]
    for i, (t, sub) in enumerate(chips):
        x = 296 + i * 164
        s.rect(x, 256, 152, 70, "#FFFFFF", "#9CC9AE", rx=6, sw=1)
        s.text(x + 10, 280, t, size=12.5, weight="600")
        s.text(x + 10, 300, sub, size=11, fill=MUTED)
    # behind the gateway
    s.band(270, 374, 700, 108, "What it reaches")
    s.box(cx[0], 400, 210, 72, "Amazon Bedrock", ["approved models only"], "reuse")
    s.box(cx[1], 400, 210, 72, "Team tools", ["MCP servers, own rules"], "build")
    s.box(cx[2], 400, 210, 72, "Hosted agents", ["ordinary apps on EKS"], "adopt")
    for x in cx:
        s.arrow(x + 105, 172, x + 105, 214)
        s.arrow(x + 105, 342, x + 105, 400)
    # identity
    s.band(10, 74, 246, 408, "Identity")
    s.box(20, 100, 226, 72, "Okta or Ping", ["who people are (today's tier)"], "reuse")
    s.box(20, 214, 226, 72, "Keycloak", ["platform sign-in and tokens"], "adopt")
    s.box(20, 328, 226, 72, "chain-sts", ["agents acting for people,", "one target, five minutes"], "build")
    s.arrow(133, 172, 133, 214)
    s.arrow(133, 286, 133, 328)
    s.arrow(246, 278, 280, 278)
    # records
    s.band(984, 74, 246, 408, "Records")
    for i, (t, sub, st) in enumerate([("Dynatrace", "is it healthy?", "reuse"), ("Langfuse", "is it any good?", "adopt"),
                                       ("Audit", "who did what?", "build"), ("Usage ledger", "what did it cost?", "build")]):
        s.box(994, 100 + i * 94, 226, 72, t, [sub], st)
    s.arrow(960, 278, 994, 278, dash=True)
    # foundation
    s.band(10, 498, 1220, 50, "Foundation")
    s.text(24, 534, "Runs on the EKS clusters, GitLab, ECR and AWS accounts we already operate. "
                    "Nothing outside the request path (catalog, Langfuse, dashboards) can stop agents.", size=12)
    s.legend(24, 566, ["reuse", "adopt", "build"])
    s.text(420, 590, "Optional and deferred parts (kagent, Agent Substrate, AgentCore) are not shown: "
                     "none is needed for the first use cases.", size=11, fill=MUTED)
    s.save("platform-at-a-glance.svg")


if __name__ == "__main__":
    platform_architecture()
    credential_hops()
    platform_at_a_glance()
