// Token-radar model: classification, power-law size curve, category premium,
// growth, maturity, launch-odds hazard, range quantiles, out-of-sample check,
// and farm plan.  Every function is derived from the snapshot — no hand-tuned
// name list.

// -------------------------------------------------------------------- types

export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  status: 'watchlist' | 'off-list' | 'below-floor';
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  net_ev_usd: number;
  farm_steps: string[];
}

export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  age_years: number | null;
  forward_tvl_usd: number;
  size_curve_usd: number;
  category_premium: number;
  category_premium_n: number;
  maturity: number;
  value_if_launch_usd: number;
  launch_odds: number;
  launch_peers: number;
  launch_lambda: number;
  launch_years_to_launch: number;
  implied_value_usd: number;
  implied_low_p25: number;
  implied_high_p75: number;
  implied_low_p10: number;
  implied_high_p90: number;
  status: 'watchlist' | 'off-list' | 'below-floor';
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
  net_ev_usd: number;
  gas_per_tx: number;
  cheapest_chain: string;
  nearest_comparables: { slug: string; name: string; tvl_usd: number; mcap_usd: number }[];
  farm_table: {
    deposit: number;
    drop_share: number;
    share: number;
    airdrop_usd: number;
    fees_usd: number;
    net_ev_usd: number;
  }[][];
  model: {
    size_curve_intercept: number;
    size_curve_exponent: number;
    growth_pct: number;
    growth_multiplier: number;
    maturity_multiplier: number;
    age_days: number | null;
    clamped: boolean;
    clamp_reason: string | null;
  };
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

export interface Comparable {
  slug: string;
  name: string;
  category: string | null;
  tvl_usd: number;
  mcap_usd: number;
  listed_at: string | null;
}

export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model_version: string;
  total_protocols: number;
  candidates_count: number;
  setaside_count: number;
  setaside_breakdown: Record<string, number>;
  with_token_with_cap: number;
  with_token_no_cap: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  off_list_size: number;
  live_size: number;
  total_implied_value: number;
  farm_count: number;
  marginal_count: number;
  skip_count: number;
  oos_curve_miss: number;
  oos_flat_miss: number;
  oos_ratio: number;
  range_p25_coverage: number;
  range_p90_coverage: number;
  size_curve_intercept: number;
  size_curve_exponent: number;
  curve_ape: number;
  flat_ape: number;
  global_premium: number;
  global_lambda: number;
  range_p10: number;
  range_p25: number;
  range_p50: number;
  range_p75: number;
  range_p90: number;
  rows: RadarRow[];
  live: LiveRow[];
  comparables: Comparable[];
}

export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

// -------------------------------------------------------------------- constants

export const MODEL_VERSION = 'launch-radar-1.0';
const OOS_STEP = 4;
const HORIZON_YEARS = 2.0;
const MIN_TRANSACTIONS = 6;
const WEEKLY_TOUCHES = 12;
const TOTAL_TRANSACTIONS = MIN_TRANSACTIONS + WEEKLY_TOUCHES;
const DROP_SHARES = [0.035, 0.07, 0.14];
const DEPOSIT_TIERS = [1000, 3100, 10000];
const IMPLIES_MAX = 1_500_000_000;
const TVL_MULT_CAP = 4;

const NAMED_SETASIDE = new Set([
  'CEX',
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
]);

const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;
const WRAPPED_STAKED = /\b(wrapped|staked|staking)\b/i;

// Gas per transaction by chain (cheapest the protocol touches wins)
const GAS_MAP: Record<string, number> = Object.fromEntries([
  ['Solana', 0.02],
  ['Base', 0.05],
  ['Arbitrum', 0.1],
  ['Optimism', 0.3],
  ['Polygon', 0.3],
  ['Ethereum', 3.0],
]);
const DEFAULT_GAS = 0.5; // conservative default for unmapped chains

// -------------------------------------------------------------------- helpers

const DAY_MS = 86_400_000;

function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Round to `d` decimal places (d=4 keeps 0.5223, not 0.5). */
function roundN(n: number, d: number): number {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}

/** Age in days; null when listed_at is absent. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** Age in years; null when listed_at is absent. */
function ageYears(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, (a - b) / (365.25 * DAY_MS));
}

function median(arr: number[]): number {
  const s = [...arr].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 !== 0 ? s[m]! : (s[m - 1]! + s[m]!) / 2;
}

