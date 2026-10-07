#!/usr/bin/env python3
"""Build the SVG diagrams for the EKS agent platform architecture document.

Standard library only. Run from any directory:

    python3 scripts/build_diagrams.py

Writes four files to ../diagrams/. Edit the text or coordinates here and rerun;
do not edit the generated SVG files by hand.

Colors: the three status hues are the first three slots of a palette that was
checked for color-vision-deficiency separation. Status is never carried by
color alone: every status also has a border style and, where it matters, a
text badge. The diagrams draw their own light background so they stay legible
on a dark page.
"""
from __future__ import annotations

from pathlib import Path
from xml.dom import minidom
from xml.sax.saxutils import escape

OUT = Path(__file__).resolve().parent.parent / "diagrams"
FONT = "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif"

INK = "#0b0b0b"
INK2 = "#52514e"
MUTED = "#6f6e69"
SURFACE = "#fcfcfb"
FRAME = "#e4e3df"
ZONE = "#f3f2ee"
ZONE_INNER = "#faf9f6"
ZONE_STROKE = "#d3d2cc"
DENY = "#d03b3b"

STATUS = {
    "existing": {"fill": "#ebeae6", "stroke": "#8f8e88", "dash": None, "label": "Existing, reused"},
    "new": {"fill": "#e4effc", "stroke": "#2a78d6", "dash": None, "label": "New in this platform"},
    "optional": {"fill": "#e2f5ed", "stroke": "#1baf7a", "dash": "7 4", "label": "Optional"},
    "candidate": {"fill": "#fdeae1", "stroke": "#eb6834", "dash": "2.5 3", "label": "Candidate, alpha upstream"},
    "external": {"fill": "#ffffff", "stroke": "#52514e", "dash": None, "label": "External system or actor"},
}

NARROW = set("iljtfrI.,:;'|!()[] ")
WIDE = set("mwMW@")


def text_w(s: str, size: float, bold: bool = False) -> float:
    """Approximate rendered width. Slightly generous so wrapped text fits."""
    total = 0.0
    for ch in s:
        if ch in NARROW:
            total += 0.31
        elif ch in WIDE:
            total += 0.86
        elif ch.isupper():
            total += 0.66
        else:
            total += 0.55
    return total * size * (1.07 if bold else 1.0)


def wrap(s: str, max_w: float, size: float, bold: bool = False) -> list[str]:
    lines: list[str] = []
    current = ""
    for word in s.split():
        trial = f"{current} {word}".strip()
        if current and text_w(trial, size, bold) > max_w:
            lines.append(current)
            current = word
        else:
            current = trial
    if current:
        lines.append(current)
    return lines


