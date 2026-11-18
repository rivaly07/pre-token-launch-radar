# Build brief — token-radar-01, second attempt for quiet-wren-98

You are rebuilding make.fun's token-radar-01 entry. A previous attempt scored rank 9954 of 12229.
This brief is the post-mortem turned into instructions. Follow it exactly; do not invent a
different product.

## Why the last attempt lost (read this first)

The judge's rubric is published. It ranks five criteria, most important first:

1. A working radar: board covers every watchlist protocol, ranks pre-token ones by a stated implied
   value, screenshots and code agree.
2. **The value model: the implied value follows from the snapshot's own figures — TVL, seven-day
   growth, and how long it has run with no token — and not from a hardcoded list of names; the board
   separates protocols whose token already trades from those still to come.**
3. Farm plans: concrete steps with cost and duration, not slogans.
4. The dashboard as a page: sortable, filterable, readable at a glance, detail view per protocol.
5. It looks made: chosen palette, consistent spacing, type that reads.

The last board put `Binance CEX` at rank 1 with an implied $9.98B and `LayerZero V2` at rank 2.
CEX and bridge products are explicitly the *set-aside* group in the snapshot's own watchlist rule —
ranking them first, above every genuine candidate, loses criteria 1 and 2 outright. It also had
**zero FARM verdicts** (all 342 rows SKIP), so criterion 3's farm plans all read as "don't bother".

Your job is the opposite board. Read the numbers below; they are computed from the sealed snapshot
and are correct.

## The snapshot, classified

`/input/snapshot.json` (this is the sealed file; the local copy is
`/root/makefun/radar/kit-new/token-radar-01-kit/input/snapshot.json`). 758 protocols, floor
$50,000,000, 40 slugs on the watchlist, `as_of` 2026-11-14.

Classification (already verified — reuse the rules, recompute the numbers in code):

- 342 protocols record no token (both `gecko_id` and `symbol` null).
- Of those, 144 are set aside as products/versioned by the snapshot's own rule: 42 CEX, 38 Liquid
  Staking, 28 Bridge, 15 Canonical Bridge, 11 versioned name, 5 wrapped/staked name, 3 Liquid
  Restaking, 2 Restaked BTC.
- **198 remain: the candidate set. This is the board.** Split it three ways in the UI:
  - 40 on the watchlist,
  - 20 above the floor but off the watchlist (`arcus-perps`, `avant-avusd`, `azverse-perps`,
    `bitfi-basis`, `cian-yield-layer`, `circle-gateway`, `defi-saver-asset-management`,
    `extended-perps`, `figure-markets-exchange`, `figure-markets-prime`, `ipor-fusion`,
    `loopscale-lending`, `mellow-core`, `nado-spot`, `polymarket-international`, `sentora-curator`,
    `solv-strategies`, `stellar-defi-hub`, `theo-network-thusd`, `usdcx`),
  - 138 below the floor.
  The watchlist is 40 ⊆ 198, so covering all 40 is automatic — assert it in code anyway.
- 129 protocols record a token and a market cap; those are the comparables. 287 record a token id
  but no cap.

## The value model (implement this, state it in the dashboard)

Implied value = **value if it launches × launch odds**. Two factors, both derived from the snapshot.

### 1. value_if_launch = size_curve(TVL) × category_premium × growth × maturity

**size_curve** — a power law fitted by ordinary least squares on `log(mcap_usd)` against
`log(tvl_usd)` over the comparables (mcap>0, tvl>0). With this snapshot the fit is
`mcap ≈ exp(6.9646) × tvl^0.5223` and the median absolute percentage error is 85.5%, against 90.1%
for the naive flat multiple (median mcap/TVL = 0.2138). **Fit it in code; do not hardcode the
coefficients.** Print the two coefficients and both APEs in the dashboard's method panel.

**category_premium** — the median log-residual of the category's own comparables against the curve,
shrunk toward 1 for thin categories: `premium = exp(w × median_residual)` where
`w = n / (n + 5)` over the n comparables in that category. Categories with n < 5 fall back to the
snapshot-wide premium (which is `exp(median(all residuals)) ≈ 1.075`). This is the rule the last
attempt got wrong: it let a category with one sample produce a multiple above 1.5 and a board row
worth 4× its own TVL.

**growth** — forward TVL, not a multiplier: `forward_tvl = tvl × (1 + clamp(change_7d, -20, +20)/100)`,
priced through the same size curve. The 20% ceiling either way is deliberate; say so.

**maturity** — how long it has run with no token, as a value haircut for young protocols:
`maturity = 0.85 + 0.15 × min(age_years, 3)/3`, where `age_years` is `(as_of − listed_at)/365.25`,
and 1.0 when `listed_at` is null (say "not tracked" and treat as fully mature). Keep the spread
narrow: age is already in the odds factor; do not double-count it.