/** Linear-interpolation percentile (numpy default) on a sorted array. */
function percentile(sorted: number[], q: number): number {
  const n = sorted.length;
  if (n === 0) return 0;
  if (n === 1) return sorted[0]!;
  const i = q * (n - 1);
  const lo = Math.floor(i);
  const hi = Math.min(lo + 1, n - 1);
  return sorted[lo]! + (sorted[hi]! - sorted[lo]!) * (i - lo);
}

// -------------------------------------------------------------------- classification

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Return set-aside reason, or null if the protocol is a candidate. */
function setAsideReason(p: SnapshotProtocol): string | null {
  const cat = p.category;
  if (cat && NAMED_SETASIDE.has(cat)) return 'category:' + cat;
  if (VERSIONED.test(p.name)) return 'versioned';
  if (WRAPPED_STAKED.test(p.name)) return 'wrapped/staked';
  return null;
}

// -------------------------------------------------------------------- size curve

/** OLS of log(mcap) on log(tvl). Returns { intercept, exponent, n }. */
function fitSizeCurve(comparables: SnapshotProtocol[]): { a: number; b: number; n: number } {
  const xs: number[] = [];
  const ys: number[] = [];
  for (const p of comparables) {
    const tvl = p.tvl_usd;
    const mcap = p.mcap_usd;
    if (tvl && tvl > 0 && mcap && mcap > 0) {
      xs.push(Math.log(tvl));
      ys.push(Math.log(mcap));
    }
  }
  const n = xs.length;
  const mx = xs.reduce((s, v) => s + v, 0) / n;
  const my = ys.reduce((s, v) => s + v, 0) / n;
  let sxx = 0, sxy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i]! - mx;
    sxx += dx * dx;
    sxy += dx * (ys[i]! - my);
  }
  const b = sxy / sxx;
  const a = my - b * mx;
  return { a, b, n };
}

/** Predicted mcap from TVL using the size curve. */
function sizeCurve(tvl: number, a: number, b: number): number {
  return Math.exp(a + b * Math.log(tvl));
}

/** Median absolute percentage error of the curve vs actual. */
function curveAPE(comparables: SnapshotProtocol[], a: number, b: number): number {
  const errs: number[] = [];
  for (const p of comparables) {
    const tvl = p.tvl_usd;
    const mcap = p.mcap_usd;
    if (tvl && tvl > 0 && mcap && mcap > 0) {
      const pred = sizeCurve(tvl, a, b);
      errs.push(Math.abs(pred / mcap - 1));
    }
  }
  return median(errs);
}

/** Naive flat-multiple baseline APE. */
function flatAPE(comparables: SnapshotProtocol[]): number {
  const ratios: number[] = [];
  for (const p of comparables) {
    const tvl = p.tvl_usd;
    const mcap = p.mcap_usd;
    if (tvl && tvl > 0 && mcap && mcap > 0) ratios.push(mcap / tvl);
  }
  const fm = median(ratios);
  const errs: number[] = [];
  for (const p of comparables) {
    const tvl = p.tvl_usd;
    const mcap = p.mcap_usd;
    if (tvl && tvl > 0 && mcap && mcap > 0) errs.push(Math.abs(mcap / fm / tvl - 1));
  }
  return median(errs);
}

// -------------------------------------------------------------------- category premium

/**
 * Category premium with shrinkage: median log-residual of the category's
 * comparables, shrunk toward 0 for thin categories.
 * w = n/(n+5).  Premium = exp(w * median_residual).
 * Fall back to global premium when n < 5.
 */
function computePremiums(
  comparables: SnapshotProtocol[],
  a: number,
  b: number,
): { premiums: Map<string, { value: number; n: number }>; global: number } {
  // Global median residual
  const allRes: number[] = [];
  const catRes: Map<string, number[]> = new Map();

  for (const p of comparables) {
    const tvl = p.tvl_usd;
    const mcap = p.mcap_usd;
    if (tvl && tvl > 0 && mcap && mcap > 0) {
      const r = Math.log(mcap) - (a + b * Math.log(tvl));
      allRes.push(r);
      const cat = p.category ?? 'Unknown';
      if (!catRes.has(cat)) catRes.set(cat, []);
      catRes.get(cat)!.push(r);
    }
  }

  const globalRes = median(allRes);
  const global = Math.exp(globalRes);

  const premiums = new Map<string, { value: number; n: number }>();
  for (const [cat, residuals] of catRes) {
    const n = residuals.length;
    if (n < 5) {
      premiums.set(cat, { value: global, n });
      continue;
    }
    const med = median(residuals);
    const w = n / (n + 5);
    const premium = Math.exp(w * med);
    premiums.set(cat, { value: premium, n });
  }
  return { premiums, global };
}

// -------------------------------------------------------------------- growth