class Svg:
    def __init__(self, name: str, w: int, h: int, title: str, desc: str):
        self.name, self.w, self.h = name, w, h
        self.title, self.desc = title, desc
        self.el: list[str] = []

    # --- primitives ---------------------------------------------------
    def add(self, s: str) -> None:
        self.el.append(s)

    def text(self, x, y, s, size=12.0, weight=400, fill=INK, anchor="start", halo=None, spacing=None, italic=False):
        style = ""
        if halo:
            style = f' style="paint-order:stroke;stroke:{halo};stroke-width:4px;stroke-linejoin:round"'
        extra = f' letter-spacing="{spacing}"' if spacing else ""
        extra += ' font-style="italic"' if italic else ""
        self.add(
            f'<text x="{x:.1f}" y="{y:.1f}" font-size="{size}" font-weight="{weight}" fill="{fill}" '
            f'text-anchor="{anchor}"{extra}{style}>{escape(s)}</text>'
        )

    def para(self, x, y, s, max_w, size=11.5, fill=INK2, weight=400, lh=1.36, italic=False, halo=None):
        """Wrapped paragraph. Returns the y of the line after the last one."""
        for line in wrap(s, max_w, size, weight >= 600):
            self.text(x, y, line, size, weight, fill, italic=italic, halo=halo)
            y += size * lh
        return y

    def heading(self, title: str, subtitle: str):
        self.text(32, 46, title, 19, 700)
        self.text(32, 68, subtitle, 12.5, 400, INK2)

    def zone(self, x, y, w, h, label, fill=ZONE, note=None):
        self.add(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{fill}" '
            f'stroke="{ZONE_STROKE}" stroke-width="1"/>'
        )
        self.text(x + 14, y + 21, label.upper(), 10.5, 700, INK2, spacing="0.6")
        if note:
            self.text(x + w - 14, y + 21, note, 10.5, 400, MUTED, anchor="end")

    def card(self, x, y, w, h, title, body=None, status="new", badge=None, owner=None,
             title_size=13.0, body_size=11.5, fill=None):
        st = STATUS[status]
        dash = f' stroke-dasharray="{st["dash"]}"' if st["dash"] else ""
        self.add(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{fill or st["fill"]}" '
            f'stroke="{st["stroke"]}" stroke-width="1.6"{dash}/>'
        )
        pad = 12
        ty = y + 22
        if owner:
            self.text(x + pad, y + 19, owner.upper(), 9.5, 700, MUTED, spacing="0.5")
            ty = y + 39
        title_w = w - 2 * pad
        if badge:
            bw = text_w(badge, 10) + 14
            bx = x + w - pad - bw
            self.add(
                f'<rect x="{bx:.1f}" y="{y + 9}" width="{bw:.1f}" height="17" rx="8.5" fill="#ffffff" '
                f'stroke="{st["stroke"]}" stroke-width="1"/>'
            )
            self.text(bx + bw / 2, y + 21, badge, 10, 600, INK2, anchor="middle")
            title_w -= bw + 6
        for line in wrap(title, title_w, title_size, True):
            self.text(x + pad, ty, line, title_size, 700)
            ty += title_size * 1.25
        end = ty
        if body:
            end = self.para(x + pad, ty + 1.5, body, w - 2 * pad, body_size)
        used = end - body_size * 1.36 + 6 if body else end - title_size * 1.25 + 6
        if used > y + h:
            print(f"  ! {self.name}: text overflows card '{title}' by {used - (y + h):.0f}px")
        return end

    def arrow(self, pts, kind="allowed", head=True):
        color = DENY if kind == "denied" else INK2
        dash = ' stroke-dasharray="5 4"' if kind == "denied" else ""
        marker = f' marker-end="url(#{"ahd" if kind == "denied" else "ah"})"' if head else ""
        d = "M" + " L".join(f"{px:.1f},{py:.1f}" for px, py in pts)
        self.add(
            f'<path d="{d}" fill="none" stroke="{color}" stroke-width="1.6" stroke-linejoin="round"{dash}{marker}/>'
        )

    def deny_mark(self, x, y):
        self.add(f'<circle cx="{x}" cy="{y}" r="8.5" fill="#ffffff" stroke="{DENY}" stroke-width="1.6"/>')
        self.add(
            f'<path d="M{x - 3.6},{y - 3.6} L{x + 3.6},{y + 3.6} M{x + 3.6},{y - 3.6} L{x - 3.6},{y + 3.6}" '
            f'stroke="{DENY}" stroke-width="1.9" stroke-linecap="round"/>'
        )

    def num(self, x, y, n):
        self.add(f'<circle cx="{x}" cy="{y}" r="9.5" fill="{DENY}"/>')
        self.text(x, y + 4, str(n), 11.5, 700, "#ffffff", anchor="middle")

    def status_legend(self, x, y, keys, title="Status"):
        self.text(x, y + 4, title, 11, 700, INK2)
        x += text_w(title, 11, True) + 16
        for key in keys:
            st = STATUS[key]
            dash = f' stroke-dasharray="{st["dash"]}"' if st["dash"] else ""
            self.add(
                f'<rect x="{x:.1f}" y="{y - 8}" width="26" height="16" rx="4" fill="{st["fill"]}" '
                f'stroke="{st["stroke"]}" stroke-width="1.6"{dash}/>'
            )
            self.text(x + 34, y + 4, st["label"], 11.5, 400, INK)
            x += 34 + text_w(st["label"], 11.5) + 26

    # --- output -------------------------------------------------------
    def save(self):
        head = (
            f'<svg xmlns="http://www.w3.org/2000/svg" width="{self.w}" height="{self.h}" '
            f'viewBox="0 0 {self.w} {self.h}" role="img" aria-labelledby="t d" font-family="{FONT}">\n'
            f'<title id="t">{escape(self.title)}</title>\n<desc id="d">{escape(self.desc)}</desc>\n'
            "<defs>\n"
            f'<marker id="ah" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
            f'orient="auto-start-reverse"><path d="M0,0.8 L10,5 L0,9.2 z" fill="{INK2}"/></marker>\n'
            f'<marker id="ahd" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" '
            f'orient="auto-start-reverse"><path d="M0,0.8 L10,5 L0,9.2 z" fill="{DENY}"/></marker>\n'
            "</defs>\n"
            f'<rect x="0.5" y="0.5" width="{self.w - 1}" height="{self.h - 1}" rx="14" fill="{SURFACE}" stroke="{FRAME}"/>\n'
        )
        doc = head + "\n".join(self.el) + "\n</svg>\n"
        minidom.parseString(doc)  # fail loudly on malformed output
        OUT.mkdir(parents=True, exist_ok=True)
        path = OUT / f"{self.name}.svg"
        path.write_text(doc, encoding="utf-8")
        print(f"wrote {path.relative_to(OUT.parent)} ({self.w}x{self.h})")


