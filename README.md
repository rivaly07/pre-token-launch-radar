# pre-token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/rivaly07/pre-token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/rivaly07/pre-token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Ranks the 198 pre-token protocols in the token-radar-01 snapshot by implied value, using a power-law size curve fitted on the snapshot's own comparables and hazard-based launch odds, with a per-row farm plan across three deposits and three drop shares.

## What it does

The snapshot holds 758 protocols. Only 198 are honest candidates:

| Cohort | Count | Why |
|---|---|---|
| Candidates ranked | **198** | no token, no cap, not a derivative |
| Set aside: CEX | 42 | exchange product, not a protocol |
| Set aside: Liquid Staking | 38 | derivative of a base asset |
| Set aside: Bridge | 28 | infrastructure, not a launch candidate |
| Set aside: Canonical Bridge | 15 | same |
| Set aside: versioned name | 11 | `V2`/`2.0` — a version, not a new protocol |
| Set aside: wrapped/staked | 5 | derivative by name |
| Set aside: Liquid Restaking | 3 | derivative |
| Set aside: Restaked BTC | 2 | derivative |
| With token + cap | 144 | already trading, shown separately |
| Token records, no cap | 272 | unknown size, excluded from the fit |

The old failure mode was ranking `Binance CEX` first at a $9.98B implied value. A CEX is excluded by the snapshot's own rules, so it cannot be a launch candidate at all.

## The model

```
mcap ≈ exp(6.9646) × TVL^0.5223        R² in log space, fitted on 128 comparables
premium = category median, shrunk      w = n/(n+5) toward the snapshot-wide 1.0753
odds    = 1 − exp(−λ·2y)               λ shrunk per category, global 0.5019
implied = value_if_launch × odds
```

Held-out test: every 4th comparable is removed from the fit.

| | miss |
|---|---|
| power law | **90.19%** |
| flat multiple | 98.78% |
| **ratio** | **0.913** |

Below 1.0 means the size curve beats the flat baseline, but only by 8.7% — the method panel says exactly that instead of overselling it. Range: P25 ×0.311, P50 ×1.075, P75 ×4.110. The band is wide and the dashboard shows the width rather than hiding it.

Guards, asserted in code: no row exceeds 4× its own TVL, nothing above $1.5B, ranks 1..198 non-increasing.

## Farm plan

Every row gets 7 steps generated from its own numbers — chain and why, deposit, onboarding, 12 separate weekly touches, a review date from `1/λ`, an exit rule on TVL, and a closing line with at-risk capital, fees and expected airdrop. Heuristic EV across 3 deposits × 3 drop shares with per-chain gas: Solana $0.02, Base $0.05, Arbitrum $0.10, Optimism/Polygon $0.30, Ethereum $3.00.

Verdict split: **FARM 105**, MARGINAL 57, SKIP 36.


Deterministic: two runs produce byte-identical `board.json` (`1a98ba05…`).

## Layout

```
lib/model.ts      1,184 lines — classification, size curve, premium, odds, farm plan
main.ts           wiring and output
dashboard/        3 files, 23 KB, zero network addresses
screenshots/      3 frames: board, detail view, FARM filter
```

Dashboard: KPI strip, cohort accounting, sortable table with filters and search, per-protocol detail panel with its own arithmetic in six numbered lines. Renders offline.

## Limits

- Odds are a hazard estimate, not a promise. A protocol with 89% odds can still never launch.
- The comparables are TVL-matched, not sector-matched at small n; categories with fewer than 5 comparable use the global premium.
- Farm EV is a heuristic with assumed drop share, not a forecast.
- Not investment advice.

MIT.

## Run it

```sh
MAKEFUN_OUTPUT_DIR=out1 node main.ts --input input/snapshot.json
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