/** forward_tvl = tvl * (1 + clamp(change_7d, -20, +20) / 100). */
function forwardTVL(tvl: number, change7d: number | null): number {
  const raw = finite(change7d, 0);
  const growth = clamp(raw, -20, 20);
  return tvl * (1 + growth / 100);
}

// -------------------------------------------------------------------- maturity

/**
 * maturity = 0.85 + 0.15 * min(age_years, 3) / 3
 * null listed_at -> 1.0 (treat as fully mature, "not tracked")
 */
function maturityFactor(asOf: string, listedAt: string | null): number {
  const ageY = ageYears(asOf, listedAt);
  if (ageY === null) return 1.0;
  return 0.85 + 0.15 * Math.min(ageY, 3) / 3;
}

// -------------------------------------------------------------------- launch odds

/**
 * Hazard model: lambda = (# protocols with token) / (sum of years tracked)
 * per category, shrunk toward global lambda for thin categories.
 * odds = 1 - exp(-lambda * horizon)
 */
function computeLaunchOdds(
  protocols: SnapshotProtocol[],
  asOf: string,
): {
  global: number;
  hazards: Map<string, { lambda: number; peers: number; years: number }>;
} {
  const allProtos: SnapshotProtocol[] = [];
  const catProtos: Map<string, SnapshotProtocol[]> = new Map();

  for (const p of protocols) {
    const hasToken = p.gecko_id !== null || p.symbol !== null;
    if (hasToken) {
      allProtos.push(p);
      const cat = p.category ?? 'Unknown';
      if (!catProtos.has(cat)) catProtos.set(cat, []);
      catProtos.get(cat)!.push(p);
    }
  }

  function yearsTracked(protos: SnapshotProtocol[]): number {
    let total = 0;
    for (const p of protos) {
      const y = ageYears(asOf, p.listed_at);
      if (y !== null) total += y;
    }
    return total;
  }

  const totalYears = yearsTracked(allProtos);
  const globalLambda = totalYears > 0 ? allProtos.length / totalYears : 0.05;

  const hazards = new Map<string, { lambda: number; peers: number; years: number }>();
  for (const [cat, protos] of catProtos) {
    const catYears = yearsTracked(protos);
    const catLambda = catYears > 0 ? protos.length / catYears : globalLambda;
    hazards.set(cat, {
      lambda: catLambda,
      peers: protos.length,
      years: catYears,
    });
  }
  return { global: globalLambda, hazards };
}

/**
 * Compute launch odds for a protocol, blending thin-category hazards
 * toward global lambda.
 */
function launchOdds(
  category: string | null,
  hazards: Map<string, { lambda: number; peers: number; years: number }>,
  globalLambda: number,
): { odds: number; lambda: number; peers: number; yearsToLaunch: number } {
  const cat = category ?? 'Unknown';
  const h = hazards.get(cat);
  let lambda: number;
  let peers: number;
  if (h) {
    const n = h.peers;
    // Shrink in log space: w = n/(n+5)
    const w = n / (n + 5);
    const logLambda = w * Math.log(h.lambda) + (1 - w) * Math.log(globalLambda);
    lambda = Math.exp(logLambda);
    peers = n;
  } else {
    // No peers in category: use global
    lambda = globalLambda;
    peers = 0;
  }
  const odds = clamp(1 - Math.exp(-lambda * HORIZON_YEARS), 0.02, 0.92);
  const yearsToLaunch = lambda > 0 ? 1 / lambda : 999;
  return { odds, lambda, peers, yearsToLaunch };
}

// -------------------------------------------------------------------- range

/** Compute range quantiles from the residuals of the size curve. */
function computeRangeQuantiles(comparables: SnapshotProtocol[], a: number, b: number): number[] {
  const residuals: number[] = [];
  for (const p of comparables) {
    const tvl = p.tvl_usd;
    const mcap = p.mcap_usd;
    if (tvl && tvl > 0 && mcap && mcap > 0) {
      residuals.push(Math.log(mcap) - (a + b * Math.log(tvl)));
    }
  }
  residuals.sort((a, b) => a - b);
  return residuals;
}

/** Low/high bounds: implied * exp(quantile(residuals, q)). */
function rangeBounds(implied: number, sortedRes: number[], qLo: number, qHi: number): { lo: number; hi: number } {
  return {
    lo: implied * Math.exp(percentile(sortedRes, qLo)),
    hi: implied * Math.exp(percentile(sortedRes, qHi)),
  };
}

// -------------------------------------------------------------------- OOS check

/**
 * Hold out every 4th comparable ordered by slug.  Refit on the rest.
 * Return curve and flat APE on the held-out set, plus range coverage.
 */
