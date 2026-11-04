#!/usr/bin/env python3
"""The cost model behind 08-cost-model.md, and its sensitivity chart.

    python3 scripts/cost_model.py          # prints the tables, writes diagrams/cost-sensitivity.svg

Every input is a named assumption below. Change one, rerun, and paste the
printed tables into the page. Standard library only.
"""
from __future__ import annotations

import html
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / "diagrams"

# --- Prices (verified) -------------------------------------------------------
# AWS Price List API, offer AmazonBedrockFoundationModels, us-east-1,
# publication date 2026-10-12, read 2026-11-04. USD per million tokens,
# "Standard, Global" (cross-region inference). Regional endpoints are +10%.
PRICE = {
    "sonnet-5.5": {"in": 2.00, "out": 10.00, "cache_write": 2.50, "cache_read": 0.10},
    "opus-5.5": {"in": 4.00, "out": 20.00, "cache_write": 5.00, "cache_read": 0.20},
}

# --- Assumptions (organization to replace) -----------------------------------
BASE = {
    "developers": 200,              # people licensed to use a coding harness
    "active_share": 0.70,           # share using it in a given month
    "harness_mtok_in": 60.0,        # input-side tokens per active developer per month, millions
    "output_ratio": 0.025,          # output tokens as a share of input-side tokens
    "cache_read_share": 0.80,       # of input-side tokens
    "cache_write_share": 0.10,
    "opus_share": 0.20,             # rest is Sonnet 5.5
    "regional_premium": 0.0,        # 0.10 if regional, not global, endpoints are required
    "hosted_inference_usd": 10_000,  # MR reviewer, CI triage, helpdesk, platform assistant per year
    "vcpu": 63,                     # prod (42) + one non-prod at half size (21); see the page
    "usd_per_vcpu_hour": 0.045,     # general purpose, 4 GiB per vCPU, On-Demand; replace with the effective rate
    "storage_usd_year": 3_000,      # EBS for ClickHouse and PostgreSQL, S3, backups
    "dynatrace_host_usd_year": 14_000,  # Full-Stack at $0.01 per memory-GiB-hour on ~158 GiB added
    "telemetry_ingest_usd_year": 1_000,
    "fte": 2.0,                     # steady-state platform engineering effort, all areas
    "usd_per_fte_year": 220_000,    # fully loaded; replace with the organization's figure
    "license_usd_year": 0,          # OSS default
}
HOURS_PER_YEAR = 8_760


def per_dev_month(mtok_in: float, model: str, a: dict) -> float:
    p = PRICE[model]
    cr, cw = a["cache_read_share"], a["cache_write_share"]
    uncached = 1 - cr - cw
    blended_in = cr * p["cache_read"] + cw * p["cache_write"] + uncached * p["in"]
    cost = mtok_in * blended_in + mtok_in * a["output_ratio"] * p["out"]
    return cost * (1 + a["regional_premium"])


def components(a: dict) -> dict[str, float]:
    active = a["developers"] * a["active_share"]
    dev_month = ((1 - a["opus_share"]) * per_dev_month(a["harness_mtok_in"], "sonnet-5.5", a)
                 + a["opus_share"] * per_dev_month(a["harness_mtok_in"], "opus-5.5", a))
    return {
        "Coding harness inference": active * dev_month * 12,
        "Hosted agent inference": a["hosted_inference_usd"],
        "Infrastructure (incremental)": a["vcpu"] * HOURS_PER_YEAR * a["usd_per_vcpu_hour"] + a["storage_usd_year"],
        "Dynatrace host monitoring": a["dynatrace_host_usd_year"],
        "Telemetry ingest": a["telemetry_ingest_usd_year"],
        "Platform engineering staff": a["fte"] * a["usd_per_fte_year"],
        "Licenses": a["license_usd_year"],
    }


def total(a: dict) -> float:
    return sum(components(a).values())


