#!/usr/bin/env python3
"""Build the SVG diagrams for the agent platform proposal pages.

Standard library only. Run from any directory:

    python3 scripts/build_diagrams.py

Writes nine files to ../diagrams/. Edit the text or coordinates here and rerun;
do not edit the generated SVG files by hand.

The first four diagrams come unchanged from the architecture document
(Docs/AgentGateway/scripts/build_diagrams.py): platform-overview,
trust-boundaries, deployment-topology and configuration-authority. The other
five were added for the proposal: options-side-by-side, identity-at-each-hop,
customization-levels, demo-topology and demo-coverage.

Colors: the three status hues are the first three slots of a palette that was
checked for color-vision-deficiency separation. Status is never carried by
color alone: every status also has a border style and, where it matters, a
text badge. The two demo diagrams reuse the same hues for evidence (ran as
itself, stand-in, not exercised), again with a border style and a badge each.
The diagrams draw their own light background so they stay legible on a dark
page.
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

# Evidence states for the two demo diagrams. Same hues, different meaning, so
# these diagrams carry their own legend.
STATUS.update({
    "ran": {"fill": "#e4effc", "stroke": "#2a78d6", "dash": None, "label": "Ran as itself"},
    "standin": {"fill": "#e2f5ed", "stroke": "#1baf7a", "dash": "7 4", "label": "Stand-in for the real component"},
    "notrun": {"fill": "#ffffff", "stroke": "#8f8e88", "dash": "2.5 3", "label": "Not exercised"},
    "fixture": {"fill": "#ebeae6", "stroke": "#8f8e88", "dash": None, "label": "Demo fixture"},
})
OPEN = "#eb6834"
MONO = "ui-monospace, SFMono-Regular, Menlo, Consolas, 'Liberation Mono', monospace"

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


def mono_w(s: str, size: float) -> float:
    """Width of monospaced text."""
    return len(s) * size * 0.61


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

    def status_legend(self, x, y, keys, title="Status", labels=None):
        self.text(x, y + 4, title, 11, 700, INK2)
        x += text_w(title, 11, True) + 16
        for key in keys:
            st = STATUS[key]
            label = (labels or {}).get(key, st["label"])
            dash = f' stroke-dasharray="{st["dash"]}"' if st["dash"] else ""
            self.add(
                f'<rect x="{x:.1f}" y="{y - 8}" width="26" height="16" rx="4" fill="{st["fill"]}" '
                f'stroke="{st["stroke"]}" stroke-width="1.6"{dash}/>'
            )
            self.text(x + 34, y + 4, label, 11.5, 400, INK)
            x += 34 + text_w(label, 11.5) + 26

    # --- additions for the proposal diagrams ----------------------------
    def mono(self, x, y, s, size=11.0, weight=400, fill=INK, anchor="start"):
        self.add(
            f'<text x="{x:.1f}" y="{y:.1f}" font-family="{MONO}" font-size="{size}" font-weight="{weight}" '
            f'fill="{fill}" text-anchor="{anchor}">{escape(s)}</text>'
        )

    def pill(self, x, y, s, size=10.5, mono=False, stroke=ZONE_STROKE, fill="#ffffff", ink=INK2, weight=600):
        """Rounded label, 20 high, top-left at x, y. Returns its width."""
        w = (mono_w(s, size) if mono else text_w(s, size, weight >= 600)) + 16
        self.add(
            f'<rect x="{x:.1f}" y="{y:.1f}" width="{w:.1f}" height="20" rx="10" fill="{fill}" '
            f'stroke="{stroke}" stroke-width="1.1"/>'
        )
        if mono:
            self.mono(x + w / 2, y + 14, s, size, 400, ink, anchor="middle")
        else:
            self.text(x + w / 2, y + 14, s, size, weight, ink, anchor="middle")
        return w

    def step(self, x, y, n):
        """Neutral numbered marker for a connection."""
        self.add(f'<circle cx="{x}" cy="{y}" r="9.5" fill="{INK2}" stroke="#ffffff" stroke-width="1.6"/>')
        self.text(x, y + 4, str(n), 11.5, 700, "#ffffff", anchor="middle")

    def open_arrow(self, pts):
        """A path whose design is still an open decision."""
        d = "M" + " L".join(f"{px:.1f},{py:.1f}" for px, py in pts)
        self.add(
            f'<path d="{d}" fill="none" stroke="{INK2}" stroke-width="1.6" stroke-linejoin="round" '
            f'stroke-dasharray="2.5 4" marker-end="url(#ah)"/>'
        )

    def open_badge(self, x, y, decision):
        """Pill that marks an open decision. Returns its width."""
        return self.pill(x, y, f"open, {decision}", 10.5, stroke=OPEN, ink=INK)

    def ns_zone(self, x, y, w, h, names, note=None, fill=ZONE_INNER):
        """A Kubernetes namespace: the label keeps the names in lower case, monospaced."""
        self.add(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="12" fill="{fill}" '
            f'stroke="{ZONE_STROKE}" stroke-width="1"/>'
        )
        label = "NAMESPACE" if len(names) == 1 else "NAMESPACES"
        self.text(x + 14, y + 21, label, 9.5, 700, MUTED, spacing="0.6")
        lx = x + 14 + text_w(label, 9.5, True) + 0.6 * len(label) + 8
        self.mono(lx, y + 21, ", ".join(names), 11, 600, INK2)
        if note:
            self.text(x + w - 14, y + 21, note, 10.5, 400, MUTED, anchor="end")

    def standin(self, x, y, w, h, title, body, stands_for, title_size=13.0, body_size=11.5):
        """A component that stands in for something else: dashed border and a footer that says for what."""
        st = STATUS["standin"]
        self.add(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8" fill="{st["fill"]}" '
            f'stroke="{st["stroke"]}" stroke-width="1.6" stroke-dasharray="{st["dash"]}"/>'
        )
        ty = y + 22
        for line in wrap(title, w - 24, title_size, True):
            self.text(x + 12, ty, line, title_size, 700)
            ty += title_size * 1.25
        end = self.para(x + 12, ty + 1.5, body, w - 24, body_size) if body else ty
        fy = y + h - 28
        if end - body_size * 1.36 + 6 > fy - 10:
            print(f"  ! {self.name}: text overflows stand-in '{title}'")
        self.text(x + 12, fy, "STANDS IN FOR", 9, 700, MUTED, spacing="0.5")
        self.text(x + 12, fy + 16, stands_for, 11.5, 700, INK)

    def slim(self, x, y, w, h, title, note=None, status="fixture"):
        """One-line card."""
        st = STATUS[status]
        dash = f' stroke-dasharray="{st["dash"]}"' if st["dash"] else ""
        self.add(
            f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="7" fill="{st["fill"]}" '
            f'stroke="{st["stroke"]}" stroke-width="1.6"{dash}/>'
        )
        self.text(x + 12, y + h / 2 + 4.5, title, 12.5, 700)
        if note:
            self.text(x + w - 12, y + h / 2 + 4, note, 10.5, 400, INK2, anchor="end")

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


# ----------------------------------------------------------------------
# 5. The two options side by side
# ----------------------------------------------------------------------
def options_side_by_side():
    s = Svg(
        "options-side-by-side", 1280, 990,
        "Two options, compared on one basis",
        "A band at the top lists what both options use: GitLab.com CI/CD on self-hosted runners, ECR, Okta and "
        "OpenTelemetry with New Relic or Dynatrace. Below it, two columns compare the EKS agent platform and "
        "AgentCore on eight concerns: tool governance, model access, hosted execution, session state, deployment "
        "selection, release gate, catalog and cost shape. A band at the bottom lists the shared comparison basis: "
        "the same requirement values, one pilot workload, twelve common experiments and one ten-criterion "
        "scorecard. Neither option is selected.",
    )
    s.heading(
        "Two options, compared on one basis",
        "Neither option is selected. Both are measured against the same requirement values, pilot workload, experiments and scorecard.",
    )

    s.zone(32, 88, 1216, 112, "Both options use")
    xs, w = row(46, 1188, 4, 14)
    shared = [
        ("GitLab.com CI/CD", "Merge requests and pipelines, on self-hosted runners in the existing EKS cluster."),
        ("ECR", "Container images and Helm charts as OCI artifacts."),
        ("Okta", "Corporate identity for users and machine clients."),
        ("OpenTelemetry", "Export to New Relic or Dynatrace as the operational backend."),
    ]
    for x, (t, b) in zip(xs, shared):
        s.card(x, 118, w, 68, t, b, "existing")

    lx, c1, c2, cw = 32, 222, 736, 506
    s.text(lx + 14, 262, "CONCERN", 10.5, 700, INK2, spacing="0.6")
    s.card(c1, 218, cw, 76, "EKS agent platform",
           "Agentgateway as the connectivity layer, with optional hosted execution, on the EKS infrastructure we already operate.",
           "external", title_size=15)
    s.card(c2, 218, cw, 76, "AgentCore",
           "AWS AgentCore, managed through Terraform and Terragrunt.",
           "external", title_size=15)

    rows = [
        ("Tool governance", "Agentgateway on EKS.", "AgentCore domain tool gateway."),
        ("Model access", "Gateway model endpoint. The provider credential stays at the gateway.",
         "Execution role and approved model list. An inference gateway is optional later."),
        ("Hosted execution", "Conventional Deployment, or kagent and Agent Substrate.",
         "Managed harness or custom runtime."),
        ("Session state", "CloudNativePG, with S3 snapshots.", "AgentCore memory, owned per workload."),
        ("Deployment selection", "Helm values under agent-deployments, applied by Helmfile.",
         "deployment.yaml under agentcore-deployments, applied by Terraform, with candidate and active releases."),
        ("Release gate", "Checks proportional to the change. Candidates only for identified risks.",
         "Isolated candidate, evidence bound to a manifest hash, then activation."),
        ("Catalog", "Agentregistry, optional.", "AWS Agent Registry."),
        ("Cost shape", "Provisioned capacity and operating effort. Unpriced.",
         "Metered services. Priced inventory with illustrative totals."),
    ]
    y, rh, gap = 308, 56, 8
    lh = 12 * 1.36
    for concern, a, b in rows:
        s.add(f'<rect x="{lx}" y="{y}" width="1216" height="{rh}" rx="8" fill="{ZONE}" stroke="{ZONE_STROKE}" stroke-width="1"/>')
        s.text(lx + 14, y + rh / 2 + 4.5, concern, 12.5, 700)
        for cx, txt in ((c1, a), (c2, b)):
            s.add(f'<rect x="{cx}" y="{y + 6}" width="{cw}" height="{rh - 12}" rx="6" fill="#ffffff" stroke="{STATUS["external"]["stroke"]}" stroke-width="1.2"/>')
            lines = wrap(txt, cw - 44, 12)
            ty = y + rh / 2 + 4.2 - (len(lines) - 1) * lh / 2
            for line in lines:
                s.text(cx + 14, ty, line, 12, 400, INK)
                ty += lh
        y += rh + gap

    y += 12
    s.zone(32, y, 1216, 116, "Compared on one basis")
    basis = [
        ("The same requirement values", "Agreed once and carried into both plans. None is agreed yet."),
        ("One pilot workload", "One service, one consumer, one task set and one model configuration."),
        ("Twelve common experiments", "Run with the same identities, task set and retained data."),
        ("One scorecard, ten criteria", "A pass only against an agreed value. Otherwise an observation."),
    ]
    for x, (t, b) in zip(xs, basis):
        s.card(x, y + 30, w, 72, t, b, "external")
    s.para(
        32, y + 116 + 26,
        "Possible outcomes: a smaller tool-access platform, conventional EKS execution, conditional kagent adoption, "
        "AgentCore, hybrid use, deferral or rejection. An unpriced option is not a cheaper one.",
        1216, 11.5, INK2,
    )
    s.save()


# ----------------------------------------------------------------------
# 6. Identity at each hop
# ----------------------------------------------------------------------
def identity_at_each_hop():
    s = Svg(
        "identity-at-each-hop", 1280, 920,
        "Identity at each hop",
        "Three parties are kept apart: the human requesting work, the workload performing it and the downstream "
        "service that authorizes the operation. A developer client or user reaches Agentgateway with an Okta "
        "access token. The gateway forwards permitted tool calls to an MCP server or hosted agent, which calls "
        "the service API with a resource-specific credential; the service checks its own permissions. For models, "
        "the caller presents a gateway-issued key or an Okta-derived token, and the gateway calls the model "
        "provider with a credential only it holds. Two points are open: the credential on a model request (D-4) "
        "and the entry point for hosted agents (D-5).",
    )
    s.heading(
        "Identity at each hop",
        "Intended paths. Each connection has its own credential and its own authorizer, and each needs a permitted and a denied test in the pilot.",
    )

    s.zone(32, 88, 1216, 114, "Three parties")
    xs, w = row(46, 1188, 3, 14)
    parties = [
        ("The human requesting work", "Signs in with Okta. An authenticated user may still lack permission for a tool.", "external"),
        ("The workload performing it", "Runs under its own workload identity. It does not inherit a broad platform role.", "new"),
        ("The downstream service", "Authorizes the operation itself, against its own permissions and tenant data.", "existing"),
    ]
    for x, (t, b, st) in zip(xs, parties):
        s.card(x, 118, w, 70, t, b, st)

    # Nodes
    top, tall = 262, 214
    s.card(32, top, 200, tall, "Developer client or user",
           "An existing IDE or CLI client, or a person or system that uses a hosted agent.", "external")
    s.card(392, top, 216, tall, "Agentgateway",
           "Verifies the caller on every request. Shows only the tools this caller may use. Restricts models and "
           "applies budgets. Holds the provider credential.", "new")
    s.card(768, top, 216, 96, "MCP server or hosted agent",
           "A tool adapter in front of a service, or an agent with its own workload identity.", "new")
    s.card(1052, top, 196, 96, "Service API",
           "Decides on tenant ownership, limits and idempotency.", "existing")
    s.card(768, top + 118, 216, 96, "Model provider",
           "Accepts only the credential that the gateway holds.", "external")

    # Open: how a user reaches a hosted agent
    s.open_arrow([(132, top), (132, 236), (876, 236), (876, top - 3)])
    label = "A user reaching a hosted agent: through a gateway route, or the runtime's own API?"
    lw = text_w(label, 11.5) * 1.07
    lx0 = 504 - (lw + 86) / 2
    s.add(f'<rect x="{lx0 - 8:.1f}" y="222" width="{lw + 104:.1f}" height="26" rx="6" fill="{SURFACE}"/>')
    s.text(lx0, 240, label, 11.5, 400, INK2)
    s.open_badge(lx0 + lw + 12, 226, "D-5")

    # Connections
    y1, y4, y3, y5 = top + 34, top + 68, top + 48, top + 166
    s.arrow([(232, y1), (389, y1)])
    s.text(312, y1 - 16, "tools", 11, 400, INK2, anchor="middle")
    s.step(312, y1, 1)
    s.arrow([(608, y1), (765, y1)])
    s.step(688, y1, 2)
    s.arrow([(984, y3), (1049, y3)])
    s.step(1016, y3, 3)
    s.arrow([(768, y4), (611, y4)])
    s.step(688, y4, 4)
    s.arrow([(232, y5), (389, y5)])
    s.text(312, y5 - 16, "models", 11, 400, INK2, anchor="middle")
    s.step(312, y5, 5)
    bw = text_w("open, D-4", 10.5, True) + 16
    s.open_badge(312 - bw / 2, y5 + 16, "D-4")
    s.arrow([(608, y5), (765, y5)])
    s.step(688, y5, 6)

    # Legend
    ly = 516
    s.text(32, ly, "The credential on each connection, and who authorizes it", 13, 700)
    s.text(32, ly + 18,
           "From the connection matrix. The pilot records the actual credential, verified principal, audience and decision at each hop.",
           11.5, 400, INK2)
    items = [
        (1, "Developer client to the gateway, for tools", None,
         "Okta access token, through the supported MCP OAuth flow.",
         "The gateway. It validates issuer and audience and matches exact entitlements."),
        (2, "Gateway to an MCP server", "D-7",
         "Explicit backend identity, over TLS or the mesh.",
         "The backend, which accepts the gateway and no other caller. The control is not selected."),
        (3, "MCP server to the service API", None,
         "Resource-specific delegated token or application credential.",
         "The service. It checks its own permissions and tenant data."),
        (4, "Hosted agent to tools, back through the gateway", None,
         "Verified delegated context or a scoped machine credential.",
         "The gateway and the downstream service."),
        (5, "Client or hosted agent to the model endpoint", "D-4",
         "Gateway-issued key or Okta-derived token. Never the provider's own key.",
         "The gateway. It validates the caller, then applies approved models and budgets."),
        (6, "Gateway to the model provider", None,
         "Provider credential held by the gateway, through the secret mechanism or workload identity.",
         "Provider account policy. The gateway limits models and usage."),
    ]
    col_x = [32, 660]
    ys = [ly + 50.0, ly + 50.0]
    tab = 124
    for n, name, decision, cred, auth in items:
        c = 0 if n <= 3 else 1
        x, y = col_x[c], ys[c]
        s.step(x + 10, y - 4, n)
        s.text(x + 28, y, name, 12, 700)
        if decision:
            s.open_badge(x + 28 + text_w(name, 12, True) * 1.06 + 10, y - 14, decision)
        y += 18
        for lab, txt in (("CREDENTIAL", cred), ("AUTHORIZED BY", auth)):
            s.text(x + 28, y, lab, 9, 700, MUTED, spacing="0.5")
            y = s.para(x + 28 + tab - 28, y, txt, 588 - tab - 12, 11.5, INK) + 2
        ys[c] = y + 12
    by = max(ys) + 6
    s.add(f'<rect x="32" y="{by - 18:.1f}" width="1216" height="34" rx="8" fill="{ZONE}" stroke="{ZONE_STROKE}" stroke-width="1"/>')
    s.text(46, by + 4, "Gateway permission never replaces the service's own business authorization.", 12.5, 700)
    ky = by + 44
    s.open_arrow([(32, ky), (78, ky)])
    kx = 88
    kx += s.open_badge(kx, ky - 10, "D-n") + 8
    s.text(kx, ky + 4, "Not yet decided", 11.5)
    s.status_legend(330, ky, ["existing", "new", "external"])
    s.h = int(ky + 30)
    s.save()


# ----------------------------------------------------------------------
# 7. Customization levels
# ----------------------------------------------------------------------
def customization_levels():
    s = Svg(
        "customization-levels", 1280, 760,
        "Four levels of building on the platform",
        "Four steps rising from left to right. Level 0, configure: the team writes prompts, skills, scenarios and "
        "the choice of model and tools, and the pipeline builds the image from the base application image. Level "
        "1, publish a capability: an MCP adapter or a guidance bundle in the service repository, with an image "
        "only for a hosted MCP server. Level 2, compose: a thin application that imports the shared packages, in "
        "its own image. Level 3, replace a piece: its own implementation of one package behind the same protocol. "
        "A strip underneath shows that shared work reaches a component as merge requests: pipeline logic, "
        "deployment conventions, runtime packages, the base image and repository plumbing.",
    )
    s.heading(
        "Four levels of building on the platform",
        "A team goes only as deep as its use case needs. Proposed conventions; no package, starter or application has been built.",
    )
    levels = [
        (0, "Configure",
         "Prompts, skills, scenarios and the choice of model and tools.",
         "Built by the pipeline from the base application image. No code or Dockerfile in the repository.",
         "An agent repository without src/.",
         "A release like any other: the bytes that were evaluated are the bytes that run."),
        (1, "Publish a capability",
         "An MCP adapter or a guidance bundle, in the service repository.",
         "Only for a hosted MCP server.",
         "The service repository, with mcp/ and agent-assets/.",
         "Does not touch any assistant's code, and deploys on its own schedule."),
        (2, "Compose",
         "A thin application that imports the shared packages and adds hooks, routes, agents or a session store.",
         "Its own.",
         "An agent repository with src/ and a Dockerfile.",
         "The step up from level 0 happens in the same repository."),
        (3, "Replace a piece",
         "Its own implementation of one package behind the same protocol, such as a different UI.",
         "Its own.",
         "None of the starters.",
         "If several teams reach this level for the same piece, the package boundary is in the wrong place."),
    ]
    xs, w = row(32, 1216, 4, 16)
    base_top, rise, h = 190, 28, 292
    st = STATUS["new"]
    for x, (n, title, writes, image, repo, note) in zip(xs, levels):
        y = base_top - n * rise
        s.add(f'<rect x="{x:.1f}" y="{y}" width="{w:.1f}" height="{h}" rx="8" fill="{st["fill"]}" stroke="{st["stroke"]}" stroke-width="1.6"/>')
        s.add(f'<circle cx="{x + 30:.1f}" cy="{y + 32}" r="16" fill="#ffffff" stroke="{st["stroke"]}" stroke-width="1.6"/>')
        s.text(x + 30, y + 38, str(n), 17, 700, INK, anchor="middle")
        s.text(x + 56, y + 25, "LEVEL", 9.5, 700, MUTED, spacing="0.6")
        s.text(x + 56, y + 44, title, 15.5, 700)
        ty = y + 76
        for lab, txt in (("THE TEAM WRITES", writes), ("IMAGE", image), ("REPOSITORY", repo)):
            s.text(x + 14, ty, lab, 9, 700, MUTED, spacing="0.5")
            ty = s.para(x + 14, ty + 16, txt, w - 28, 11.5, INK) + 8
        ny = y + h - 46
        if ty - 8 > ny - 6:
            print(f"  ! customization-levels: level {n} text reaches the note")
        s.add(f'<path d="M{x + 14:.1f},{ny - 8} L{x + w - 14:.1f},{ny - 8}" stroke="{st["stroke"]}" stroke-width="1" opacity="0.35"/>')
        s.para(x + 14, ny + 8, note, w - 28, 11, INK2, italic=True, lh=1.34)
    ay = base_top + h + 26
    s.arrow([(32, ay), (1246, ay)])
    s.text(640, ay + 20, "Deeper customization: the team writes and maintains more itself", 11.5, 400, INK2, anchor="middle")

    zy = ay + 44
    s.zone(32, zy, 1216, 150, "How shared work reaches a component", note="pinned by the component; each update is a merge request (MR)")
    xs5, w5 = row(46, 1188, 5, 12)
    shared = [
        ("Pipeline logic", "CI/CD components in the platform repository.", "version bump MR"),
        ("Deployment conventions", "The agent and MCP server charts.", "selection MR"),
        ("Runtime behavior", "Packages in the GitLab package registry.", "lockfile bump MR"),
        ("Base application image", "ECR, pinned by digest.", "digest bump MR"),
        ("Repository plumbing", "Starters, rendered with Copier.", "copier update MR"),
    ]
    for x, (t, b, how) in zip(xs5, shared):
        s.card(x, zy + 32, w5, 104, t, b, "external")
        s.text(x + 12, zy + 32 + 78, "ARRIVES AS", 9, 700, MUTED, spacing="0.5")
        s.text(x + 12, zy + 32 + 94, how, 12, 700, INK)
    fy = zy + 150 + 28
    lead = "A running consumer does not change without its own checks."
    s.text(32, fy, lead, 12.5, 700)
    s.text(32 + text_w(lead, 12.5, True) + 8, fy,
           "A team that has not merged an update keeps running its current version.", 12, 400, INK2)
    s.h = int(fy + 26)
    s.save()


# ----------------------------------------------------------------------
# 8. The demo's topology
# ----------------------------------------------------------------------
def demo_topology():
    s = Svg(
        "demo-topology", 1280, 1040,
        "The demo: one kind cluster, every call through the gateway",
        "A browser on this machine holds the Chat UI, signed in as developer, incident-manager and "
        "platform-engineer, and the Sample App page. Inside a one-node kind cluster that stands in for EKS, "
        "Agentgateway 1.6.0 serves routes for two MCP tool servers, four agents, the alert hook and the model. "
        "Three agents run as conventional Deployments and the diagnosis agent runs on kagent with Agent "
        "Substrate. Agents call tools and the model only through the gateway; a direct call from an agent to a "
        "tool server is blocked by NetworkPolicy. Keycloak stands in for Okta, a Grafana stack for New Relic or "
        "Dynatrace, a local registry for ECR, task targets for CI and an endpoint on the host for the model "
        "provider. Langfuse, Agentregistry, Kyverno and the OpenTelemetry collector run as themselves.",
    )
    s.heading(
        "The demo: one kind cluster, every call through the gateway",
        "As built on 7 October 2026. Dashed green blocks stand in for something the platform would use; the other blocks run as themselves.",
    )
    ZB = 906  # bottom of the three columns
    s.zone(32, 88, 204, ZB - 88, "Browser and terminal")
    s.zone(252, 88, 772, ZB - 88, "kind cluster, one node", note="stand-in for EKS")
    s.zone(1040, 88, 208, ZB - 88, "This machine")

    # --- left: browser and terminal
    s.card(44, 140, 180, 112, "Chat UI",
           "A browser session for each of three roles: developer, incident-manager, platform-engineer.", "external")
    s.standin(44, 348, 180, 126, "task targets", "Build, publish and ship a release from a terminal.", "CI pipelines")
    s.card(44, 598, 180, 96, "Sample App page", "Search, the page that breaks. Reached directly.", "external")

    # --- right: the host
    s.standin(1052, 140, 184, 126, "Model endpoint", "Anthropic Messages API on port 7070.", "The model provider")
    s.standin(1052, 348, 184, 126, "Local registry", "Images and the Sample App chart, on port 5002.", "ECR")

    # --- row A: the gateway
    s.ns_zone(266, 124, 744, 136, ["agentgateway-system"])
    s.card(280, 154, 330, 94, "Agentgateway 1.6.0",
           "Proxy and controller. Verifies the caller's token on every route, then applies who may call which "
           "tool, agent and model.", "ran")
    s.text(628, 168, "ROUTES", 9.5, 700, MUTED, spacing="0.6")
    px = 628
    for r in ("/mcp/delivery", "/mcp/observability", "/a2a/<agent>"):
        px += s.pill(px, 176, r, 10.5, mono=True, ink=INK) + 8
    px = 628
    for r in ("/hooks/alert", "/v1/messages"):
        px += s.pill(px, 202, r, 10.5, mono=True, ink=INK) + 8
    s.text(628, 242, "One file per route says who may call it.", 10.5, 400, MUTED)

    # --- row B: tools, agents, kagent
    by = 322
    s.ns_zone(266, by, 238, 202, ["tools"])
    s.card(280, by + 30, 210, 76, "observability-mcp", "20 read-only tools over the telemetry stack.", "ran")
    s.card(280, by + 114, 210, 76, "delivery-mcp", "FastMCP. Incident and change state, with its own rules.", "ran")
    s.ns_zone(519, by, 238, 202, ["agents"], note="Deployments")
    for i, (t, b) in enumerate((("chat-assistant", "Mastra, TypeScript"),
                                ("remediation-agent", "Strands, Python"),
                                ("comms-agent", "Strands, Python"))):
        s.card(533, by + 30 + i * 56, 210, 48, t, b, "ran")
    s.ns_zone(772, by, 238, 202, ["kagent", "ate-system"])
    s.card(786, by + 30, 210, 160, "diagnosis-agent",
           "Declarative and read-only: a prompt, a runbook and a list of tools. Runs on kagent 1.0.0-alpha7 "
           "with Agent Substrate, with its own key from the gateway.", "candidate", "alpha")

    # --- row C: sample app and telemetry
    cy = 568
    s.ns_zone(266, cy, 238, 154, ["sample-app"])
    for i, (t, note) in enumerate((("web", None), ("search-service", "breaks in 2.1.0"), ("registration-service", None))):
        s.slim(280, cy + 30 + i * 38, 210, 32, t, note)
    s.ns_zone(519, cy, 491, 154, ["telemetry"])
    s.card(533, cy + 30, 150, 112, "OTel collector", "Receives traces from the gateway and every component.", "ran")
    s.standin(695, cy + 30, 301, 112, "Prometheus, Alertmanager, Loki, Tempo, Grafana",
              None, "New Relic or Dynatrace")

    # --- row D: identity, tracing, catalog, admission
    dy = 742
    s.ns_zone(266, dy, 744, 148, ["keycloak", "langfuse", "agentregistry", "kyverno"])
    xs4, w4 = row(280, 716, 4, 12)
    s.standin(xs4[0], dy + 30, w4, 106, "Keycloak 26.7.5", "Issues the tokens that every hop verifies.", "Okta")
    s.card(xs4[1], dy + 30, w4, 106, "Langfuse 4.46.0", "Every model call, with its user, tokens and cost.", "ran")
    s.card(xs4[2], dy + 30, w4, 106, "Agentregistry", "Catalog only. It has no rights in the cluster.", "ran")
    s.card(xs4[3], dy + 30, w4, 106, "Kyverno", "Admission rules for gateway resources.", "ran")

    # --- arrows
    halo = ZONE

    def lab(x, y, *lines):
        for i, line in enumerate(lines):
            s.text(x, y + i * 13.5, line, 10.5, 400, INK2, halo=halo)

    s.arrow([(224, 196), (277, 196)])                      # browser -> gateway
    s.arrow([(1010, 196), (1049, 196)])                    # gateway -> model endpoint
    s.arrow([(224, 646), (263, 646)])                      # browser -> sample app
    s.arrow([(330, 260), (330, by - 3)])                   # gateway -> tools
    lab(338, 286, "MCP, tools", "filtered by role")
    s.arrow([(575, 260), (575, by - 3)])                   # gateway -> agents
    lab(583, 286, "A2A, as", "the caller")
    s.arrow([(680, by), (680, 263)])                       # agents -> gateway
    lab(688, 286, "tools and", "models")
    s.arrow([(764.5, cy + 30), (764.5, 263)])              # alert -> gateway
    lab(772.5, 286, "alert to", "/hooks/alert")
    s.arrow([(860, 260), (860, by - 3)])                   # gateway -> kagent
    lab(868, 293, "A2A")
    s.arrow([(935, by), (935, 263)])                       # kagent -> gateway
    lab(943, 286, "its own", "gateway key")
    s.arrow([(320, by + 190), (320, cy - 3)])              # delivery-mcp -> sample app
    lab(328, by + 219, "applies the", "rollback (Helm)")
    s.arrow([(640, by + 190), (640, 537), (470, 537), (470, by + 193)], "denied")
    s.deny_mark(555, 537)
    s.text(555, 560, "blocked by NetworkPolicy", 10.5, 600, DENY, anchor="middle", halo=halo)

    # --- legend
    ly = ZB + 30
    s.status_legend(32, ly, ["ran", "candidate", "standin", "fixture", "external"], title="Blocks", labels={
        "ran": "Runs as itself",
        "candidate": "Runs as itself, alpha upstream",
        "standin": "Stand-in, and for what",
        "fixture": "The app that breaks",
        "external": "Outside the cluster",
    })
    ky = ly + 30
    s.text(32, ky + 4, "Paths", 11, 700, INK2)
    s.arrow([(86, ky), (132, ky)])
    s.text(142, ky + 4, "A call that was made", 11.5)
    s.arrow([(300, ky), (346, ky)], "denied")
    s.deny_mark(323, ky)
    s.text(356, ky + 4, "A direct call that was refused", 11.5)
    s.para(
        32, ky + 32,
        "Agents, tools and the model are reached through the gateway. The paths that go around it are written "
        "down as exceptions: delivery-mcp to the Kubernetes API, the registry and its search check, "
        "observability-mcp to Grafana, and kagent's own console, which lets in the platform engineer only and "
        "reaches the diagnosis agent through kagent's controller.",
        1216, 11.5, INK2,
    )
    s.h = int(ky + 92)
    s.save()


# ----------------------------------------------------------------------
# 9. What the demo covered
# ----------------------------------------------------------------------
def demo_coverage():
    s = Svg(
        "demo-coverage", 1280, 1136,
        "What the demo ran, stood in for, and left out",
        "The layers of the platform overview, with each block marked by what the demo did with it. Ran as "
        "itself: Agentgateway with MCP, A2A and model routes, Agentregistry as a catalog, kagent with Agent "
        "Substrate for one declarative agent, conventional hosted agents, hosted MCP servers, Kyverno, the "
        "OpenTelemetry collector, Langfuse, Helm and Helmfile. Stand-in: Keycloak for Okta, a Grafana stack for "
        "New Relic or Dynatrace, a local registry for ECR, task targets for GitLab CI/CD, an endpoint on the "
        "host for the model provider, kind for EKS, and a Chat UI with scripted calls for developer clients. "
        "Not exercised: Istio, Karpenter, CloudNativePG, S3 and snapshots, the rate-limit server and token "
        "budgets, the GitLab package registry, Terraform and OpenTofu, remote MCP servers, stage and prod.",
    )
    s.heading(
        "What the demo ran, stood in for, and left out",
        "Observations on one machine, 7 October 2026. Not pilot evidence.",
    )
    bx, bw = 32, 1216
    cx, cw = 196, 1036
    badge = {"ran": "ran", "standin": "stand-in", "notrun": "not run"}

    def band(y, h, name, note):
        s.zone(bx, y, bw, h, "")
        end = s.para(bx + 16, y + 28, name, 134, 12.5, INK, 700, lh=1.28)
        s.para(bx + 16, end + 1, note, 134, 10.5, MUTED, lh=1.32)

    def connector(y0, y1, label, up=False):
        pts = [(216, y1 - 3), (216, y0 + 3)] if up else [(216, y0 + 3), (216, y1 - 3)]
        s.arrow(pts)
        s.text(230, (y0 + y1) / 2 + 4, label, 11.5, 400, INK2)

    def cards(y, h, xs_, w_, items):
        for x, (t, b, ev) in zip(xs_, items):
            s.card(x, y, w_, h, t, b, ev, badge[ev])

    # Band 1: consumers
    y = 88
    band(y, 128, "Consumers", "Who used the demo")
    xs, w = row(cx, cw, 4, 14)
    cards(y + 16, 96, xs, w, [
        ("Developer clients", "A Chat UI and scripted MCP calls with a token. A real MCP client could not sign in by itself.", "standin"),
        ("Users of hosted agents", "Four demo users in three roles, signed in through Keycloak.", "standin"),
        ("Service and agent teams", "Component directories in one repository stood in for team repositories.", "standin"),
        ("Okta", "Keycloak. Tokens carried roles and a team, for one audience.", "standin"),
    ])
    connector(216, 246, "Every request through the gateway carried a verified identity")

    # Band 2: connectivity
    y = 246
    band(y, 180, "Connectivity and discovery", "The governed path to tools and models")
    gx, gy, gw, gh = cx, y + 14, 770, 152
    st = STATUS["ran"]
    s.add(f'<rect x="{gx}" y="{gy}" width="{gw}" height="{gh}" rx="8" fill="{st["fill"]}" stroke="{st["stroke"]}" stroke-width="1.6"/>')
    s.text(gx + 12, gy + 23, "Agentgateway", 14, 700)
    s.text(gx + 118, gy + 23, "Version 1.6.0, one gateway for one domain in one environment", 11.5, 400, INK2)
    ixs, iw = row(gx + 12, gw - 24, 3, 12)
    for x, (t, b, ev) in zip(ixs, [
        ("Controller", "Its own controller and GatewayClass, not managed by a mesh.", "ran"),
        ("Proxy", "MCP, A2A and model routes. Token checks, tool rules by role, approved models only.", "ran"),
        ("Rate-limit server", "Not installed. No token budget was configured.", "notrun"),
    ]):
        s.card(x, gy + 36, iw, 104, t, b, ev, badge[ev], fill="#ffffff")
    s.card(gx + gw + 14, gy, cw - gw - 14, gh, "Agentregistry",
           "Catalog only: four agents and two tool servers published. With it scaled to zero, tools and agents "
           "still answered.", "ran", badge["ran"])
    connector(426, 456, "Agents reached tools and the model only through the gateway; direct calls were blocked", up=True)

    # Band 3: execution
    y = 456
    band(y, 112, "Execution", "Hosted processes in the demo")
    xs3, w3 = row(cx, cw, 3, 14)
    for x, (t, b, ev, bd) in zip(xs3, [
        ("Conventional workloads", "Three agents as Deployments from one shared chart.", "ran", "ran"),
        ("kagent and Agent Substrate", "One declarative, read-only agent on kagent 1.0.0-alpha7. Sessions and snapshots were not tested.", "ran", "ran, alpha"),
        ("Hosted MCP servers", "Two tool servers, each behind its own gateway route.", "ran", "ran"),
    ]):
        s.card(x, y + 16, w3, 80, t, b, ev, bd)
    connector(568, 598, "The tool server enforced its own rules, whatever the gateway allowed")

    # Band 4: capabilities
    y = 598
    band(y, 112, "Capabilities and providers", "What the governed path reached")
    cards(y + 16, 80, xs3, w3, [
        ("Service APIs", "A Sample App built for the demo. The business rules were in the delivery tool server.", "standin"),
        ("Remote MCP servers", "None. Both tool servers were hosted in the cluster.", "notrun"),
        ("Model providers", "An Anthropic-compatible endpoint on the host. The Bedrock binding is written and untested.", "standin"),
    ])

    # Band 5: state and artifacts
    y = 722
    band(y, 112, "State and artifacts", "Durable data and released bytes")
    cards(y + 16, 80, xs, w, [
        ("CloudNativePG", "Not installed. Incident and chat state was held in memory.", "notrun"),
        ("S3 and snapshots", "No S3 bucket, and no snapshot restore was tested.", "notrun"),
        ("ECR", "A local registry for images and the Sample App chart.", "standin"),
        ("GitLab package registry", "No shared package was published.", "notrun"),
    ])

    # Band 6: foundation, two rows
    y = 846
    band(y, 234, "Foundation and operations", "What the demo ran on")
    xs5, w5 = row(cx, cw, 5, 14)
    cards(y + 16, 96, xs5, w5, [
        ("EKS", "kind, one node, on one machine.", "standin"),
        ("Istio, Karpenter", "No mesh and no node provisioning.", "notrun"),
        ("Kyverno", "Four admission policies on gateway resources.", "ran"),
        ("OTel collector", "One collector for the gateway and every component.", "ran"),
        ("New Relic or Dynatrace", "Grafana, Prometheus, Loki and Tempo.", "standin"),
    ])
    cards(y + 122, 96, xs5, w5, [
        ("GitLab CI/CD", "task targets, run from a terminal.", "standin"),
        ("Helm and Helmfile", "Every release, and the rollback itself.", "ran"),
        ("Terraform and OpenTofu", "No AWS resource was created.", "notrun"),
        ("Langfuse", "Every model call, with its user, tokens and cost.", "ran"),
        ("Stage and prod", "One environment only: dev.", "notrun"),
    ])

    s.status_legend(32, 1108, ["ran", "standin", "notrun"], title="Evidence", labels={
        "ran": "Ran as itself",
        "standin": "Stand-in: something else took its place",
        "notrun": "Not exercised",
    })
    s.save()


if __name__ == "__main__":
    platform_overview()
    trust_boundaries()
    deployment_topology()
    configuration_authority()
    options_side_by_side()
    identity_at_each_hop()
    customization_levels()
    demo_topology()
    demo_coverage()