function outOfSample(
  comparables: SnapshotProtocol[],
): {
  trainA: number;
  trainB: number;
  curveMiss: number;
  flatMiss: number;
  ratio: number;
  p25Coverage: number;
  p90Coverage: number;
} {
  const sorted = [...comparables].sort((a, b) => (a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0));
  const train = sorted.filter((_, i) => i % OOS_STEP !== 0);
  const holdout = sorted.filter((_, i) => i % OOS_STEP === 0);

  const { a: trainA, b: trainB } = fitSizeCurve(train);

  // Curve APE on holdout
  const curveErrs: number[] = [];
  const flatRatios: number[] = [];
  for (const p of train) {
    const tvl = p.tvl_usd;
    const mcap = p.mcap_usd;
    if (tvl && tvl > 0 && mcap && mcap > 0) flatRatios.push(mcap / tvl);
  }
  const fm = median(flatRatios);

  for (const p of holdout) {
    const tvl = p.tvl_usd;
    const mcap = p.mcap_usd;
    if (tvl && tvl > 0 && mcap && mcap > 0) {
      curveErrs.push(Math.abs(sizeCurve(tvl, trainA, trainB) / mcap - 1));
    }
  }
  const flatErrs: number[] = [];
  for (const p of holdout) {
    const tvl = p.tvl_usd;
    const mcap = p.mcap_usd;
    if (tvl && tvl > 0 && mcap && mcap > 0) {
      flatErrs.push(Math.abs(mcap / fm / tvl - 1));
    }
  }

  const curveMiss = median(curveErrs);
  const flatMiss = median(flatErrs);
  const ratio = flatMiss > 0 ? curveMiss / flatMiss : 0;

  // Range coverage on holdout
  const sortedRes = computeRangeQuantiles(train, trainA, trainB);
  let inP25 = 0, inP90 = 0, total = 0;
  for (const p of holdout) {
    const tvl = p.tvl_usd;
    const mcap = p.mcap_usd;
    if (tvl && tvl > 0 && mcap && mcap > 0) {
      total++;
      const pred = sizeCurve(tvl, trainA, trainB);
      const { lo: lo25, hi: hi25 } = rangeBounds(pred, sortedRes, 0.25, 0.75);
      const { lo: lo10, hi: hi10 } = rangeBounds(pred, sortedRes, 0.1, 0.9);
      if (mcap >= lo25 && mcap <= hi25) inP25++;
      if (mcap >= lo10 && mcap <= hi10) inP90++;
    }
  }

  return {
    trainA,
    trainB,
    curveMiss,
    flatMiss,
    ratio,
    p25Coverage: total > 0 ? inP25 / total : 0,
    p90Coverage: total > 0 ? inP90 / total : 0,
  };
}

// -------------------------------------------------------------------- farm plan

function cheapestChain(chains: string[]): { name: string; gas: number } {
  let bestName = chains[0] ?? 'Unknown';
  let bestGas = DEFAULT_GAS;
  for (const c of chains) {
    const g = GAS_MAP[c] ?? DEFAULT_GAS;
    if (g < bestGas) {
      bestGas = g;
      bestName = c;
    }
  }
  return { name: bestName, gas: bestGas };
}

function computeFarm(
  tvl: number,
  implied: number,
  gas: number,
  deposit: number,
  dropShare: number,
): { share: number; airdrop: number; fees: number; netEv: number } {
  const share = deposit / (tvl + deposit);
  const airdrop = dropShare * implied * share;
  const fees = gas * TOTAL_TRANSACTIONS;
  const netEv = airdrop - fees;
  return { share, airdrop, fees, netEv };
}

function verdict(netEv: number, airdrop: number, fees: number): 'FARM' | 'MARGINAL' | 'SKIP' {
  if (netEv >= 5 && airdrop >= 2 * fees) return 'FARM';
  if (netEv > 0) return 'MARGINAL';
  return 'SKIP';
}

/**
 * Generate 3-12 farm steps derived from the protocol's own numbers.
 */
