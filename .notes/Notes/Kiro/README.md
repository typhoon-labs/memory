# Kiro credit multipliers vs Amazon Bedrock prices

Verified on **4 October 2026**. Kiro's models page was stamped "Page updated: October 2, 2026"; the Bedrock price feeds were published 30 September and 3 October 2026.

## Summary

Kiro charges credits at a per-model multiplier. This analysis asks whether those multipliers track what the same models cost on Amazon Bedrock, relative to one anchor model. It compares relative pricing only; it does not establish what a Kiro credit costs Kiro or how many tokens a credit buys.

- **Older Claude models track Bedrock closely.** Opus 5 and 4.x, Sonnet 4.5 and Haiku 4.5 sit within about 8% of the anchor.
- **Sonnet 5 and 5.5 are weighted 50% more heavily than Bedrock prices them.** Bedrock prices them a third below Sonnet 4.6, but Kiro keeps them at the same 1.3x.
- **GPT-5.6 is weighted about 2.4 to 2.8 times more heavily**, and GPT-5.6 Luna about 12 to 13 times.
- **Qwen3 Coder Next is the only model weighted well below its Bedrock-relative price** (69% below).
- **Subscription tier does not change the multipliers.** Every paid tier works out to $0.02 per included credit; add-on credits cost $0.04.

## Method

| Item | Choice |
|---|---|
| Benchmark workload | 1,000,000 uncached input tokens plus 100,000 output tokens |
| Anchor | Claude Sonnet 4.6, Kiro multiplier 1.3x, Bedrock benchmark cost $4.95 |
| Bedrock prices | Standard on-demand, US geographic cross-region or US in-region |
| Context tiers | Short and long context shown separately where Bedrock prices them separately |

For each model:

1. **API benchmark cost** = input price per million + 0.1 × output price per million
2. **API-equivalent multiplier** = anchor's Kiro multiplier × (model's benchmark cost ÷ anchor's benchmark cost)
3. **Kiro relative premium** = (Kiro multiplier ÷ API-equivalent multiplier − 1) × 100

A positive premium means Kiro weights the model more heavily than Bedrock does relative to the anchor. The anchor's premium is zero by construction.

## Main comparison

| Model and context tier | API benchmark cost (USD) | Kiro multiplier | API-equivalent multiplier | Kiro relative premium |
|---|---|---|---|---|
| GPT-5.6 Sol, short (≤272K) | 6.60 | 4.4x | 1.733 | +153.8% |
| GPT-5.6 Sol, long (>272K) | 12.10 | 8.8x | 3.178 | +176.9% |
| GPT-5.6 Terra, short | 3.52 | 2.2x | 0.924 | +138.0% |
| GPT-5.6 Terra, long | 6.38 | 4.4x | 1.676 | +162.6% |
| GPT-5.6 Luna, short | 0.352 | 1.1x | 0.092 | +1,089.9% |
| GPT-5.6 Luna, long | 0.638 | 2.2x | 0.168 | +1,213.0% |
| Claude Fable 5.1 (Enterprise Preview) | 16.50 | 6x | 4.333 | +38.5% |
| Claude Opus 5.5 | 6.60 | 2.0x | 1.733 | +15.4% |
| Claude Sonnet 5.5 | 3.30 | 1.3x | 0.867 | +50.0% |
| Claude Opus 5, 4.8, 4.7, 4.6, 4.5 (each) | 8.25 | 2.2x | 2.167 | +1.5% |
| Claude Sonnet 5 | 3.30 | 1.3x | 0.867 | +50.0% |
| **Claude Sonnet 4.6** | 4.95 | 1.3x | 1.300 | **Baseline** |
| Claude Sonnet 4.5 | 4.95 | 1.3x | 1.300 | 0.0% |
| Claude Sonnet 4.0 | 4.50 | 1.3x | 1.182 | +10.0% |
| Auto | unavailable | 1.0x | unavailable | unavailable |
| Claude Haiku 4.5 | 1.65 | 0.4x | 0.433 | −7.7% |
| DeepSeek 3.2 | 0.805 | 0.25x | 0.211 | +18.3% |
| MiniMax M2.5 | 0.42 | 0.25x | 0.110 | +126.6% |
| GLM-5 | 1.32 | 0.5x | 0.347 | +44.2% |
| MiniMax M2.1 | 0.42 | 0.15x | 0.110 | +36.0% |
| Qwen3 Coder Next | 0.62 | 0.05x | 0.163 | −69.3% |