def row(x0, total_w, n, gap):
    """x positions and width for n equal cards across total_w."""
    w = (total_w - gap * (n - 1)) / n
    return [x0 + i * (w + gap) for i in range(n)], w


# ----------------------------------------------------------------------
# 1. Platform on a page
# ----------------------------------------------------------------------
def platform_overview():
    s = Svg(
        "platform-overview", 1280, 1010,
        "EKS agent platform on a page",
        "Layered view of the proposed platform. Consumers and Okta at the top; Agentgateway and the optional "
        "Agentregistry as the connectivity layer; conventional workloads, kagent with Agent Substrate and hosted "
        "MCP servers as the execution layer; service APIs, remote MCP servers and model providers behind them; "
        "CloudNativePG, S3, ECR and the GitLab package registry for state and artifacts; and the existing EKS "
        "foundation underneath. Each block is marked as existing, new, optional, candidate or external.",
    )
    s.heading(
        "EKS agent platform on a page",
        "Proposed target architecture. Color, border style and badges show the status of each block; nothing here is deployed or selected.",
    )
    bx, bw = 32, 1216
    cx, cw = 196, 1036

    def band(y, h, name, note):
        s.zone(bx, y, bw, h, "")
        end = s.para(bx + 16, y + 28, name, 134, 12.5, INK, 700, lh=1.28)
        s.para(bx + 16, end + 1, note, 134, 10.5, MUTED, lh=1.32)

    def connector(y0, y1, label, up=False):
        pts = [(216, y1 - 3), (216, y0 + 3)] if up else [(216, y0 + 3), (216, y1 - 3)]
        s.arrow(pts)
        s.text(230, (y0 + y1) / 2 + 4, label, 11.5, 400, INK2)

    # Band 1: consumers
    y = 88
    band(y, 116, "Consumers", "Who uses and publishes to the platform")
    xs, w = row(cx, cw, 4, 14)
    items = [
        ("Developer clients", "IDEs and CLI agents that already exist. Configure an endpoint and sign in.", "external"),
        ("Users of hosted agents", "People and systems that start or resume a session with a hosted agent.", "external"),
        ("Service and agent teams", "Publish tools, guidance and agents from their own repositories.", "external"),
        ("Okta", "Corporate identity for users and machine clients; issues the claims the gateway checks.", "existing"),
    ]
    for x, (t, b, st) in zip(xs, items):
        s.card(x, y + 16, w, 84, t, b, st)
    connector(204, 234, "Tool, model and agent requests carry an Okta-verified identity")

    # Band 2: connectivity
    y = 234
    band(y, 180, "Connectivity and discovery", "The governed path to tools and models")
    gx, gy, gw, gh = cx, y + 14, 770, 152
    st = STATUS["new"]
    s.add(f'<rect x="{gx}" y="{gy}" width="{gw}" height="{gh}" rx="8" fill="{st["fill"]}" stroke="{st["stroke"]}" stroke-width="1.6"/>')
    s.text(gx + 12, gy + 23, "Agentgateway", 14, 700)
    s.text(gx + 118, gy + 23, "One governed endpoint per permission and failure boundary", 11.5, 400, INK2)
    ixs, iw = row(gx + 12, gw - 24, 3, 12)
    inner = [
        ("Controller", "Watches Gateway API and policy resources; configures proxies over xDS.", None),
        ("Proxy", "MCP, LLM, A2A and HTTP routes. Verifies identity; applies tool, model and budget policy.", None),
        ("Rate-limit server", "Shared token budgets across proxy replicas; part of the baseline once budgets are enforced.", "if budgets"),
    ]
    for x, (t, b, badge) in zip(ixs, inner):
        s.card(x, gy + 36, iw, 104, t, b, "new", badge, fill="#ffffff")
    s.card(
        gx + gw + 14, gy, cw - gw - 14, gh, "Agentregistry",
        "Catalog of MCP servers, agents, skills and prompts. Publication makes a capability discoverable. "
        "It deploys nothing and is not in the request path.",
        "optional", "optional",
    )
    connector(414, 444, "Hosted agents reach tools and models only through the gateway", up=True)

    # Band 3: execution
    y = 444
    band(y, 118, "Execution", "Only where a component needs a hosted process")
    xs, w = row(cx, cw, 3, 14)
    items = [
        ("Conventional workloads", "Deployments and Jobs from the platform chart, with workload identity, limits and telemetry.", "new", "default path"),
        ("kagent and Agent Substrate", "Declarative agents and sessions in gVisor sandboxes, suspended and resumed from snapshots.", "candidate", "alpha"),
        ("Hosted MCP servers", "Adapters that service teams own and deploy from the platform chart, exposed through the gateway.", "new", None),
    ]
    for x, (t, b, st_, badge) in zip(xs, items):
        s.card(x, y + 16, w, 86, t, b, st_, badge)
    connector(562, 592, "Gateway and tool servers call backends with scoped credentials")

    # Band 4: capabilities
    y = 592
    band(y, 118, "Capabilities and providers", "What the governed path reaches")
    items = [
        ("Service APIs", "Enforce tenant ownership, business limits and idempotency. Gateway permission never overrides them.", "existing"),
        ("Remote MCP servers", "Integrations already hosted elsewhere, bound at the gateway without new compute.", "existing"),
        ("Model providers", "Reached only through the gateway, which holds the provider credential and applies approved-model policy.", "external"),
    ]
    for x, (t, b, st_) in zip(xs, items):
        s.card(x, y + 16, w, 86, t, b, st_)

    # Band 5: state and artifacts
    y = 724
    band(y, 116, "State and artifacts", "Durable data and released bytes")
    xs4, w4 = row(cx, cw, 4, 14)
    items = [
        ("CloudNativePG", "Separate databases and credentials for registry, runtime and application state.", "existing"),
        ("S3", "Runtime snapshots, packages and artifacts. Buckets and lifecycle still to inventory.", "existing"),
        ("ECR", "Images, Helm charts and content bundles, pinned by digest.", "existing"),
        ("GitLab package registry", "Packages that only pipelines read, such as shared libraries.", "existing"),
    ]
    for x, (t, b, st_) in zip(xs4, items):
        s.card(x, y + 16, w4, 84, t, b, st_)

    # Band 6: foundation
    y = 854
    band(y, 116, "Foundation and operations", "Reused before anything is replaced")
    xs5, w5 = row(cx, cw, 5, 14)
    items = [
        ("EKS, Karpenter, Istio", "Cluster, node capacity and service networking.", "existing", None),
        ("Kyverno", "Admission restrictions on permitted resources and fields.", "existing", None),
        ("OpenTelemetry", "Existing collectors exporting to New Relic or Dynatrace.", "existing", None),
        ("GitLab CI, Helmfile, Terraform", "Delivery on self-hosted runners; AWS additions in existing units.", "existing", None),
        ("Langfuse", "Prompt and evaluation workspace, only if teams need it.", "optional", "optional"),
    ]
    for x, (t, b, st_, badge) in zip(xs5, items):
        s.card(x, y + 16, w5, 84, t, b, st_, badge)

    s.status_legend(32, 990, ["existing", "new", "optional", "candidate", "external"])
    s.save()