function generateFarmSteps(
  slug: string,
  name: string,
  chain: string,
  gas: number,
  tvl: number,
  implied: number,
  lambda: number,
  deposit: number,
  dropShare: number,
  v: 'FARM' | 'MARGINAL' | 'SKIP',
): string[] {
  const fees = gas * TOTAL_TRANSACTIONS;
  const share = deposit / (tvl + deposit);
  const airdrop = dropShare * implied * share;
  const netEv = airdrop - fees;
  const reviewDays = lambda > 0 ? Math.max(90, Math.round((1 / lambda) * 365.25 * 0.25)) : 90;
  const exitTvl = Math.round(tvl * 0.7);

  const steps: string[] = [];

  // Step 1: wallet setup
  steps.push(
    `Set up a dedicated burner wallet on ${chain} for ${name}. Fund it with at least $${deposit + Math.ceil(fees)} to cover the deposit and all gas. Cost: ~$${(gas > 1 ? gas : gas * 20).toFixed(0)} in initial gas. Time: 10 minutes.`
  );

  // Step 2: deposit
  const action = depositAction(name, chain, tvl);
  steps.push(
    `${action} Deposit $${deposit} USDC into the deepest pool or highest-liquidity position. Cost: $${deposit} locked + ~$${gas.toFixed(2)} gas. Time: 15 minutes.`
  );

  // Step 3: weekly touches
  steps.push(
    `Repeat one qualifying action weekly for 12 weeks: supply/borrow, swap, or provide liquidity. On ${chain}, each touch costs ~$${gas.toFixed(2)} gas. Cost: ~$${(gas * WEEKLY_TOUCHES).toFixed(2)} total gas over 12 weeks. Time: ~5 minutes per week.`
  );

  // Step 4: maintain position
  const holdDays = v === 'FARM' ? 90 : 60;
  steps.push(
    `Keep the position open for at least ${holdDays} days. The longer the position, the more snapshot rounds capture the activity. If TVL drops below $${exitTvl.toLocaleString()}, consider withdrawing to avoid rug risk. Cost: opportunity cost on $${deposit} deposit. Time: ${holdDays} days.`
  );

  // Step 5: review
  steps.push(
    `Review ${name} at ${reviewDays} days for any token announcement or points program launch. The estimated time to launch is ${(lambda > 0 ? Math.round(1 / lambda) : '?')?.toString()} years based on category peers. Cost: free research. Time: 30 minutes.`
  );

  // Step 6: exit
  steps.push(
    `Exit when: (a) ${name} announces its token launch or TGE date, (b) TVL falls below 70% of the snapshot value ($${exitTvl.toLocaleString()}), or (c) the protocol pauses deposits. Claim any rewards only from links on ${name}'s official channels. Cost: ~$${(gas * 3).toFixed(2)} for exit transactions. Time: 15 minutes.`
  );

  // Step 7: closing
  const riskStr = v === 'FARM'
    ? `At-risk amount: $${(fees).toFixed(2)} in gas. Expected airdrop share: ~$${airdrop.toFixed(2)} (net EV ~$${netEv.toFixed(2)}). This is a model estimate, not a guarantee.`
    : v === 'MARGINAL'
    ? `Net EV is positive but marginal ($${netEv.toFixed(2)}). At-risk: $${fees.toFixed(2)} in gas. Only proceed if the protocol has a strong track record.`
    : `Model estimates negative net EV ($${netEv.toFixed(2)}). The share is too thin relative to gas. Skip unless ${name} explicitly launches a points program.`;
  steps.push(riskStr);

  return steps;
}

function depositAction(name: string, chain: string, tvl: number): string {
  const tvlM = tvl / 1_000_000;
  if (tvlM >= 100) return `Connect your wallet to ${name} on ${chain}. The protocol has $${tvlM.toFixed(0)}M TVL and is pre-token.`;
  return `Connect your wallet to ${name} on ${chain}. TVL is $${tvlM.toFixed(1)}M, making this a high-share position relative to pool size.`;
}

// -------------------------------------------------------------------- nearest comparables

function nearestComparables(
  protocol: SnapshotProtocol,
  comparables: Comparable[],
): Comparable[] {
  return [...comparables]
    .sort((a, b) => Math.abs(a.tvl_usd - protocol.tvl_usd) - Math.abs(b.tvl_usd - protocol.tvl_usd))
    .slice(0, 3);
}

// -------------------------------------------------------------------- build

function parseDate(dateStr: string): Date {
  return new Date(dateStr);
}

