"""Shared helpers for the Kiro vs Bedrock pricing scripts.

All arithmetic uses exact fractions; values are only converted to decimals
when they are written out.
"""
import csv
import re
from fractions import Fraction
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
INPUTS = ROOT / "data" / "inputs"
RESULTS = ROOT / "data" / "results"
SOURCES = ROOT / "sources"

# Benchmark workload: 1,000,000 input tokens plus 100,000 output tokens.
OUTPUT_WEIGHT = Fraction(1, 10)

# Cache scenario: 90% of each call's input is a stable prefix reused across
# 10 calls (one cache write, nine cache reads). Averaged over the 10 calls the
# input is 10% uncached, 9% cache write and 81% cache read.
CACHE_UNCACHED = Fraction(10, 100)
CACHE_WRITE = Fraction(9, 100)
CACHE_READ = Fraction(81, 100)


def frac(value):
    """Exact fraction from a decimal string; None for a blank cell."""
    value = (value or "").strip()
    return Fraction(value) if value else None


def required(row, column):
    """Exact fraction from a cell that must not be blank."""
    value = frac(row[column])
    if value is None:
        raise SystemExit(f"{row['model']}: missing {column}")
    return value


def num(value):
    """Decimal text for a CSV cell, 12 significant digits."""
    return "" if value is None else format(float(value), ".12g")


def benchmark_cost(input_price, output_price):
    """USD for 1M uncached input tokens plus 100K output tokens."""
    return input_price + OUTPUT_WEIGHT * output_price


def cache_cost(input_price, output_price, cache_write, cache_read):
    """USD for the same workload under the cache scenario."""
    return (CACHE_UNCACHED * input_price + CACHE_WRITE * cache_write
            + CACHE_READ * cache_read + OUTPUT_WEIGHT * output_price)


def resolve_date(date=None):
    """The requested snapshot date, or the newest one with a listed-models input."""
    if date:
        return date
    dates = sorted(m.group(1) for p in INPUTS.glob("kiro_listed_models_*.csv")
                   if (m := re.search(r"(\d{4}-\d{2}-\d{2})", p.name)))
    if not dates:
        raise SystemExit(f"No kiro_listed_models_<date>.csv found in {INPUTS}")
    return dates[-1]


def read_rows(path):
    with open(path, newline="", encoding="utf-8") as fh:
        return list(csv.DictReader(fh))


def write_rows(path, header, rows):
    path.parent.mkdir(parents=True, exist_ok=True)
    with open(path, "w", newline="", encoding="utf-8") as fh:
        writer = csv.writer(fh)
        writer.writerow(header)
        writer.writerows(rows)
    print(f"wrote {path.relative_to(ROOT)} ({len(rows)} rows)")


def find_anchor(listed):
    anchors = [r for r in listed if r["is_anchor"].strip().lower() == "yes"]
    if len(anchors) != 1:
        raise SystemExit(f"Expected exactly one anchor row, found {len(anchors)}")
    return anchors[0]
