#!/usr/bin/env python3
"""Snapshot the public pages the analysis is based on into sources/<date>/.

Downloads
  kiro/         Kiro models, pricing and billing pages
  bedrock/      the Bedrock pricing page, the two price feeds the page loads its
                numbers from, the AWS Price List files for us-east-1, and the
                prompt-caching guide
  model-cards/  the AWS model-card index and the cards for models named in the
                input tables (--all-cards keeps every card)

Derives
  bedrock/pricing_resolved_<region>.txt  the pricing page as text with every price
                                         placeholder filled in from the feeds
  model-cards/launch_dates.csv           launch date, lifecycle and context window
                                         for every model card in the index
  MANIFEST.csv                           URL, size, SHA-256 and fetch time per file

The Bedrock pricing page ships placeholders such as {priceOf!bedrock/bedrock!<id>}
and fills them in the browser, so the saved HTML alone contains no Claude prices.
Prices are not extracted into data/inputs automatically: review the resolved text
and the model cards, then update the input tables by hand.

Usage
  python3 scripts/fetch_sources.py                       download into sources/<today>/
  python3 scripts/fetch_sources.py --date 2026-10-04 --no-download
                                                         rebuild the derived files only
"""
import argparse
import csv
import gzip
import hashlib
import html
import json
import re
import time
import urllib.request
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from pathlib import Path

from common import INPUTS, ROOT, SOURCES

USER_AGENT = "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36"
DOCS = "https://docs.aws.amazon.com/bedrock/latest/userguide/"
FEED = "https://b0.p.awsstatic.com/pricing/2.0/meteredUnitMaps/{0}/USD/current/{0}.json"
PRICE_LIST = "https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/{0}/current/us-east-1/index.json"

PAGES = {
    "kiro/models.html": "https://kiro.dev/docs/models/",
    "kiro/pricing.html": "https://kiro.dev/pricing/",
    "kiro/available-models.html": "https://kiro.dev/docs/models/available-models/",
    "kiro/billing.html": "https://kiro.dev/docs/billing/",
    "kiro/enterprise-billing.html": "https://kiro.dev/docs/enterprise/billing/",
    "kiro/add-on-credits.html": "https://kiro.dev/docs/billing/add-on-credits/",
    "bedrock/pricing.html": "https://aws.amazon.com/bedrock/pricing/",
    "bedrock/feed_bedrockfoundationmodels.json": FEED.format("bedrockfoundationmodels"),
    "bedrock/feed_bedrock.json": FEED.format("bedrock"),
    "bedrock/pricelist_AmazonBedrockFoundationModels_us-east-1.json": PRICE_LIST.format("AmazonBedrockFoundationModels"),
    "bedrock/pricelist_AmazonBedrock_us-east-1.json": PRICE_LIST.format("AmazonBedrock"),
    "bedrock/prompt-caching.html": DOCS + "prompt-caching.html",
    "model-cards/index.html": DOCS + "model-cards.html",
}

PLACEHOLDER = re.compile(r"\{priceOf!([a-z]+)/[a-z]+!([A-Za-z0-9_\-]+)((?:![^!}]+)*)\}")


def fetch(url, attempts=3):
    """Body of a URL as bytes, transparently un-gzipped (the price feeds are gzip files)."""
    for attempt in range(1, attempts + 1):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=60) as response:
                body = response.read()
            return gzip.decompress(body) if body[:2] == b"\x1f\x8b" else body
        except Exception as error:
            if attempt == attempts:
                raise SystemExit(f"Could not download {url}: {error}")
            time.sleep(2 * attempt)
    raise AssertionError("unreachable")


def page_text(raw):
    """Readable text from an HTML page: one table row per line, cells separated by ' | '."""
    text = raw.decode("utf-8", errors="replace") if isinstance(raw, bytes) else raw
    text = re.sub(r"(?is)<(script|style|noscript|svg)[^>]*>.*?</\1>", " ", text)
    text = re.sub(r"(?i)</(tr|p|div|h[1-6]|li|table|section|dt|dd)>", "\n", text)
    text = re.sub(r"(?i)</(td|th)>", " | ", text)
    text = re.sub(r"(?i)<br\s*/?>", "\n", text)
    text = html.unescape(re.sub(r"<[^>]+>", "", text))
    text = re.sub(r"[ \t\xa0]+", " ", text)
    return re.sub(r"\n\s*\n+", "\n", text)


def resolve_prices(out, region):
    """Write the pricing page as text with placeholders replaced by feed prices for one region."""
    feeds = {}
    for name in ("bedrockfoundationmodels", "bedrock"):
        with open(out / f"bedrock/feed_{name}.json", encoding="utf-8") as fh:
            feeds[name] = json.load(fh)
    missing = [region for feed in feeds.values() if region not in feed["regions"]]
    if missing:
        raise SystemExit(f"Region {region!r} is not in the price feeds")

    def fill(match):
        service, rate_id = match.group(1), match.group(2)
        modifiers = [m for m in match.group(3).split("!") if m]
        entry = feeds[service]["regions"][region].get(rate_id)
        if entry is None:
            return f"[no price in {region}]"
        price, unknown = float(entry["price"]), []
        while modifiers:
            modifier = modifiers.pop(0)
            if modifier == "*" and modifiers:  # per-1K-token rates are shown per 1M
                price *= float(modifiers.pop(0))
            elif modifier == "opt" or modifier.startswith("decimals="):
                continue  # display options only
            else:
                unknown.append(modifier)
        shown = f"${price:.10f}".rstrip("0").rstrip(".")
        return shown + (f" [unrecognised modifier {' '.join(unknown)}]" if unknown else "")

    text = PLACEHOLDER.sub(fill, page_text((out / "bedrock/pricing.html").read_bytes()))
    published = {name: feed["manifest"].get("hawkFilePublicationDate", "unknown") for name, feed in feeds.items()}
    header = (f"Bedrock pricing page with price placeholders resolved for {region}.\n"
              f"Feed publication dates: {published}\n\n")
    target = out / f"bedrock/pricing_resolved_{slug(region)}.txt"
    target.write_text(header + text, encoding="utf-8")
    print(f"wrote {target.relative_to(ROOT) if target.is_relative_to(ROOT) else target}")