Only GPT-5.6 has a separate long-context price on either side. Bedrock's page shows "Long Context" rows for Sonnet 4.6, Opus 4.6, Sonnet 4.5 and Sonnet 4, but they carry no price in any region, so Claude is treated as single-tier.

Full values: `data/results/kiro_vs_bedrock_main_2026-10-04.csv`.

## Cache-aware comparison

Scenario: the input-to-output ratio stays 10:1, and 90% of each call's input is a stable prefix reused across 10 calls (one cache write, nine reads). Averaged, the input is 10% uncached, 9% cache write and 81% cache read. The anchor costs $2.61855 under this scenario.

| Model and context tier | Cache-scenario cost (USD) | Kiro multiplier | API-equivalent multiplier | Kiro relative premium |
|---|---|---|---|---|
| GPT-5.6 Sol, short | 3.4914 | 4.4x | 1.733 | +153.8% |
| GPT-5.6 Sol, long | 5.8828 | 8.8x | 2.921 | +201.3% |
| GPT-5.6 Terra, short | 1.9657 | 2.2x | 0.976 | +125.4% |
| GPT-5.6 Terra, long | 3.2714 | 4.4x | 1.624 | +170.9% |
| GPT-5.6 Luna, short | 0.19657 | 1.1x | 0.098 | +1,027.2% |
| GPT-5.6 Luna, long | 0.32714 | 2.2x | 0.162 | +1,254.6% |
| Claude Fable 5.1 | 8.06025 | 6x | 4.002 | +49.9% |
| Claude Opus 5.5 | 3.3132 | 2.0x | 1.645 | +21.6% |
| Claude Sonnet 5.5 | 1.7457 | 1.3x | 0.867 | +50.0% |
| Claude Opus 5, 4.8, 4.7, 4.6, 4.5 (each) | 4.36425 | 2.2x | 2.167 | +1.5% |
| Claude Sonnet 5 | 1.7457 | 1.3x | 0.867 | +50.0% |
| **Claude Sonnet 4.6** | 2.61855 | 1.3x | 1.300 | **Baseline** |
| Claude Sonnet 4.5 | 2.61855 | 1.3x | 1.300 | 0.0% |
| Claude Sonnet 4.0 | 2.3805 | 1.3x | 1.182 | +10.0% |
| Claude Haiku 4.5 | 0.87285 | 0.4x | 0.433 | −7.7% |
| Auto | unavailable | 1.0x | unavailable | unavailable |
| DeepSeek 3.2, MiniMax M2.5, GLM-5, MiniMax M2.1, Qwen3 Coder Next | unavailable | — | unavailable | unavailable |

- **Cache TTL.** Claude uses the documented 5-minute default write rate. GPT-5.6 publishes only a 30-minute write rate, so those rows are not strictly like-for-like.
- **Open-weight models.** Bedrock publishes no cache rates for them, so they are not computed.
- **Unusual cache-read rates.** Opus 5.5 ($0.22, 5% of input) and Fable 5.1 ($0.275, 2.5% of input) are far below the usual 10%. The pricing page and the AWS Price List agree on both figures, and they are why those two rows move relative to the main table.

Full values: `data/results/kiro_vs_bedrock_cache_aware_2026-10-04.csv`.

## Routing and access exceptions

