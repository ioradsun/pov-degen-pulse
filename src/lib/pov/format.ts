export function hexToInt(hex: string | null | undefined): number {
  if (!hex) return 0;
  return Number.parseInt(hex, 16);
}

export function hexToBigInt(hex: string | null | undefined): bigint {
  if (!hex) return 0n;
  try {
    return BigInt(hex);
  } catch {
    return 0n;
  }
}

export function shortAddr(a: string | undefined | null, size = 4): string {
  if (!a) return "";
  return `${a.slice(0, 2 + size)}…${a.slice(-size)}`;
}

export function formatEth(wei: bigint | number, digits = 4): string {
  const n = typeof wei === "bigint" ? Number(wei) / 1e18 : wei / 1e18;
  if (!Number.isFinite(n)) return "0";
  if (n === 0) return "0";
  if (Math.abs(n) < 0.0001) return n.toExponential(2);
  return n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

export function formatUsd(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "$0";
  if (Math.abs(n) >= 1_000_000_000)
    return `$${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1_000_000) return `$${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 10_000) return `$${(n / 1e3).toFixed(1)}K`;
  return `$${n.toLocaleString(undefined, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  })}`;
}

export function formatCompact(n: number): string {
  if (!Number.isFinite(n)) return "0";
  if (Math.abs(n) >= 1e9) return `${(n / 1e9).toFixed(2)}B`;
  if (Math.abs(n) >= 1e6) return `${(n / 1e6).toFixed(2)}M`;
  if (Math.abs(n) >= 1e3) return `${(n / 1e3).toFixed(1)}K`;
  return n.toLocaleString();
}

export function formatPct(n: number, digits = 2): string {
  if (!Number.isFinite(n)) return "0.00%";
  const sign = n > 0 ? "+" : "";
  return `${sign}${n.toFixed(digits)}%`;
}

export function timeAgo(ts: number): string {
  const s = Math.max(0, Math.floor((Date.now() - ts) / 1000));
  if (s < 60) return `${s}s`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h`;
  return `${Math.floor(h / 24)}d`;
}