# ----------------------------------------------------------------------
# 2. Trust boundaries and bypass paths
# ----------------------------------------------------------------------
def trust_boundaries():
    s = Svg(
        "trust-boundaries", 1280, 900,
        "Trust boundaries and bypass paths",
        "A developer client outside the cluster reaches the Agentgateway proxy with an Okta token. Hosted agents "
        "call tools and models through the proxy. Five paths must be denied: an agent calling an MCP server or "
        "backend directly, an agent calling a model provider directly, a client reaching a runtime API around "
        "its entry point, a team policy weakening a platform rule, and a CI job pod making the same direct calls.",
    )
    s.heading(
        "Trust boundaries and bypass paths",
        "The gateway is a control point only if the paths around it are denied. Solid lines are intended paths; red dashed lines must fail.",
    )

    # Zones
    s.zone(32, 90, 200, 560, "Outside the cluster")
    s.zone(262, 90, 750, 560, "EKS cluster")
    s.zone(1042, 90, 206, 186, "External services")
    s.zone(282, 126, 710, 146, "Gateway namespace", ZONE_INNER)
    s.zone(282, 296, 330, 160, "Agent workload namespaces", ZONE_INNER)
    s.zone(642, 296, 350, 160, "Tool and service namespaces", ZONE_INNER)
    s.zone(282, 480, 710, 150, "CI runner namespace", ZONE_INNER)

    # Cards
    s.card(48, 176, 168, 76, "Developer client", "IDE or CLI agent", "external")
    s.card(48, 500, 168, 104, "Okta", "Issues tokens. The gateway validates issuer, audience and claims.", "existing")
    s.card(302, 176, 440, 76, "Agentgateway proxy",
           "Verifies the caller, applies tool, model and budget policy, and holds the provider credential.", "new")
    s.card(792, 176, 180, 76, "Team-attached policy", "A more specific route or backend policy", "existing")
    s.card(302, 346, 290, 76, "Hosted agent", "Deployment, Job or kagent actor with its own workload identity", "new")
    s.card(662, 346, 140, 76, "MCP server", "Tool adapter", "new")
    s.card(842, 346, 130, 76, "Service API", "Business authorization", "existing")
    s.card(302, 530, 290, 76, "GitLab job pod", "Runs merge request code inside the cluster network", "existing")
    s.card(1058, 176, 174, 76, "Model providers", "Accept only the gateway's credential", "external")
    s.para(
        662, 548,
        "Runners are self-hosted in this cluster, so job pods get the same network policy and node separation "
        "as untrusted workloads. Deployment rights come only from ID-token roles on protected runners.",
        300, 11.5, INK2,
    )

    # Intended paths
    s.arrow([(216, 214), (302, 214)])
    s.text(259, 206, "Okta token", 11, 400, INK2, anchor="middle", halo=SURFACE)
    s.arrow([(700, 176), (700, 152), (1145, 152), (1145, 176)])
    s.text(905, 146, "provider credential, held only at the gateway", 11, 400, INK2, anchor="middle", halo=ZONE_INNER)
    s.arrow([(700, 252), (700, 346)])
    s.text(709, 289, "gateway identity", 11, 400, INK2, halo=ZONE)
    s.arrow([(400, 346), (400, 252)])
    s.text(409, 289, "delegated context or machine credential", 11, 400, INK2, halo=ZONE)
    s.arrow([(802, 384), (842, 384)])
    s.arrow([(160, 252), (160, 366), (302, 366)])
    s.text(168, 296, "authenticated", 11, 400, INK2, halo=ZONE)
    s.text(168, 310, "entry point", 11, 400, INK2, halo=ZONE)

    # Paths that must be denied
    s.arrow([(96, 252), (96, 404), (302, 404)], "denied")       # 3
    s.deny_mark(282, 404)
    s.num(96, 330, 3)
    s.arrow([(592, 384), (662, 384)], "denied")                  # 1
    s.deny_mark(642, 384)
    s.num(617, 366, 1)
    s.arrow([(592, 568), (627, 568), (627, 410), (662, 410)], "denied")  # 5
    s.deny_mark(642, 410)
    s.num(627, 506, 5)
    s.arrow([(540, 422), (540, 468), (1145, 468), (1145, 252)], "denied")  # 2
    s.deny_mark(1012, 468)
    s.num(780, 468, 2)
    s.arrow([(792, 214), (742, 214)], "denied")                  # 4
    s.deny_mark(767, 214)
    s.num(767, 194, 4)

    # Legend
    s.text(32, 686, "Bypass paths and the candidate control for each", 13, 700)
    s.text(32, 704, "No control is selected yet. Each path needs a denied-path result in the pilot.", 11.5, 400, INK2)
    items = [
        (1, "A workload calls an MCP or backend service directly.",
         "Network policy from the cluster's policy engine; the backend accepts only the gateway's workload identity."),
        (2, "A workload calls a model provider directly.",
         "The provider credential exists only at the gateway; namespace egress is limited to approved destinations; provider-side policy."),
        (3, "A client reaches a hosted runtime API around its entry point.",
         "The runtime API is not exposed outside the cluster; the entry point authenticates the user and binds them to the session."),
        (4, "A team attaches a more specific policy that weakens a platform rule.",
         "RBAC on route, backend and policy resources; Kyverno rules on permitted fields."),
        (5, "A CI job pod makes the same direct calls.",
         "The runner namespace is included in the network policy and in every denied-path check."),
    ]
    col_x = [32, 660]
    ys = [732.0, 732.0]
    for n, name, control in items:
        c = 0 if n <= 3 else 1
        x, y = col_x[c], ys[c]
        s.num(x + 10, y - 4, n)
        s.text(x + 28, y, name, 12, 700)
        end = s.para(x + 28, y + 16, control, 560, 11.5, INK2)
        ys[c] = end + 12
    # Line key (right column, under items 4 and 5)
    ky = ys[1] + 6
    s.arrow([(660, ky), (706, ky)])
    s.text(716, ky + 4, "Intended path", 11.5)
    s.arrow([(840, ky), (886, ky)], "denied")
    s.deny_mark(863, ky)
    s.text(896, ky + 4, "Path that must be denied, with the point where the control acts", 11.5)
    s.status_legend(660, ky + 28, ["existing", "new", "external"])
    s.save()