- **Price basis.** Claude uses US geo cross-region prices. GPT-5.6 uses US geo prices and is served from the US regardless of Kiro profile region. Open-weight models use US in-region prices, because Bedrock publishes no geo price for them.
- **Sonnet 4.0.** Bedrock publishes no geo uplift for it ($3/$15), which is the whole source of its +10%.
- **Fable 5.1.** Inference runs in us-east-1 only. It is a limited Enterprise Preview that an administrator must enable, and it is not on any self-serve plan.
- **Experimental models.** Opus 5.5, Sonnet 5.5, GPT-5.6, DeepSeek 3.2, MiniMax M2.1 and Qwen3 Coder Next may be processed in commercial Regions worldwide. If global prices applied to Opus 5.5 and Sonnet 5.5 while the anchor stayed on US geo, their premiums would be +26.9% and +65.0%.
- **EU profiles.** Enterprise profiles in Frankfurt are served from the EU for most models. EU prices are not computed here.
- **Free tier.** Per the models table, Free gets Sonnet 4.5, Sonnet 4.0, Auto and the open-weight models; everything else needs a paid plan. The pricing page footnote mentions only Sonnet 4.5 and open-weight models.

## Subscription tiers

This is separate from the normalized comparison above.

| Tier | Monthly price | Included credits | Add-on price | Price per included credit |
|---|---|---|---|---|
| Free | $0 | 50 | Not available | — |
| Pro | $20 per user | 1,000 | $0.04 per credit | $0.02 |
| Pro+ | $40 per user | 2,000 | $0.04 per credit | $0.02 |
| Pro Max | $100 per user | 5,000 | $0.04 per credit | $0.02 |
| Power | $200 per user | 10,000 | $0.04 per credit | $0.02 |
| Enterprise | Contact sales | Per subscribed tier (Pro to Power) | $0.04 per credit, opt-in overage | — |

- **Multipliers do not vary by tier.** Kiro publishes one multiplier per model. Tier changes credit volume and model access only.
- **Purchase price per credit.** Every paid tier costs the same $0.02 per included credit. The effective price rises only when add-ons or overage are bought at $0.04.
- **Add-ons.** Packs run from $5 (125 credits) to $100 and expire after 12 months. Monthly credits do not roll over.
- **Auto.** The multiplier is the same on every tier, but the routing differs: Free gets "Sonnet-class or better" and paid gets "Opus-class or better".
- **GovCloud.** Pricing is about 20% higher, with no Free tier.

## Estimates for Bedrock models Kiro does not list

**Everything in this section is an estimate. Kiro has not published multipliers for these models.** The Bedrock prices are verified; the multipliers are extrapolated from how Kiro weights related models.

The table covers text models on Bedrock that Kiro does not list: the 15 launched since June 2026, plus Claude Mythos Preview, whose launch date is not published. It shows short-context prices; the long-context estimate is double in each case, as Kiro does for GPT-5.6.