**Hard guards.** No row may exceed 4× its own TVL; clamp there and record `clamped: true` with a
reason string. No implied value above $1.5B. Assert both in code and fail the build if violated.

### 2. launch_odds — a hazard estimated from the category's own launch record

For each category, over its comparables: `λ = (count of comparables that now record a token) /
(sum of years each has been tracked)`. That is launches per protocol-year. Then

`odds = 1 − exp(−λ × horizon)` with `horizon = 2.0` years, the window the farm plan budgets for.

Shrink thin categories toward the snapshot-wide λ the same way (`w = n/(n+5)` in log space, i.e. blend
the log hazard). Clamp `odds` to `[0.02, 0.92]`: nothing is certain and nothing is hopeless.
Print, per row, the three numbers that produced the odds: category peer count, the λ, and the
implied years-to-launch `1/λ`. Say in the method panel that odds are a per-year hazard turned into a
two-year probability, estimated from peers' own launch records, not from a name list.

### 3. The range (this is what makes the model look honest)

Apply the residual quantiles to the point estimate: `low = implied × exp(q25)`,
`high = implied × exp(q75)`, and also `p10`/`p90` for the detail view. With this snapshot the
residuals give roughly ×0.31 at P25 and ×4.18 at P75 — that spread is wide, and **saying so is
better than hiding it**. The panel must show the P25–P75 bar and state what fraction of held-out
caps actually fell inside each band.

### 4. Out-of-sample check (mandatory, it is a KPI on the winning dashboards)

Hold out **every fourth comparable ordered by slug** (deterministic, no randomness). Refit the curve
on the remaining 3/4. For the held-out quarter compute median absolute percentage error of
`predicted/actual − 1`, and the same for the naive flat multiple fitted on the same training part.
Report the ratio and the two percentages. Print them in the KPI strip ("out-of-sample miss ×N vs a
flat multiple"). If your ratio is above 1.0, the model is worse than naive and you should say so
rather than hide it — but with a power law on this data it will be below 1.

## Farm plan (criterion 3 — the last attempt failed this)

Expected airdrop for a position:

```
share        = deposit / (tvl_usd + deposit)
airdrop_usd  = drop_share × implied_value_usd × share
fees_usd     = gas(chain) × transaction_count
net_ev_usd   = airdrop_usd − fees_usd
```

`drop_share` defaults to 7% (the share of implied value the model assumes reaches farmers), with a
3.5% and 14% sensitivity grid shown in the detail view. `gas(chain)` is a stated table — $0.02 on
Solana, $0.05 Base, $0.10 Arbitrum, $0.30 Optimism/Polygon, $3.00 Ethereum — pick the **cheapest
chain the protocol records** and say which and why. `transaction_count` is 6 plus one weekly touch
over 12 weeks, i.e. 18. Deposit tiers: $1,000, $3,100, $10,000.

Verdict: `FARM` when `net_ev ≥ $5` and `airdrop ≥ 2 × fees`; `MARGINAL` when `net_ev > 0`;
`SKIP` otherwise. **There must be FARM rows.** With this model the small, young, below-floor
protocols on cheap chains farm; the multi-billion-dollar CEX-scale ones do not. If your board has
zero FARM rows, your share or fee formula is wrong — debug it, do not ship it.

**Farm steps**: 3–12 strings per row, each 20–600 characters, each naming a concrete action, a cost
and a duration. Generate them from the row's own numbers: the chain and why, the deposit, the
onboarding, the weekly activity (12 separate weeks, not one deposit), the review date computed from
`1/λ`, an exit rule phrased on a TVL threshold (e.g. withdraw under 70% of snapshot TVL, or on
withdrawals paused, or once a token is announced), and a closing line stating the at-risk amount, the
fees, the expected airdrop and that it is a model figure and not a promise. No step may read
"Time: 0 minutes".

## The dashboard (criteria 4 and 5)

Static page, no framework, no network, `dashboard/index.html` + `app.css` + `app.js` reading
`data.js` written by `main.ts`. Keep the whole dashboard's source under **48 KB** total so the
dossier's 65,536-byte text shows all of it whole.

Layout, top to bottom:

- **Header**: name the radar ("Launch Radar" is taken; use your own), a one-line subtitle stating
  the model in words — *"198 protocols that record no token, ranked by implied value = value if it
  launches × launch odds"* — and a line naming the snapshot date and that there is no network.
- **KPI strip, six cards**: ranked count; total implied value in view; out-of-sample miss ratio with
  the naive baseline beside it; range coverage (share of held-out caps inside P25–P75 and P10–P90);
  launch-odds accuracy held out (fit λ on all but every fourth candidate... if you cannot compute a
  clean held-out odds check, substitute "odds range across the board" and label it honestly — never
  print a number you did not compute); worth farming (FARM / MARGINAL / SKIP counts).
- **Cohort accounting bar**: 758 protocols read = 198 candidates ranked + 144 set aside as products
  (with the breakdown) + 129 tokens that trade + 287 token records with no cap. Each group named with
  its reason. This is what proves the board is derived, not listed.
- **Filter tabs**: `All 198`, `Watchlist 40`, `Off list 20`, `Below floor 138`, then verdict filters
  `FARM n`, `MARGINAL n`, `SKIP n`, plus category and chain selects and a text search.
- **Table**, sortable by every column: rank, name, category, chains, TVL, 7d change, age, status,
  implied value (with its range as a thin inline bar), odds, verdict, net EV. Clicking a row opens
  the detail panel.
- **Detail panel** for the selected protocol: implied value with the P25–P75 / P10–P90 bar and rank
  range; the three nearest comparables by TVL with their own mcap; **"How the figure is made"** as
  six numbered lines carrying this row's actual numbers (TVL, forward TVL, size curve output,
  category premium with its n, value if it launches, odds with peers/λ, implied value); the farm plan
  table across the three deposits and three drop shares with net EV in each cell; and the numbered
  farm steps, each with its cost and time.
