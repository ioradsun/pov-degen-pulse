/** Basic stats used by the correlations tab. */

export function mean(xs: number[]): number {
  if (!xs.length) return 0;
  let s = 0;
  for (const x of xs) s += x;
  return s / xs.length;
}

export function stddev(xs: number[], mu?: number): number {
  if (xs.length < 2) return 0;
  const m = mu ?? mean(xs);
  let s = 0;
  for (const x of xs) s += (x - m) ** 2;
  return Math.sqrt(s / (xs.length - 1));
}

export function pearson(xs: number[], ys: number[]): number {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return 0;
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let dx = 0;
  let dy = 0;
  for (let i = 0; i < n; i++) {
    const a = xs[i] - mx;
    const b = ys[i] - my;
    num += a * b;
    dx += a * a;
    dy += b * b;
  }
  const denom = Math.sqrt(dx * dy);
  return denom === 0 ? 0 : num / denom;
}

/**
 * Lagged cross-correlation. Positive lag k means `ys` LAGS `xs` by k hours
 * (i.e. xs[t] correlated with ys[t+k]) — POV activity leads DEGEN.
 * Negative lag means DEGEN leads POV.
 */
export function laggedXcorr(
  xs: number[],
  ys: number[],
  maxLag: number,
): Array<{ lag: number; r: number; n: number }> {
  const out: Array<{ lag: number; r: number; n: number }> = [];
  for (let k = -maxLag; k <= maxLag; k++) {
    const a: number[] = [];
    const b: number[] = [];
    for (let i = 0; i < xs.length; i++) {
      const j = i + k;
      if (j < 0 || j >= ys.length) continue;
      a.push(xs[i]);
      b.push(ys[j]);
    }
    out.push({ lag: k, r: pearson(a, b), n: a.length });
  }
  return out;
}

/** Simple OLS y = a + b*x. Returns slope, intercept, r². */
export function linreg(
  xs: number[],
  ys: number[],
): { slope: number; intercept: number; r2: number; n: number } {
  const n = Math.min(xs.length, ys.length);
  if (n < 3) return { slope: 0, intercept: 0, r2: 0, n };
  const mx = mean(xs.slice(0, n));
  const my = mean(ys.slice(0, n));
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (xs[i] - mx) * (ys[i] - my);
    den += (xs[i] - mx) ** 2;
  }
  const slope = den === 0 ? 0 : num / den;
  const intercept = my - slope * mx;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    const yh = intercept + slope * xs[i];
    ssRes += (ys[i] - yh) ** 2;
    ssTot += (ys[i] - my) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  return { slope, intercept, r2, n };
}

/** Log-returns from a price series. Output length = xs.length - 1. */
export function logReturns(xs: number[]): number[] {
  const out: number[] = [];
  for (let i = 1; i < xs.length; i++) {
    const p = xs[i - 1];
    const c = xs[i];
    if (p > 0 && c > 0) out.push(Math.log(c / p));
    else out.push(0);
  }
  return out;
}