| Model | Bedrock launch | Input / output per 1M | Benchmark cost | API-equivalent multiplier | Estimated Kiro multiplier | Plausible range | Confidence |
|---|---|---|---|---|---|---|---|
| GPT-6.1 Sol | 29 Sep 2026 | $2.20 / $11.00 | 3.30 | 0.867 | **2.2x** | 2.1–4.4x | Medium |
| GPT-6 Sol | 22 Sep 2026 | $2.20 / $11.00 | 3.30 | 0.867 | **2.2x** | 2.1–4.4x | Medium |
| GPT-6 Luna | 22 Sep 2026 | $0.11 / $0.55 | 0.165 | 0.043 | **≈0.5x** | 0.11–1.1x | Low to medium |
| GPT-6 Astra | 8 Sep 2026 | $11.00 / $55.00 | 16.50 | 4.333 | **11x** | 6–11x | Medium |
| GPT-5.5 | 1 Jun 2026 | $5.50 / $33.00 | 8.80 | 2.311 | **5.5x** | 5.5–5.9x | Medium |
| GPT-5.4 | 1 Jun 2026 | $2.75 / $16.50 | 4.40 | 1.156 | **2.75x** | 2.75–2.9x | Medium |
| Claude Fable 5 | 9 Jun 2026 | $11 / $55 | 16.50 | 4.333 | **6x** | 4.3–6.5x | Medium to high |
| Kimi K3 (open-weight) | 18 Sep 2026 | $3.30 / $16.50 | 4.95 | 1.300 | **≈1.8x** | 1.3–2.9x | Low |
| Grok 4.7 | 28 Sep 2026 | $2.20 / $6.60 | 2.86 | 0.751 | **≈0.9x** | 0.75–2.2x | Low |
| Grok 4.6 | 18 Aug 2026 | $2.20 / $6.60 | 2.86 | 0.751 | **≈0.9x** | 0.75–2.2x | Low |
| Grok 4.3 | 15 Jun 2026 | $1.25 / $2.50 | 1.50 | 0.394 | **≈0.45x** | 0.39–1.25x | Low |
| *Gated on Bedrock:* | | | | | | | |
| Claude Mythos 5.1 | 1 Sep 2026 | $11 / $55 | 16.50 | 4.333 | 6x | 4.3–6x | Medium, if ever listed |
| Claude Mythos 5 | 9 Jun 2026 | $11 / $55 | 16.50 | 4.333 | 6x | 4.3–6.5x | Medium, if ever listed |
| Claude Mythos Preview | not published | $27.50 / $137.50 | 41.25 | 10.833 | 15x | 10.8–15x | Low |
| Daybreak Blue: GPT-5.6 Sol | 12 Aug 2026 | $4.40 / $22.00 | 6.60 | 1.733 | 4.4x | 4.4x | Medium, if ever listed |
| Daybreak Red: GPT-5.6 Cyber | 12 Aug 2026 | $13.75 / $82.50 | 22.00 | 5.778 | 13.75x | 13.75–14.7x | Low |

### How the estimates were made

- **OpenAI models.** Kiro's GPT-5.6 Sol and Terra multipliers equal their Bedrock US input price per million tokens (4.4x on $4.40, 2.2x on $2.20). That rule is applied to the other OpenAI models.
- **GPT-6 Luna.** GPT-5.6 Luna breaks the input-price rule (1.1x on a $0.22 input). GPT-6 Luna costs a little under half as much on the benchmark, so 1.1x is scaled by that ratio.
- **Claude Fable 5 and Mythos.** Fable 5 and both Mythos 5 models share Fable 5.1's list price, which Kiro sets at 6x. Mythos Preview costs 2.5 times as much, so 6x is scaled to 15x.
- **Kimi K3.** The estimate uses the median multiplier per benchmark dollar of Kiro's five open-weight models. The low end is parity with Sonnet 4.6, which has the identical Bedrock price.
- **Grok.** Kiro lists no xAI model, so the estimate uses the median multiplier per benchmark dollar across all 21 priced Kiro models. The high end applies the OpenAI input-price rule.

### What drives the ranges

- **Kiro may carry a tier's multiplier forward instead of tracking a price cut.** Sonnet 5 kept 1.3x after a one-third price drop, and Opus 5.5 only moved from 2.2x to 2.0x on a 20% drop. This is why GPT-6 Sol could stay at 4.4x and GPT-6 Luna at 1.1x.
- **GPT-6 Astra has the widest disagreement.** It shares Fable 5.1's $11/$55 price, so the OpenAI rule gives 11x while parity with Fable gives 6x.
- **Kimi K3 cannot sit with the other open-weight models.** Its Bedrock price equals Sonnet 4.6, far above the models Kiro prices at 0.05x to 0.5x.

### Likelihood of being listed at all

- **Gated models.** The Mythos and Daybreak models require trusted-access approval on Bedrock, so they are unlikely to appear on self-serve Kiro plans.
- **GPT-5.5 and GPT-5.4.** These predate GPT-5.6, which Kiro describes as its first OpenAI models, so Kiro has already skipped them.
- **In-region only.** GPT-5.5, GPT-5.4, Grok 4.3 and both Daybreak models list only in-region prices on Bedrock.

Full values, including long-context rows: `data/results/bedrock_newer_models_predicted_kiro_2026-10-04.csv`.

## Limitations