def slug(region):
    codes = {"US East (N. Virginia)": "us-east-1", "US East (Ohio)": "us-east-2", "US West (Oregon)": "us-west-2"}
    return codes.get(region, re.sub(r"[^a-z0-9]+", "-", region.lower()).strip("-"))


def card_details(name, raw):
    """Launch date, lifecycle and context window as stated on a model card."""
    text = page_text(raw)

    def field(pattern):
        match = re.search(pattern, text)
        return match.group(1).strip() if match else ""

    launch = field(r"Model launch date:\s*([^\n]+)")
    launch_iso = ""
    for fmt in ("%B %d, %Y", "%b %d, %Y"):
        try:
            launch_iso = datetime.strptime(launch.replace("Sept ", "Sep "), fmt).date().isoformat()
            break
        except ValueError:
            continue
    return [name, field(r"\n\s*([^\n]+?) - Amazon Bedrock"), launch_iso, launch,
            field(r"Model lifecycle:\s*([^\n]+)"), field(r"Context window:\s*([^\n]+)")]


def write_launch_dates(cards, target):
    """cards: {file name: page bytes}. Newest launch first; unparsed dates last."""
    rows = sorted((card_details(name, raw) for name, raw in cards.items()),
                  key=lambda r: (r[2] != "", r[2]), reverse=True)
    with open(target, "w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["model_card", "model", "launch_date", "launch_date_as_published",
                         "lifecycle", "context_window"])
        writer.writerows(rows)
    print(f"wrote {target} ({len(rows)} model cards)")


def cards_in_inputs():
    """Model-card names referenced by the newest input tables."""
    names = set()
    for prefix in ("kiro_listed_models_", "bedrock_newer_models_"):
        files = sorted(INPUTS.glob(prefix + "*.csv"))
        if not files:
            continue
        with open(files[-1], newline="", encoding="utf-8") as fh:
            names.update(f"model-card-{row['model_card']}.html" for row in csv.DictReader(fh) if row.get("model_card"))
    return names


def write_manifest(out):
    """URL, size, hash and fetch time (file modification time) for every downloaded file."""
    rows = []
    for path in sorted(p for p in out.rglob("*") if p.is_file()):
        rel = path.relative_to(out).as_posix()
        if rel in PAGES:
            url = PAGES[rel]
        elif rel.startswith("model-cards/model-card-"):
            url = DOCS + path.name
        else:
            continue  # derived file
        fetched = datetime.fromtimestamp(path.stat().st_mtime, timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")
        data = path.read_bytes()
        rows.append([rel, url, len(data), hashlib.sha256(data).hexdigest(), fetched])
    with open(out / "MANIFEST.csv", "w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(["file", "url", "bytes", "sha256", "fetched_at_utc"])
        writer.writerows(rows)
    print(f"wrote {out / 'MANIFEST.csv'} ({len(rows)} files)")


def download(out, all_cards):
    for rel, url in PAGES.items():
        target = out / rel
        target.parent.mkdir(parents=True, exist_ok=True)
        target.write_bytes(fetch(url))
        print(f"fetched {rel}")

    index = (out / "model-cards/index.html").read_text(encoding="utf-8", errors="replace")
    names = sorted(set(re.findall(r"model-card-[a-z0-9-]+\.html", index)))
    with ThreadPoolExecutor(max_workers=8) as pool:
        cards = dict(zip(names, pool.map(lambda name: fetch(DOCS + name), names)))
    write_launch_dates(cards, out / "model-cards/launch_dates.csv")

    keep = set(names) if all_cards else cards_in_inputs() & set(names)
    for name in sorted(keep):
        (out / "model-cards" / name).write_bytes(cards[name])
    print(f"saved {len(keep)} of {len(names)} model cards")
    absent = cards_in_inputs() - set(names)
    if absent:
        print("WARNING: cards named in the inputs but missing from the AWS index: " + ", ".join(sorted(absent)))


def main():
    parser = argparse.ArgumentParser(description="Snapshot the Kiro and Bedrock source pages.")
    parser.add_argument("--date", default=date.today().isoformat(), help="snapshot folder name (default: today)")
    parser.add_argument("--out", type=Path, help="output folder (default: sources/<date>)")
    parser.add_argument("--region", default="US East (N. Virginia)",
                        help="region name used to resolve prices (default: US East (N. Virginia))")
    parser.add_argument("--all-cards", action="store_true", help="keep every model card, not only those in the inputs")
    parser.add_argument("--no-download", action="store_true", help="rebuild derived files from an existing snapshot")
    parser.add_argument("--force", action="store_true", help="overwrite an existing snapshot")
    args = parser.parse_args()

    out = (args.out or SOURCES / args.date).resolve()
    if args.no_download:
        if not out.is_dir():
            raise SystemExit(f"No snapshot at {out}")
    else:
        if out.is_dir() and any(out.iterdir()) and not args.force:
            raise SystemExit(f"{out} already holds a snapshot. Use --no-download to rebuild its derived "
                             f"files, another --date, or --force to overwrite it.")
        download(out, args.all_cards)
    resolve_prices(out, args.region)
    write_manifest(out)


if __name__ == "__main__":
    main()