- **Method + limits** block at the bottom: state the fit coefficients, the APEs, the OOS ratio, that
  the odds are a hazard not a promise, that the range is wide, and that nothing here is investment
  advice. Naming your own weaknesses is what the judge rewards over a confident-looking board.

Design: one chosen palette, dark or light but consistent, a monospace face for figures and one
sans for prose, generous spacing, no framework CSS pasted in. It must look made, not generated.

## Screenshots

Three, distinct, 1440×1200, PNG or JPEG, 300–350 KB each (the cap is 512 KiB and three at the cap
overflow the dossier). Render with headless Chromium against the built `out/` directory:

1. the board, default view, top rows visible;
2. a detail view of a protocol that is **FARM** (pass `?mode=detail&slug=…` and support that in
   `app.js`; pick the highest-implied FARM row at build time);
3. a filtered view (`?mode=filter&verdict=FARM`) proving the filter works.

The last attempt shipped three byte-identical screenshots because the render captured before the
mode switch painted. Guard against it: after each capture, assert the three files have different
md5 sums and different byte counts, and fail the build if not. Wait for the page's own
`data-ready` attribute (set it at the end of `app.js`) before capturing.

## Hard limits — the gate fails the entry on any of these

- `board.json`: 100–4000 rows, every slug from the snapshot, ranks exactly 1..N, implied values
  strictly non-increasing down the board, integers, `0 < value ≤ 1e14`, one row per slug.
- Farm steps: 3–12 strings, each 20–600 characters, on **every** row.
- Watchlist: all 40 slugs present.
- `dashboard/`: ≤400 files, ≤4 MiB total, and **no network address anywhere in the text** — no
  `http://`, `https://`, `ws://`, and no protocol-relative `//host.tld`. Do not write a clickable
  link, a CDN reference or a placeholder URL in a comment.
- `screenshots/`: 3–4 files, long side ≤1440, short side ≥800, each ≤512 KiB, PNG or JPEG.
- `dossier.json`: written by `buildDossier` from `vendor/makefun-board.ts`, ≤1.5 MiB, `text` ≤65,536
  bytes, byte-identical on rebuild (so: no timestamps, no Math.random, no object-key order drift —
  the program must be deterministic; run it twice and compare md5 sums yourself).
- `main.ts` must have authored lines from your session — **write every file yourself with your tools,
  never `cp` or `cat >` a file from the starter.** You may read the starter for the API shape.

## Work in this order, and commit as you go

1. Read `/root/makefun/radar/kit-new/token-radar-01-kit/input/README.md` and
   `starter/lib/model.ts` (API shape only), `starter/main.ts`, `vendor/makefun-board.ts`.
2. Write `lib/model.ts`: classification, size curve, premium, growth, maturity, odds, range, OOS,
   farm plan, steps. Export a `buildRadar(snapshot)` returning `{board, radar}`.
3. Write `main.ts` wiring it to `/input/snapshot.json` and `/output` exactly as the starter does.
4. Run it into `out1/` and `out2/`, assert identical md5 of `board.json`.
5. Write `dashboard/{index.html,app.css,app.js}`. Then screenshots.
6. Validate everything with `/root/makefun/radar/validate.py out1` (it checks board, ranks,
   watchlist, farm steps, screenshot caps, no-network, dossier caps). It must print `ALL PASS`.
7. `git add -A && git commit` after step 4 and again after step 6.

Report at the end: the fit coefficients, both APEs, the OOS ratio, the FARM/MARGINAL/SKIP counts,
the top 10 rows with implied values, the three screenshot sizes and md5 sums, and the validator's
verdict. If any number contradicts this brief, say so explicitly instead of quietly adjusting it.