# ----------------------------------------------------------------------
# 3. Deployment topology
# ----------------------------------------------------------------------
def deployment_topology():
    s = Svg(
        "deployment-topology", 1280, 1020,
        "Deployment topology for one environment",
        "Illustrative layout of one environment. External systems at the top. Inside one AWS account, an existing "
        "EKS cluster holds platform namespaces for Agentgateway and the optional Agentregistry, candidate runtime "
        "namespaces for kagent and Agent Substrate, domain and workload namespaces, existing cluster services and "
        "node pools. AWS services used by the platform are ECR, S3, workload IAM, secret delivery and egress to "
        "model providers.",
    )
    s.heading(
        "Deployment topology for one environment",
        "Illustrative. Namespace names, the number of gateways and whether environments share a cluster are not yet inventoried.",
    )
    xs, w = row(32, 1216, 5, 14)
    ext = [
        ("Developer clients", "IDEs and CLI agents"),
        ("Okta", "Tokens for users and machines"),
        ("GitLab.com", "Source, merge requests, pipelines"),
        ("Model providers", "Reached only through the gateway"),
        ("New Relic or Dynatrace", "Operational telemetry backend"),
    ]
    for x, (t, b) in zip(xs, ext):
        s.card(x, 88, w, 62, t, b, "existing" if t in ("Okta", "GitLab.com", "New Relic or Dynatrace") else "external")

    s.zone(32, 170, 1216, 756, "AWS account for one environment (dev, stage or prod)")
    s.zone(48, 202, 900, 708, "EKS cluster", ZONE_INNER, note="existing; versions and capacity to inventory")
    ix, iw = 64, 868

    def inner_zone(y, h, label, note=None):
        s.zone(ix, y, iw, h, label, "#f1f0ec", note=note)

    # Platform namespaces
    inner_zone(234, 130, "Platform namespaces")
    xs4, w4 = row(ix + 14, iw - 28, 4, 12)
    items = [
        ("Agentgateway controller", "Control plane; serves configuration to proxies over xDS", "new", None),
        ("Agentgateway proxies", "One Deployment per Gateway; replicas across zones", "new", None),
        ("Rate-limit server", "Shared token budgets", "new", "if budgets"),
        ("Agentregistry", "Catalog service with its own database", "optional", "optional"),
    ]
    for x, (t, b, st, badge) in zip(xs4, items):
        s.card(x, 264, w4, 86, t, b, st, badge)

    # Candidate runtime
    inner_zone(376, 130, "Candidate runtime namespaces", "only if kagent is adopted")
    xs3, w3 = row(ix + 14, iw - 28, 3, 12)
    items = [
        ("kagent controller", "Compiles each Agent into an immutable revision; tracks sessions in PostgreSQL", "candidate", "alpha"),
        ("Substrate control plane", "ate-api-server Deployment and atelet DaemonSet", "candidate", None),
        ("Worker pool", "gVisor workers, one actor at a time, sized for concurrent turns", "candidate", None),
    ]
    for x, (t, b, st, badge) in zip(xs3, items):
        s.card(x, 406, w3, 86, t, b, st, badge)

    # Domain and workload namespaces
    inner_zone(518, 130, "Domain and workload namespaces", "names are examples from the notes")
    items = [
        ("payments-mcp", "Hosted MCP server from the platform chart", "new", None),
        ("incident-assistant", "Hosted agent with its own workload identity", "new", None),
        ("Batch and scheduled work", "Jobs with named machine identities", "new", None),
        ("Service APIs", "Existing services behind the tools", "existing", None),
    ]
    for x, (t, b, st, badge) in zip(xs4, items):
        s.card(x, 548, w4, 86, t, b, st, badge)

    # Existing cluster services
    inner_zone(660, 112, "Existing cluster services")
    xs6, w6 = row(ix + 14, iw - 28, 6, 10)
    items = [
        ("Istio", "Mesh"), ("Kyverno", "Admission"), ("Karpenter", "Nodes"),
        ("CloudNativePG", "PostgreSQL"), ("OTel collector", "Telemetry"), ("GitLab runners", "CI job pods"),
    ]
    for x, (t, b) in zip(xs6, items):
        s.card(x, 690, w6, 68, t, b, "existing")

    # Node pools
    inner_zone(784, 110, "Node pools")
    items = [
        ("General pool", "Gateway, tools and conventional agents", "existing"),
        ("gVisor-capable pool", "Substrate workers, only if kagent is adopted", "candidate"),
        ("Runner pool", "Kept separate from workloads", "existing"),
    ]
    for x, (t, b, st) in zip(xs3, items):
        s.card(x, 814, w3, 66, t, b, st)

    # AWS services column
    s.zone(964, 202, 268, 708, "AWS services", ZONE_INNER)
    items = [
        ("ECR", "Images, Helm charts and content bundles. Immutable tags, pinned by digest.", "existing"),
        ("S3", "Runtime snapshots, packages and artifacts. Buckets, encryption and lifecycle to inventory.", "existing"),
        ("Workload IAM", "A scoped role per workload through the EKS identity mechanism. No shared execution role.", "existing"),
        ("Secret delivery", "Mechanism not yet identified. Manifests hold references, never values.", "existing"),
        ("Egress to model providers", "Private connectivity or restricted egress, from the gateway only.", "new"),
        ("AWS infrastructure units", "Existing Terraform, OpenTofu and Terragrunt state owns IAM, S3 and DNS additions.", "existing"),
    ]
    y = 234
    for t, b, st in items:
        s.card(978, y, 240, 100, t, b, st)
        y += 111

    s.status_legend(32, 952, ["existing", "new", "optional", "candidate", "external"])
    s.para(
        32, 984,
        "Stronger execution or data isolation may justify separate nodes or clusters. Namespace separation alone "
        "does not establish isolation for arbitrary code.",
        1216, 11.5, INK2,
    )
    s.save()


