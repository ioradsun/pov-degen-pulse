import { clsx } from "clsx";
import type { ReactNode } from "react";

interface MetricProps {
  label: string;
  value: ReactNode;
  sub?: ReactNode;
  trend?: number; // signed number for color
  className?: string;
  children?: ReactNode;
}

export function Metric({ label, value, sub, trend, className, children }: MetricProps) {
  const trendCls =
    trend == null
      ? "text-[var(--ink-dim)]"
      : trend > 0
        ? "text-[var(--up)]"
        : trend < 0
          ? "text-[var(--down)]"
          : "text-[var(--ink-dim)]";
  return (
    <div className={clsx("flex flex-col gap-1 p-4", className)}>
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
        {label}
      </div>
      <div className="text-[24px] leading-none tabular-nums text-[var(--ink)]">
        {value}
      </div>
      {sub != null && (
        <div className={clsx("text-[11px] tabular-nums", trendCls)}>{sub}</div>
      )}
      {children}
    </div>
  );
}