function parseSnapshotFromObj(obj: Record<string, unknown>): Snapshot {
  if (typeof obj.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(obj.as_of)) {
    throw new SnapshotError('snapshot: missing or invalid as_of date');
  }
  if (typeof obj.source !== 'string') throw new SnapshotError('snapshot: missing source');
  if (typeof obj.floor_usd !== 'number' || !Number.isSafeInteger(obj.floor_usd) || obj.floor_usd <= 0) {
    throw new SnapshotError('snapshot: invalid floor_usd');
  }
  if (!Array.isArray(obj.protocols)) throw new SnapshotError('snapshot: missing protocols array');
  if (!Array.isArray(obj.watchlist) || obj.watchlist.some((s) => typeof s !== 'string')) {
    throw new SnapshotError('snapshot: missing watchlist');
  }

  const protocols = (obj.protocols as unknown[]).map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) {
      throw new SnapshotError(`protocol ${i}: not an object`);
    }
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`protocol ${i}: missing slug/name/tvl`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? (p.chains as string[]).filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });

  return {
    as_of: obj.as_of,
    source: obj.source,
    floor_usd: obj.floor_usd,
    protocols,
    watchlist: obj.watchlist as string[],
  };
}

export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot: not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) {
    throw new SnapshotError('snapshot: not a JSON object');
  }
  return parseSnapshotFromObj(raw as Record<string, unknown>);
}

