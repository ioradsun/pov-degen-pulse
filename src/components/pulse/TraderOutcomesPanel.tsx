import { useState } from "react";
import { clsx } from "clsx";
import { Panel } from "@/components/pov/primitives/Panel";
import { Skeleton } from "@/components/pov/primitives/Skeleton";
import { formatUsd, formatPct } from "@/lib/pov/format";
import { RANGES, type Range } from "@/lib/pov/ranges";
import { useApiPnlOutcomes } from "@/hooks/pov/useApiPulse";

function formatHold(seconds: number | null | undefined): string {
  if (seconds == null || !Number.isFinite(seconds)) return "—";
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = seconds / 60;
  if (m < 60) return `${Math.round(m)}m`;
  const h = m / 60;
  if (h < 24) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

function signedUsd(n: number): { text: string; cls: string } {
  if (!Number.isFinite(n)) return { text: "—", cls: "text-[var(--ink-dim)]" };
  const cls =
    n > 0 ? "text-[var(--up)]" : n < 0 ? "text-[var(--down)]" : "text-[var(--ink)]";
  const text = (n < 0 ? "−" : "") + formatUsd(Math.abs(n), 0);
  return { text, cls };
}

function Stat({
  label,
  value,
  valueCls,
  sub,
  loading,
}: {
  label: string;
  value: string;
  valueCls?: string;
  sub?: string;
  loading?: boolean;
}) {
  return (
    <div className="flex flex-col justify-between gap-2 p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
        {label}
      </div>
      <div className={clsx("text-[22px] leading-none tabular-nums", valueCls ?? "text-[var(--ink)]")}>
        {loading ? <Skeleton className="h-6 w-24" /> : value}
      </div>
      {sub != null && (
        <div className="text-[11px] tabular-nums text-[var(--ink-dim)]">{sub}</div>
      )}
    </div>
  );
}

interface Props {
  range: Range;
  onRangeChange: (range: Range) => void;
}

export function TraderOutcomesPanel({ range, onRangeChange }: Props) {
  const { data, isLoading } = useApiPnlOutcomes(range);
  // FIFO-cost coverage summary — median hold time uses full exits only.
  const [showAbout, setShowAbout] = useState(false);

  const realized = Number(data?.realized_usd ?? 0);
  const realizedFmt = signedUsd(realized);
  const rate = data?.profitable_exit_rate;
  const avgRet = data?.avg_return;
  const median = data?.median_hold_seconds;
  const totalSells = Number(data?.total_sells ?? 0);
  const profitable = Number(data?.profitable_sells ?? 0);
  const fullExits = Number(data?.full_exits ?? 0);

  const avgRetCls =
    avgRet == null
      ? "text-[var(--ink-dim)]"
      : avgRet > 0
        ? "text-[var(--up)]"
        : avgRet < 0
          ? "text-[var(--down)]"
          : "text-[var(--ink)]";

  const rateCls =
    rate == null
      ? "text-[var(--ink-dim)]"
      : rate >= 0.5
        ? "text-[var(--up)]"
        : rate >= 0.3
          ? "text-[var(--ink)]"
          : "text-[var(--down)]";

  const action = (
    <div role="tablist" aria-label="Timeframe" className="flex items-center gap-1">
      {RANGES.map((r) => (
        <button
          key={r.key}
          role="tab"
          aria-selected={range === r.key}
          onClick={() => onRangeChange(r.key)}
          className={clsx(
            "rounded-sm border px-2 py-0.5 text-[10px] uppercase tracking-[0.16em] transition-colors",
            range === r.key
              ? "border-[var(--pov)]/60 bg-[var(--pov)]/10 text-[var(--pov)]"
              : "border-[var(--line)] text-[var(--ink-dim)] hover:text-[var(--ink)]",
          )}
        >
          {r.label}
        </button>
      ))}
    </div>
  );

  return (
    <Panel
      title="Trader outcomes"
      meta="FIFO realized P&L · fees excluded"
      action={action}
      bodyClassName="p-0"
    >
      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line-dim)] sm:grid-cols-4">
        <Stat
          label="Realized profit"
          value={realizedFmt.text}
          valueCls={realizedFmt.cls}
          sub={totalSells === 0 ? "no exits in window" : `${totalSells.toLocaleString()} sells`}
          loading={isLoading}
        />
        <Stat
          label="Profitable exits"
          value={rate == null ? "—" : `${Math.round(rate * 100)}%`}
          valueCls={rateCls}
          sub={
            totalSells === 0
              ? "—"
              : `${profitable.toLocaleString()} of ${totalSells.toLocaleString()} sells`
          }
          loading={isLoading}
        />
        <Stat
          label="Avg return"
          value={avgRet == null ? "—" : formatPct(avgRet * 100, 1)}
          valueCls={avgRetCls}
          sub="cost-weighted · gross of fees"
          loading={isLoading}
        />
        <Stat
          label="Median hold"
          value={formatHold(median)}
          sub={
            fullExits === 0
              ? "no fully-closed positions"
              : `${fullExits.toLocaleString()} full exit${fullExits === 1 ? "" : "s"}`
          }
          loading={isLoading}
        />
      </div>
      <div className="border-t border-[var(--line-dim)] px-4 py-2">
        <button
          type="button"
          onClick={() => setShowAbout((s) => !s)}
          className="text-[10px] uppercase tracking-[0.16em] text-[var(--ink-faint)] hover:text-[var(--ink-dim)]"
        >
          {showAbout ? "hide method" : "how this is computed"}
        </button>
        {showAbout && (
          <p className="mt-2 text-[11px] leading-relaxed text-[var(--ink-dim)]">
            Each sale is matched against the wallet's earlier buys on the same
            market and side using FIFO cost basis. Realized profit = sale
            proceeds − matched cost. Partial sales still count toward realized
            profit but only fully-closed positions contribute to median hold
            time. Protocol fees, referral fees, and gas are excluded from V1.
          </p>
        )}
      </div>
    </Panel>
  );
}