# One driver at a time, low and high, everything else at base.
DRIVERS = [
    ("Platform staff, 1.5 to 4.0 FTE", {"fte": 1.5}, {"fte": 4.0}),
    ("Harness tokens per developer, 20 to 200 M/month", {"harness_mtok_in": 20}, {"harness_mtok_in": 200}),
    ("Prompt cache hits, 90% to 0% (gateway strips caching)",
     {"cache_read_share": 0.90, "cache_write_share": 0.05}, {"cache_read_share": 0.0, "cache_write_share": 0.0}),
    ("Infrastructure, committed spare to 2x size",
     {"vcpu": 32}, {"vcpu": 126, "storage_usd_year": 6_000}),
    ("Opus share of harness traffic, 0% to 50%", {"opus_share": 0.0}, {"opus_share": 0.5}),
    ("Hosted agent inference, $5k to $30k", {"hosted_inference_usd": 5_000}, {"hosted_inference_usd": 30_000}),
    ("Dynatrace host monitoring, none to $20k", {"dynatrace_host_usd_year": 0}, {"dynatrace_host_usd_year": 20_000}),
    ("Regional instead of global endpoints", {}, {"regional_premium": 0.10}),
]


def fmt(v: float) -> str:
    return f"${v / 1000:,.0f}k"