# ----------------------------------------------------------------------
# 4. Configuration authority
# ----------------------------------------------------------------------
def configuration_authority():
    s = Svg(
        "configuration-authority", 1280, 700,
        "Configuration authority: one writer per object",
        "Five stages from left to right, each with one owner: component source repository, artifact stores, "
        "environment configuration, the Helm release applied by the delivery pipeline, and controllers. Catalog "
        "metadata, the AWS infrastructure repository and downstream business authorization sit beside the flow. "
        "The registry CLI, ad-hoc kubectl and the runner pod identity are not writers of production objects.",
    )
    s.heading(
        "Configuration authority: one writer per object",
        "A release moves left to right. Each stage has one owner, and no later stage rewrites what an earlier one owns.",
    )
    gap = 56
    xs, w = row(32, 1216, 5, gap)
    top, h = 96, 182
    stages = [
        ("Component team", "Component source repository",
         "Behavior, tool contracts, prompts, skills and scenarios.",
         "CI cannot expand deployment permissions implicitly."),
        ("Publisher CI", "Artifact stores",
         "Released bytes in ECR, S3 or the GitLab package registry.",
         "A released reference resolves to immutable content."),
        ("Environment owners", "Environment configuration",
         "Production version, placement and bindings, changed by a selection MR.",
         "The registry or a CLI does not change these objects."),
        ("Delivery pipeline", "Helm release",
         "Declared Kubernetes resources, applied through Helmfile.",
         "No overlapping Terraform or CLI writer."),
        ("Controllers", "Generated resources",
         "Children and status produced by Agentgateway and kagent controllers.",
         "The pipeline does not patch controller-owned fields."),
    ]
    for x, (owner, title, body, rule) in zip(xs, stages):
        end = s.card(x, top, w, h, title, body, "external", owner=owner)
        s.add(f'<path d="M{x + 12:.1f},{end + 2:.1f} L{x + w - 12:.1f},{end + 2:.1f}" stroke="{FRAME}" stroke-width="1.2"/>')
        s.text(x + 12, end + 20, "RULE", 9.5, 700, MUTED, spacing="0.5")
        s.para(x + 12, end + 36, rule, w - 24, 11.5, INK)
    labels = ["publish", "select", "apply", "reconcile"]
    for i, lab in enumerate(labels):
        x0 = xs[i] + w
        s.arrow([(x0 + 5, top + h / 2), (x0 + gap - 5, top + h / 2)])
        s.text(x0 + gap / 2, top + h / 2 - 9, lab, 11, 400, INK2, anchor="middle")

    # Side authorities
    y2, h2 = 336, 122
    xs3, w3 = row(32, 1216, 3, 28)
    side = [
        ("Publication workflow", "Catalog metadata",
         "Agentregistry entries advertise approved usage and endpoints, after deployment verification. "
         "Metadata is not production deployment state."),
        ("Platform team", "AWS infrastructure repository",
         "Existing Terraform, OpenTofu and Terragrunt units own IAM, S3, DNS and added cluster infrastructure. "
         "One state owner per resource; outputs supply narrow bindings, never secret values."),
        ("Downstream service", "Business authorization",
         "Tenant ownership, limits and idempotency are decided by the service that owns the data. "
         "Gateway permission cannot override it."),
    ]
    for x, (owner, title, body) in zip(xs3, side):
        s.card(x, y2, w3, h2, title, body, "external", owner=owner)
    # artifact stores -> catalog metadata ; infra repo -> environment configuration
    ax = xs[1] + w / 2
    s.arrow([(ax, top + h + 4), (ax, y2 - 4)])
    s.text(ax + 9, (top + h + y2) / 2 + 4, "advertise", 11, 400, INK2, halo=SURFACE)
    ex = xs[2] + w / 2
    s.arrow([(ex, y2 - 4), (ex, top + h + 4)])
    s.text(ex + 9, (top + h + y2) / 2 + 4, "bindings", 11, 400, INK2, halo=SURFACE)

    # Not writers
    y3 = 486
    s.zone(32, y3, 1216, 150, "Not writers of production objects")
    xs3b, w3b = row(46, 1188, 3, 14)
    nots = [
        ("Registry CLI or registry deployment integration",
         "Adopting it as production authority would mean removing the conflicting Helm ownership. A dedicated sandbox may use it."),
        ("Ad-hoc kubectl",
         "Emergency change only: a named operator, an audit record and immediate reconciliation into configuration."),
        ("Runner pod service account or node role",
         "Deployment rights sit on ID-token roles and protected runners, not on the runner itself."),
    ]
    for x, (title, body) in zip(xs3b, nots):
        s.add(f'<rect x="{x:.1f}" y="{y3 + 34}" width="{w3b:.1f}" height="100" rx="8" fill="#ffffff" stroke="{DENY}" stroke-width="1.4" stroke-dasharray="5 4"/>')
        s.deny_mark(x + 22, y3 + 58)
        ty = y3 + 56
        for line in wrap(title, w3b - 56, 13, True):
            s.text(x + 40, ty, line, 13, 700)
            ty += 16.5
        s.para(x + 40, ty + 2, body, w3b - 56, 11.5, INK2)

    s.para(
        32, 664,
        "Source: configuration authority in the repository structure note. One owner controls each object or field, "
        "including controller-generated resources.",
        1216, 11.5, INK2,
    )
    s.save()


if __name__ == "__main__":
    platform_overview()
    trust_boundaries()
    deployment_topology()
    configuration_authority()
