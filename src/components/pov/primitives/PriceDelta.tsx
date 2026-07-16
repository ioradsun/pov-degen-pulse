import { clsx } from "clsx";

export interface PriceDeltaData {
  yes_pct: number | null;
  yes_start: number | null;
  yes_end: number | null;
  yes_trades: number;
  no_pct: number | null;
  no_start: number | null;
  no_end: number | null;
  no_trades: number;
}

interface PriceDeltaProps {
  data: PriceDeltaData | undefined | null;
  /** "stack" = two rows (Y/N). "inline" = single row `Y +x% · N -y%`. */
  layout?: "stack" | "inline";
  className?: string;
  /** Label shown in the hover tooltip, e.g. "24h". */
  windowLabel?: string;
}

function fmtPct(n: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  if (Math.abs(n) < 0.05) return "0.0%";
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return `${sign}${Math.abs(n).toFixed(Math.abs(n) >= 100 ? 0 : 1)}%`;
}

function fmtPrice(n: number | null): string {
  if (n == null || !Number.isFinite(n) || n <= 0) return "—";
  if (n >= 1) return `$${n.toFixed(2)}`;
  if (n >= 0.01) return `$${n.toFixed(4)}`;
  return `$${n.toExponential(2)}`;
}

function cls(pct: number | null): string {
  if (pct == null || !Number.isFinite(pct)) return "text-[var(--ink-faint)]";
  if (pct > 0.05) return "text-[var(--up)]";
  if (pct < -0.05) return "text-[var(--down)]";
  return "text-[var(--ink-dim)]";
}

export function PriceDelta({
  data,
  layout = "stack",
  className,
  windowLabel,
}: PriceDeltaProps) {
  const title =
    data == null
      ? "No trades yet"
      : [
          windowLabel ? `Share price change · ${windowLabel}` : "Share price change",
          `YES ${fmtPrice(data.yes_start)} → ${fmtPrice(data.yes_end)} (${data.yes_trades} trades)`,
          `NO  ${fmtPrice(data.no_start)} → ${fmtPrice(data.no_end)} (${data.no_trades} trades)`,
        ].join("\n");

  const yPct = data?.yes_pct ?? null;
  const nPct = data?.no_pct ?? null;

  if (layout === "inline") {
    return (
      <span
        title={title}
        className={clsx(
          "inline-flex items-center gap-1.5 whitespace-nowrap tabular-nums text-[10px]",
          className,
        )}
      >
        <span className={cls(yPct)}>
          <span className="mr-0.5 text-[var(--ink-faint)]">Y</span>
          {fmtPct(yPct)}
        </span>
        <span className="text-[var(--ink-faint)]">·</span>
        <span className={cls(nPct)}>
          <span className="mr-0.5 text-[var(--ink-faint)]">N</span>
          {fmtPct(nPct)}
        </span>
      </span>
    );
  }

  return (
    <span
      title={title}
      className={clsx(
        "inline-flex flex-col items-start gap-[1px] leading-tight tabular-nums text-[10px]",
        className,
      )}
    >
      <span className={cls(yPct)}>
        <span className="mr-1 text-[var(--ink-faint)]">Y</span>
        {fmtPct(yPct)}
      </span>
      <span className={cls(nPct)}>
        <span className="mr-1 text-[var(--ink-faint)]">N</span>
        {fmtPct(nPct)}
      </span>
    </span>
  );
}
