#!/usr/bin/env python3
"""Estimate Kiro multipliers for Bedrock models that Kiro does not list.

These are extrapolations from how Kiro weights related models it does list.
Kiro has not published multipliers for any of these models.

Reads   data/inputs/kiro_listed_models_<date>.csv   (verified Kiro multipliers and prices)
        data/inputs/bedrock_newer_models_<date>.csv (verified prices plus one rule per estimate)
Writes  data/results/bedrock_newer_models_predicted_kiro_<date>.csv

Each newer model has a central, low and high rule:
  input_price           the model's US input price per 1M tokens, read as a multiplier
                        (Kiro's GPT-5.6 Sol and Terra multipliers equal their input prices)
  same_as:<model>       the Kiro multiplier of a listed model
  rho:<model>           a listed model's multiplier per benchmark dollar, times this
                        model's benchmark cost
  rho_median:<group>    the median multiplier per benchmark dollar of a group of listed
                        models ("all" or a family name), times this model's benchmark cost
  cache_scaled:<model>  a listed model's multiplier, scaled by the ratio of cache-scenario
                        costs
  double_short          twice the same estimate for this model's short-context row

Usage: python3 scripts/predict_newer.py [--date YYYY-MM-DD]
"""
import argparse
from statistics import median

from common import (INPUTS, RESULTS, benchmark_cost, cache_cost, find_anchor,
                    frac, num, read_rows, required, resolve_date, write_rows)

IN, OUT = "bedrock_input_usd_per_1M", "bedrock_output_usd_per_1M"
WRITE, READ = "bedrock_cache_write_usd_per_1M", "bedrock_cache_read_usd_per_1M"


def reference_models(listed):
    """One entry per listed model with a Bedrock price (first row = short context)."""
    refs = {}
    for row in listed:
        if frac(row[IN]) is None or row["model"] in refs:
            continue
        p_in, p_out = required(row, IN), required(row, OUT)
        mult = required(row, "kiro_credit_multiplier")
        has_cache_rates = frac(row[WRITE]) is not None and frac(row[READ]) is not None
        refs[row["model"]] = {
            "family": row["family"],
            "multiplier": mult,
            "rho": mult / benchmark_cost(p_in, p_out),
            "cache_cost": cache_cost(p_in, p_out, required(row, WRITE), required(row, READ))
                          if has_cache_rates else None,
        }
    return refs


def reference(refs, name, row):
    if name not in refs:
        raise SystemExit(f"{row['model']}: rule refers to unknown listed model {name!r}")
    return refs[name]


def apply_rule(rule, row, refs, short_value):
    name, _, arg = rule.partition(":")
    p_in, p_out = required(row, IN), required(row, OUT)
    bench = benchmark_cost(p_in, p_out)
    if name == "input_price":
        return p_in
    if name == "same_as":
        return reference(refs, arg, row)["multiplier"]
    if name == "rho":
        return reference(refs, arg, row)["rho"] * bench
    if name == "rho_median":
        group = [r["rho"] for r in refs.values() if arg == "all" or r["family"] == arg]
        if not group:
            raise SystemExit(f"{row['model']}: no listed models in group {arg!r}")
        return median(group) * bench
    if name == "cache_scaled":
        ref = reference(refs, arg, row)
        if ref["cache_cost"] is None:
            raise SystemExit(f"{row['model']}: {arg} has no cache rates to scale from")
        own = cache_cost(p_in, p_out, required(row, WRITE), required(row, READ))
        return ref["multiplier"] * own / ref["cache_cost"]
    if name == "double_short":
        if short_value is None:
            raise SystemExit(f"{row['model']}: double_short needs a preceding short-context row")
        return 2 * short_value
    raise SystemExit(f"{row['model']}: unknown rule {rule!r}")


def main():
    parser = argparse.ArgumentParser(
        description="Estimate Kiro multipliers for Bedrock models that Kiro does not list.")
    parser.add_argument("--date", help="snapshot date of the input files (default: newest)")
    date = resolve_date(parser.parse_args().date)

    listed = read_rows(INPUTS / f"kiro_listed_models_{date}.csv")
    refs = reference_models(listed)
    anchor = find_anchor(listed)
    anchor_mult = required(anchor, "kiro_credit_multiplier")
    anchor_bench = benchmark_cost(required(anchor, IN), required(anchor, OUT))

    out, short = [], {}  # short: model -> estimates from its first (short-context) row
    for row in read_rows(INPUTS / f"bedrock_newer_models_{date}.csv"):
        bench = benchmark_cost(required(row, IN), required(row, OUT))
        equivalent = anchor_mult * bench / anchor_bench
        previous = short.get(row["model"], {})
        estimates = {col: apply_rule(row[f"{col}_rule"], row, refs, previous.get(col))
                     for col in ("central", "low", "high")}
        short.setdefault(row["model"], estimates)
        out.append([row["model"], row["context_price_tier"], row["bedrock_launch_date"],
                    row[IN], row[OUT], row[WRITE], row[READ],
                    num(bench), num(equivalent), num(estimates["central"]), num(estimates["low"]),
                    num(estimates["high"]), num((estimates["central"] / equivalent - 1) * 100),
                    row["closest_kiro_relative"], row["prediction_method"], row["confidence"],
                    row["price_basis"], row["bedrock_access"]])

    write_rows(RESULTS / f"bedrock_newer_models_predicted_kiro_{date}.csv",
               ["model", "context_price_tier", "bedrock_launch_date", "bedrock_input_usd_per_1M",
                "bedrock_output_usd_per_1M", "bedrock_cache_write_usd_per_1M",
                "bedrock_cache_read_usd_per_1M", "api_benchmark_cost_usd", "api_equivalent_multiplier",
                "PREDICTED_kiro_multiplier_central", "PREDICTED_low", "PREDICTED_high",
                "implied_premium_pct_at_central", "closest_kiro_relative", "prediction_method",
                "confidence", "price_basis", "bedrock_access"], out)


if __name__ == "__main__":
    main()
