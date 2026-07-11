import { clsx } from "clsx";
import type { ReactNode } from "react";

interface MetricProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  trend?: number; // signed number for color
  delta?: ReactNode;
  streak?: ReactNode; // optional streak indicator, rendered at the bottom
  className?: string;
}

export function Metric({ label, value, sub, trend, delta, streak, className }: MetricProps) {
  const trendCls =
    trend == null
      ? "text-[var(--ink-dim)]"
      : trend > 0
        ? "text-[var(--up)]"
        : trend < 0
          ? "text-[var(--down)]"
          : "text-[var(--ink-dim)]";
  return (
    <div className={clsx("flex flex-col justify-between p-4", className)}>
      <div className="flex items-center justify-between gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
        <span>{label}</span>
        {delta != null && <span>{delta}</span>}
      </div>
      <div className="text-[24px] leading-none tabular-nums text-[var(--ink)]">
        {value}
      </div>
      {sub != null && (
        <div className={clsx("text-[11px] tabular-nums", trendCls)}>{sub}</div>
      )}
      {streak != null && streak}
    </div>
  );
}