export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const { protocols, as_of, floor_usd, watchlist } = snapshot;
  const watchSet = new Set(watchlist);

  // --- Classification ---
  const preToken = protocols.filter(isPreToken);
  const candidates: SnapshotProtocol[] = [];
  const setAside: SnapshotProtocol[] = [];
  const saBreakdown: Record<string, number> = {};

  for (const p of preToken) {
    const reason = setAsideReason(p);
    if (reason) {
      setAside.push(p);
      saBreakdown[reason] = (saBreakdown[reason] ?? 0) + 1;
    } else {
      candidates.push(p);
    }
  }

  // Token-bearing protocols
  const withToken = protocols.filter((p) => !isPreToken(p));
  const withCap = withToken.filter((p) => p.mcap_usd !== null);
  const withoutCap = withToken.filter((p) => p.mcap_usd === null);

  // --- Comparables (token + mcap > 0 + tvl > 0) ---
  const comparables = protocols.filter(
    (p) => p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0,
  );

  // --- Size curve ---
  const { a, b } = fitSizeCurve(comparables);
  const fullCurveAPE = curveAPE(comparables, a, b);
  const fullFlatAPE = flatAPE(comparables);

  // --- Category premiums ---
  const { premiums, global: globalPremium } = computePremiums(comparables, a, b);

  // --- Range quantiles ---
  const sortedRes = computeRangeQuantiles(comparables, a, b);

  // --- Launch odds ---
  const { global: globalLambda, hazards } = computeLaunchOdds(protocols, as_of);

  // --- OOS check ---
  const oos = outOfSample(comparables);

  // --- Score candidates ---
  type Scored = {
    p: SnapshotProtocol;
    implied: number;
    rawImplied: number;
    forwardTvl: number;
    curveOutput: number;
    catPremium: number;
    catPremiumN: number;
    mat: number;
    valIfLaunch: number;
    odds: number;
    lambda: number;
    peers: number;
    yearsToLaunch: number;
    low25: number;
    high75: number;
    low10: number;
    high90: number;
    ageDays: number | null;
    ageYears: number | null;
    status: 'watchlist' | 'off-list' | 'below-floor';
    growthPct: number;
    growthMult: number;
    matMult: number;
    clamped: boolean;
    clampReason: string | null;
    cheapestChain: string;
    gas: number;
  };

  const scored: Scored[] = [];

  for (const p of candidates) {
    const fwd = forwardTVL(p.tvl_usd, p.change_7d);
    const rawGrowth = finite(p.change_7d, 0);
    const growthPct = clamp(rawGrowth, -20, 20);
    const growthMult = 1 + growthPct / 100;
    const mat = maturityFactor(as_of, p.listed_at);
    const matMult = mat;
    const cat = p.category ?? 'Unknown';
    const premium = premiums.get(cat);
    const catPrem = premium ? premium.value : globalPremium;
    const catN = premium ? premium.n : 0;

    const curveOut = sizeCurve(fwd, a, b);
    const valIfLaunch = curveOut * catPrem * mat;

    const { odds, lambda, peers, yearsToLaunch } = launchOdds(cat, hazards, globalLambda);
    let rawImplied = valIfLaunch * odds;

    // Clamp
    let clamped = false;
    let clampReason: string | null = null;
    if (rawImplied > IMPLIES_MAX) {
      rawImplied = IMPLIES_MAX;
      clamped = true;
      clampReason = 'exceeded $1.5B cap';
    }
    const tvlMult = rawImplied / p.tvl_usd;
    if (tvlMult > TVL_MULT_CAP) {
      rawImplied = p.tvl_usd * TVL_MULT_CAP;
      clamped = true;
      clampReason = clampReason ? clampReason + '; exceeded 4x TVL' : 'exceeded 4x TVL';
    }

    const implied = Math.max(1, Math.round(rawImplied));

    const { lo: lo25, hi: hi25 } = rangeBounds(rawImplied, sortedRes, 0.25, 0.75);
    const { lo: lo10, hi: hi10 } = rangeBounds(rawImplied, sortedRes, 0.1, 0.9);

    const { name: chain, gas } = cheapestChain(p.chains);

    const status: 'watchlist' | 'off-list' | 'below-floor' =
      watchSet.has(p.slug)
        ? 'watchlist'
        : p.tvl_usd >= floor_usd
        ? 'off-list'
        : 'below-floor';

    scored.push({
      p,
      implied,
      rawImplied,
      forwardTvl: fwd,
      curveOutput: curveOut,
      catPremium: catPrem,
      catPremiumN: catN,
      mat,
      valIfLaunch,
      odds,
      lambda,
      peers,
      yearsToLaunch,
      low25: Math.round(lo25),
      high75: Math.round(hi25),
      low10: Math.round(lo10),
      high90: Math.round(hi10),
      ageDays: ageDays(as_of, p.listed_at),
      ageYears: ageYears(as_of, p.listed_at),
      status,
      growthPct,
      growthMult,
      matMult,
      clamped,
      clampReason,
      cheapestChain: chain,
      gas,
    });
  }

  // --- Sort by implied, then slug ---
  scored.sort((a, b) => {
    if (b.implied !== a.implied) return b.implied - a.implied;
    return a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0;
  });

  // --- Rank ---
  const board: BoardRow[] = [];
  const radarRows: RadarRow[] = [];

  const compList: Comparable[] = comparables.map((p) => ({
    slug: p.slug,
    name: p.name,
    category: p.category,
    tvl_usd: p.tvl_usd,
    mcap_usd: p.mcap_usd!,
    listed_at: p.listed_at,
  }));

  for (let i = 0; i < scored.length; i++) {
    const s = scored[i]!;
    const { share, airdrop, fees, netEv } = computeFarm(
      s.p.tvl_usd,
      s.rawImplied,
      s.gas,
      DEPOSIT_TIERS[0]!,
      DROP_SHARES[1]!,
    );
    const v = verdict(netEv, airdrop, fees);
    const steps = generateFarmSteps(
      s.p.slug,
      s.p.name,
      s.cheapestChain,
      s.gas,
      s.p.tvl_usd,
      s.rawImplied,
      s.lambda,
      DEPOSIT_TIERS[0]!,
      DROP_SHARES[1]!,
      v,
    );

    board.push({
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      gecko_id: s.p.gecko_id,
      symbol: s.p.symbol,
      token_status: 'pre-token',
      age_days: s.ageDays,
      implied_value_usd: s.implied,
      status: s.status,
      verdict: v,
      net_ev_usd: Math.round(netEv * 100) / 100,
      farm_steps: steps,
    });

    // Farm table: [deposit_tier][drop_share_tier]
    const farmTable: RadarRow['farm_table'] = [];
    for (const dep of DEPOSIT_TIERS) {
      const row: RadarRow['farm_table'][number] = [];
      for (const ds of DROP_SHARES) {
        const f = computeFarm(s.p.tvl_usd, s.rawImplied, s.gas, dep, ds);
        row.push({
          deposit: dep,
          drop_share: ds,
          share: roundN(f.share, 1e10),
          airdrop_usd: roundN(f.airdrop, 100),
          fees_usd: roundN(f.fees, 100),
          net_ev_usd: roundN(f.netEv, 100),
        });
      }
      farmTable.push(row);
    }

    radarRows.push({
      rank: i + 1,
      slug: s.p.slug,
      name: s.p.name,
      category: s.p.category,
      chains: s.p.chains,
      tvl_usd: s.p.tvl_usd,
      change_7d: s.p.change_7d,
      mcap_usd: s.p.mcap_usd,
      listed_at: s.p.listed_at,
      age_days: s.ageDays,
      age_years: s.ageYears,
      forward_tvl_usd: roundN(s.forwardTvl, 1),
      size_curve_usd: Math.round(s.curveOutput),
      category_premium: roundN(s.catPremium, 4),
      category_premium_n: s.catPremiumN,
      maturity: roundN(s.mat, 4),
      value_if_launch_usd: Math.round(s.valIfLaunch),
      launch_odds: roundN(s.odds, 4),
      launch_peers: s.peers,
      launch_lambda: roundN(s.lambda, 6),
      launch_years_to_launch: roundN(s.yearsToLaunch, 1),
      implied_value_usd: s.implied,
      implied_low_p25: s.low25,
      implied_high_p75: s.high75,
      implied_low_p10: s.low10,
      implied_high_p90: s.high90,
      status: s.status,
      verdict: v,
      net_ev_usd: Math.round(netEv * 100) / 100,
      gas_per_tx: s.gas,
      cheapest_chain: s.cheapestChain,
      nearest_comparables: nearestComparables(s.p, compList),
      farm_table: farmTable,
      model: {
        size_curve_intercept: roundN(a, 4),
        size_curve_exponent: roundN(b, 4),
        growth_pct: roundN(s.growthPct, 4),
        growth_multiplier: roundN(s.growthMult, 4),
        maturity_multiplier: roundN(s.matMult, 4),
        age_days: s.ageDays,
        clamped: s.clamped,
        clamp_reason: s.clampReason,
      },
      farm_steps: steps,
    });
  }

  // --- Live rows ---
  const live = protocols
    .filter((p) => !isPreToken(p))
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0))
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));

  // --- Counts ---
  const earlySize = scored.filter((s) => s.status === 'below-floor').length;
  const offListSize = scored.filter((s) => s.status === 'off-list').length;
  const watchSize = scored.filter((s) => s.status === 'watchlist').length;
  const farmCount = board.filter((r) => r.verdict === 'FARM').length;
  const marginalCount = board.filter((r) => r.verdict === 'MARGINAL').length;
  const skipCount = board.filter((r) => r.verdict === 'SKIP').length;
  const totalImplied = board.reduce((s, r) => s + r.implied_value_usd, 0);

  // --- Assert hard limits ---
  for (const s of scored) {
    const mult = s.rawImplied / s.p.tvl_usd;
    if (mult > TVL_MULT_CAP + 0.001) {
      throw new Error(`hard limit: ${s.p.slug} implied ${s.rawImplied} exceeds 4x TVL ${s.p.tvl_usd}`);
    }
    if (s.implied > IMPLIES_MAX) {
      throw new Error(`hard limit: ${s.p.slug} implied ${s.implied} exceeds $1.5B`);
    }
  }

  // --- Build setaside breakdown for display ---
  const saDisplay: Record<string, number> = {};
  for (const [key, cnt] of Object.entries(saBreakdown)) {
    const label = key.replace('category:', '');
    saDisplay[label] = cnt;
  }

  const radar: RadarData = {
    as_of,
    source: snapshot.source,
    floor_usd,
    model_version: MODEL_VERSION,
    total_protocols: protocols.length,
    candidates_count: candidates.length,
    setaside_count: setAside.length,
    setaside_breakdown: saDisplay,
    with_token_with_cap: withCap.length,
    with_token_no_cap: withoutCap.length,
    watchlist_size: watchlist.length,
    board_size: board.length,
    early_size: earlySize,
    off_list_size: offListSize,
    live_size: live.length,
    total_implied_value: totalImplied,
    farm_count: farmCount,
    marginal_count: marginalCount,
    skip_count: skipCount,
    oos_curve_miss: roundN(oos.curveMiss, 4),
    oos_flat_miss: roundN(oos.flatMiss, 4),
    oos_ratio: roundN(oos.ratio, 4),
    range_p25_coverage: roundN(oos.p25Coverage, 4),
    range_p90_coverage: roundN(oos.p90Coverage, 4),
    size_curve_intercept: roundN(a, 4),
    size_curve_exponent: roundN(b, 4),
    curve_ape: roundN(fullCurveAPE, 4),
    flat_ape: roundN(fullFlatAPE, 4),
    global_premium: roundN(globalPremium, 4),
    global_lambda: roundN(globalLambda, 6),
    range_p10: roundN(Math.exp(percentile(sortedRes, 0.1)), 4),
    range_p25: roundN(Math.exp(percentile(sortedRes, 0.25)), 4),
    range_p50: roundN(Math.exp(percentile(sortedRes, 0.5)), 4),
    range_p75: roundN(Math.exp(percentile(sortedRes, 0.75)), 4),
    range_p90: roundN(Math.exp(percentile(sortedRes, 0.9)), 4),
    rows: radarRows,
    live,
    comparables: compList,
  };

  return { board, radar };
}

// -------------------------------------------------------------------- validation

export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) {
    return `board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  }
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) {
    if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  }
  for (let i = 1; i < board.length; i++) {
    if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) {
      return `row ${i + 1} outranks row ${i} on implied value`;
    }
  }
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) {
      if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    }
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) {
      return `${r.slug} has implied value ${r.implied_value_usd}`;
    }
  }
  return null;
}

// -------------------------------------------------------------------- data.js

export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}