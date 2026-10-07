#!/usr/bin/env python3
"""Compare Kiro credit multipliers with multipliers implied by Bedrock prices.

Reads   data/inputs/kiro_listed_models_<date>.csv
        data/inputs/kiro_subscription_tiers_<date>.csv
Writes  data/results/kiro_vs_bedrock_main_<date>.csv
        data/results/kiro_vs_bedrock_cache_aware_<date>.csv
        data/results/kiro_subscription_tiers_<date>.csv

For each model:
  API benchmark cost        = input price + 0.1 x output price
  API-equivalent multiplier = anchor Kiro multiplier x (model cost / anchor cost)
  Kiro relative premium (%) = (Kiro multiplier / API-equivalent multiplier - 1) x 100
The cache-aware table uses the same formulas with the cache-scenario cost.

Usage: python3 scripts/compute_comparison.py [--date YYYY-MM-DD]
"""
import argparse
from fractions import Fraction

from common import (INPUTS, RESULTS, benchmark_cost, cache_cost, find_anchor,
                    frac, num, read_rows, required, resolve_date, write_rows)

NO_CACHE_NOTE = "Cache rates not published by Bedrock; not computed"
IN, OUT = "bedrock_input_usd_per_1M", "bedrock_output_usd_per_1M"
WRITE, READ = "bedrock_cache_write_usd_per_1M", "bedrock_cache_read_usd_per_1M"


def premium_cell(row, anchor, kiro, equivalent):
    return "Baseline" if row is anchor else num((kiro / equivalent - 1) * 100)


def main():
    parser = argparse.ArgumentParser(
        description="Compare Kiro credit multipliers with multipliers implied by Bedrock prices.")
    parser.add_argument("--date", help="snapshot date of the input files (default: newest)")
    date = resolve_date(parser.parse_args().date)

    listed = read_rows(INPUTS / f"kiro_listed_models_{date}.csv")
    anchor = find_anchor(listed)
    anchor_mult = required(anchor, "kiro_credit_multiplier")
    anchor_bench = benchmark_cost(required(anchor, IN), required(anchor, OUT))
    anchor_cache = cache_cost(required(anchor, IN), required(anchor, OUT),
                              required(anchor, WRITE), required(anchor, READ))

    main_rows, cache_rows = [], []
    for row in listed:
        model, tier, kiro_text = row["model"], row["context_price_tier"], row["kiro_credit_multiplier"]
        kiro = required(row, "kiro_credit_multiplier")
        p_in, p_write, p_read = frac(row[IN]), frac(row[WRITE]), frac(row[READ])
        basis, plans, status = row["price_basis"], row["kiro_plan_access"], row["kiro_lifecycle_status"]
        source, notes = row["price_source"], row["notes"]

        if p_in is None:  # no single Bedrock price (Auto)
            main_rows.append([model, tier, "unavailable", kiro_text, "unavailable", "unavailable",
                              "", "", "", basis, plans, status, source, notes])
            cache_rows.append([model, tier, "unavailable", kiro_text, "unavailable", "unavailable",
                               "", "", "", "", "", plans, notes])
            continue

        p_out = required(row, OUT)
        bench = benchmark_cost(p_in, p_out)
        equivalent = anchor_mult * bench / anchor_bench
        main_rows.append([model, tier, num(bench), kiro_text, num(equivalent),
                          premium_cell(row, anchor, kiro, equivalent),
                          num(p_in), num(p_out), num(bench / anchor_bench),
                          basis, plans, status, source, notes])

        if p_write is None or p_read is None:  # cache rates not verified
            cache_rows.append([model, tier, "unavailable", kiro_text, "unavailable", "unavailable",
                               num(p_in), num(p_out), "", "", "", plans, NO_CACHE_NOTE])
            continue

        cached = cache_cost(p_in, p_out, p_write, p_read)
        equivalent_cached = anchor_mult * cached / anchor_cache
        cache_rows.append([model, tier, num(cached), kiro_text, num(equivalent_cached),
                           premium_cell(row, anchor, kiro, equivalent_cached),
                           num(p_in), num(p_out), num(p_write), num(p_read),
                           row["cache_write_ttl"], plans, notes])

    write_rows(RESULTS / f"kiro_vs_bedrock_main_{date}.csv",
               ["model", "context_price_tier", "api_benchmark_cost_usd", "kiro_credit_multiplier",
                "api_equivalent_multiplier", "kiro_relative_premium_pct", "bedrock_input_usd_per_1M",
                "bedrock_output_usd_per_1M", "cost_ratio_to_anchor", "price_basis", "kiro_plan_access",
                "kiro_lifecycle_status", "price_source", "notes"], main_rows)
    write_rows(RESULTS / f"kiro_vs_bedrock_cache_aware_{date}.csv",
               ["model", "context_price_tier", "cache_scenario_cost_usd", "kiro_credit_multiplier",
                "api_equivalent_multiplier_cache", "kiro_relative_premium_pct_cache",
                "bedrock_input_usd_per_1M", "bedrock_output_usd_per_1M", "bedrock_cache_write_usd_per_1M",
                "bedrock_cache_read_usd_per_1M", "cache_write_ttl_used", "kiro_plan_access", "notes"],
               cache_rows)

    tier_rows = []
    for row in read_rows(INPUTS / f"kiro_subscription_tiers_{date}.csv"):
        price, credits = row["monthly_price_usd_per_user"], row["included_credits_per_month"]
        try:
            per_credit = num(Fraction(price) / Fraction(credits)) if Fraction(price) > 0 else "0"
        except ValueError:  # custom pricing
            per_credit = "n/a"
        tier_rows.append([row["tier"], price, credits, row["addon_or_overage_usd_per_credit"],
                          per_credit, row["model_access_notes"]])
    write_rows(RESULTS / f"kiro_subscription_tiers_{date}.csv",
               ["tier", "monthly_price_usd_per_user", "included_credits_per_month",
                "addon_or_overage_usd_per_credit", "effective_usd_per_included_credit",
                "model_access_notes"], tier_rows)


if __name__ == "__main__":
    main()