- The anchor's zero premium is imposed by normalization. It says nothing about Sonnet 4.6's absolute markup.
- Published multipliers do not reveal tokens per credit, so none of this establishes Kiro's absolute markup or per-request cost. That needs measured credit consumption.
- Kiro notes that models sharing a multiplier can still consume different credits for the same task, because of tokenizer differences, thinking depth and reasoning effort.
- Auto has no API-equivalent price without knowing which models it routes to and in what mix.
- The benchmark's 10:1 input-to-output ratio is an assumption. A different ratio changes the premiums for models whose output-to-input price ratio differs from the anchor's 5:1, which includes most GPT-5.6 tiers and all the open-weight models.
- GPT-5.6 prices come from the AWS model cards only; they are not in the AWS Price List file for us-east-1. Claude and open-weight prices were confirmed in both the pricing page feed and the AWS Price List.

## Folder layout

```
README.md                 this document
data/inputs/              verified prices and Kiro multipliers, entered by hand from the sources
data/results/             tables produced by the scripts
scripts/                  the calculations and the source downloader
sources/2026-10-04/       the pages and price files as downloaded on the verification date
```

| File | Contents |
|---|---|
| `data/inputs/kiro_listed_models_<date>.csv` | Every Kiro-listed model: multiplier, plan access, Bedrock prices and their basis |
| `data/inputs/bedrock_newer_models_<date>.csv` | Bedrock models Kiro does not list: prices, plus the rule behind each estimate |
| `data/inputs/kiro_subscription_tiers_<date>.csv` | Tier prices, included credits and add-on price |
| `sources/<date>/MANIFEST.csv` | URL, size, SHA-256 and fetch time for every downloaded file |
| `sources/<date>/bedrock/pricing_resolved_us-east-1.txt` | The Bedrock pricing page as text with prices filled in |
| `sources/<date>/model-cards/launch_dates.csv` | Launch date, lifecycle and context window for all 134 AWS model cards |

The snapshot keeps the 36 model cards for models in the analysis rather than all 134.

## Reproducing and updating

The scripts use only the Python 3 standard library (written for 3.9 or later, run here on 3.14). Run them from this folder.

```
python3 scripts/compute_comparison.py    # main, cache-aware and tier tables
python3 scripts/predict_newer.py         # estimates for unlisted models
```

Both read the newest dated files in `data/inputs/` unless `--date YYYY-MM-DD` is given.

To refresh the analysis on a later date:

1. Run `python3 scripts/fetch_sources.py`. It downloads the sources into `sources/<today>/` and refuses to overwrite an existing snapshot.
2. Copy the three input files to the new date and update them by hand from the new snapshot. The resolved pricing text covers Claude and the open-weight models; the model cards cover GPT-5.6 and the newer OpenAI, xAI and Moonshot models; `launch_dates.csv` shows which models are new.
3. Run the two calculation scripts with the new date.

Prices are deliberately not extracted automatically. The Bedrock pricing page loads its numbers from a separate feed and marks regions and routing options in page layout, so the input tables are reviewed by hand.

## Sources

- [Kiro models](https://kiro.dev/docs/models/)
- [Kiro available models](https://kiro.dev/docs/models/available-models/)
- [Kiro pricing](https://kiro.dev/pricing/)
- [Kiro billing overview](https://kiro.dev/docs/billing/)
- [Kiro add-on credits](https://kiro.dev/docs/billing/add-on-credits/)
- [Kiro enterprise billing](https://kiro.dev/docs/enterprise/billing/)
- [Amazon Bedrock pricing](https://aws.amazon.com/bedrock/pricing/)
- [AWS Price List, Bedrock foundation models, us-east-1](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrockFoundationModels/current/us-east-1/index.json)
- [AWS Price List, Bedrock, us-east-1](https://pricing.us-east-1.amazonaws.com/offers/v1.0/aws/AmazonBedrock/current/us-east-1/index.json)
- [Bedrock model cards](https://docs.aws.amazon.com/bedrock/latest/userguide/model-cards.html)
- [Bedrock prompt caching](https://docs.aws.amazon.com/bedrock/latest/userguide/prompt-caching.html)