def tornado_svg(base_total: float, rows: list[tuple[str, float, float]]) -> str:
    rows = sorted(rows, key=lambda r: (r[2] - r[1]), reverse=True)
    w, left, right = 1100, 430, 60
    top, row_h, bar_h = 118, 40, 16
    h = top + row_h * len(rows) + 70
    lo = min(r[1] for r in rows)
    hi = max(r[2] for r in rows)
    x0, x1 = min(lo, base_total) * 0.95, hi * 1.03
    x0 = max(0, (x0 // 100_000) * 100_000)
    scale = (w - left - right) / (x1 - x0)

    def X(v: float) -> float:
        return left + (v - x0) * scale

    parts = [
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {w} {h}" width="{w}" height="{h}" role="img" '
        'aria-labelledby="t d" font-family="system-ui, -apple-system, \'Segoe UI\', Roboto, Helvetica, Arial, sans-serif">',
        '<title id="t">Sensitivity of steady-state annual cost to each assumption</title>',
        f'<desc id="d">Base case {fmt(base_total)} a year. Each row moves one assumption to its low and high '
        'value with the others at base. Staff effort and harness token volume dominate; a gateway that '
        'strips prompt caching is the largest avoidable risk. The same numbers are in the table on the page.</desc>',
        '<style>.viz-root{--surface-1:#fcfcfb;--text-primary:#0b0b0b;--text-secondary:#52514e;--grid:#e4e3df;'
        '--lower:#2a78d6;--higher:#e34948}'
        '@media (prefers-color-scheme: dark){.viz-root{--surface-1:#1a1a19;--text-primary:#f0efec;'
        '--text-secondary:#c3c2b7;--grid:#383835;--lower:#3987e5;--higher:#e66767}}'
        '.bg{fill:var(--surface-1)}.t1{fill:var(--text-primary)}.t2{fill:var(--text-secondary)}'
        '.grid{stroke:var(--grid);stroke-width:1}.base{stroke:var(--text-primary);stroke-width:1.5}'
        '.lower{fill:var(--lower)}.higher{fill:var(--higher)}</style>',
        '<g class="viz-root">',
        f'<rect class="bg" width="{w}" height="{h}"/>',
        '<text class="t1" x="24" y="36" font-size="19" font-weight="700">What moves the annual cost</text>',
        f'<text class="t2" x="24" y="60" font-size="13">Steady state, one assumption at a time. Base case {fmt(base_total)} '
        'a year (vertical line). Bars show the total at the low and high value.</text>',
        f'<rect class="lower" x="24" y="76" width="14" height="10" rx="2"/>'
        f'<text class="t2" x="44" y="85" font-size="12">Lower than base</text>',
        f'<rect class="higher" x="170" y="76" width="14" height="10" rx="2"/>'
        f'<text class="t2" x="190" y="85" font-size="12">Higher than base</text>',
    ]
    # gridlines and ticks every $100k
    tick = (int(x0) // 100_000) * 100_000
    while tick <= x1:
        x = X(tick)
        if x >= left - 1:
            parts.append(f'<line class="grid" x1="{x:.1f}" y1="{top - 10}" x2="{x:.1f}" y2="{h - 54}"/>')
            parts.append(f'<text class="t2" x="{x:.1f}" y="{h - 36}" font-size="11" text-anchor="middle">{fmt(tick)}</text>')
        tick += 100_000
    for i, (label, low, high) in enumerate(rows):
        y = top + i * row_h
        cy = y + row_h / 2
        parts.append(f'<text class="t1" x="{left - 14}" y="{cy + 4:.1f}" font-size="12.5" text-anchor="end">{html.escape(label)}</text>')
        xb = X(base_total)
        if low < base_total:
            xl = X(low)
            parts.append(f'<rect class="lower" x="{xl:.1f}" y="{cy - bar_h / 2:.1f}" width="{xb - xl - 1:.1f}" height="{bar_h}" rx="3"/>')
            parts.append(f'<text class="t2" x="{xl - 6:.1f}" y="{cy + 4:.1f}" font-size="11" text-anchor="end">{fmt(low)}</text>')
        if high > base_total:
            xh = X(high)
            parts.append(f'<rect class="higher" x="{xb + 1:.1f}" y="{cy - bar_h / 2:.1f}" width="{xh - xb - 1:.1f}" height="{bar_h}" rx="3"/>')
            parts.append(f'<text class="t2" x="{xh + 6:.1f}" y="{cy + 4:.1f}" font-size="11">{fmt(high)}</text>')
    xb = X(base_total)
    parts.append(f'<line class="base" x1="{xb:.1f}" y1="{top - 14}" x2="{xb:.1f}" y2="{h - 54}"/>')
    parts.append(f'<text class="t1" x="{xb:.1f}" y="{top - 20}" font-size="11.5" font-weight="600" text-anchor="middle">Base {fmt(base_total)}</text>')
    parts.append(f'<text class="t2" x="24" y="{h - 12}" font-size="11">Prices: AWS Price List, Bedrock foundation models, us-east-1, '
                 'published 12 Oct 2026. All other inputs are assumptions in scripts/cost_model.py.</text>')
    parts.append('</g></svg>')
    return "\n".join(parts) + "\n"


def main() -> None:
    base = components(BASE)
    bt = sum(base.values())
    print("| Component | Base, per year | Share |")
    print("|---|---:|---:|")
    for k, v in base.items():
        print(f"| {k} | {fmt(v)} | {v / bt:.0%} |")
    print(f"| **Total** | **{fmt(bt)}** | |")
    print()
    active = BASE["developers"] * BASE["active_share"]
    for m in ("sonnet-5.5", "opus-5.5"):
        print(m, "per active developer-month:", round(per_dev_month(BASE["harness_mtok_in"], m, BASE), 2))
    print("per developer-year (total / developers):", fmt(bt / BASE["developers"]))
    print("active developers:", active)
    print()
    rows = []
    print("| Driver | Low | High | Swing |")
    print("|---|---:|---:|---:|")
    for label, low_over, high_over in DRIVERS:
        lo = total({**BASE, **low_over}) if low_over else bt
        hi = total({**BASE, **high_over}) if high_over else bt
        rows.append((label, lo, hi))
        print(f"| {label} | {fmt(lo)} | {fmt(hi)} | {fmt(hi - lo)} |")
    print()
    for devs in (100, 200, 500, 1000):
        a = {**BASE, "developers": devs}
        print(f"developers={devs}: total {fmt(total(a))}, per developer {fmt(total(a) / devs)}")
    OUT.mkdir(parents=True, exist_ok=True)
    (OUT / "cost-sensitivity.svg").write_text(tornado_svg(bt, rows), encoding="utf-8")
    print("\nwrote", OUT / "cost-sensitivity.svg")


if __name__ == "__main__":
    main()
