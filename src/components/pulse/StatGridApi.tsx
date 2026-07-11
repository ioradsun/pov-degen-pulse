import { clsx } from "clsx";
import { Metric } from "@/components/pov/primitives/Metric";
import { Panel } from "@/components/pov/primitives/Panel";
import { Skeleton } from "@/components/pov/primitives/Skeleton";
import { formatPct, formatUsd } from "@/lib/pov/format";
import { RANGES, RANGE_META, RANGE_TITLE, type Range } from "@/lib/pov/ranges";
import { useApiHeadline, useApiRetention } from "@/hooks/pov/useApiPulse";

/** % change vs. prev; null when there's nothing to compare against. */
function pctDelta(cur: number, prev: number | null | undefined): number | null {
  if (prev == null || prev === 0) return null;
  return ((cur - prev) / prev) * 100;
}

function Delta({ pct, rangeLabel }: { pct: number | null; rangeLabel: string }) {
  if (pct == null) return null;
  const cls =
    pct > 0 ? "text-[var(--up)]" : pct < 0 ? "text-[var(--down)]" : "text-[var(--ink-dim)]";
  return (
    <span className={clsx("tabular-nums", cls)} title={`vs previous ${rangeLabel}`}>
      {formatPct(pct, 0)}
    </span>
  );
}

interface StatGridApiProps {
  range: Range;
  onRangeChange: (range: Range) => void;
}

export function StatGridApi({ range, onRangeChange }: StatGridApiProps) {
  const { data, isLoading } = useApiHeadline(range);
  const { data: retention, isLoading: isLoadingRetention } = useApiRetention();
  const vol = Number(data?.buy_volume_usd ?? 0);
  const traders = Number(data?.active_traders ?? 0);
  const created = Number(data?.new_beliefs ?? 0);
  const creatorRev = Number(data?.creator_revenue_usd ?? 0);
  const degenAlloc = Number(data?.degen_allocation_usd ?? 0);
  const repeatRate = retention?.repeat_rate;
  const repeatWallets = retention?.repeat_wallets ?? 0;
  const newWallets = retention?.new_wallets ?? 0;
  const rangeLabel = RANGE_META[range];

  const volDelta = pctDelta(vol, data?.buy_volume_usd_prev);
  const tradersDelta = pctDelta(traders, data?.active_traders_prev);
  const createdDelta = pctDelta(created, data?.new_beliefs_prev);
  const creatorRevDelta = pctDelta(creatorRev, data?.creator_revenue_usd_prev);
  const degenAllocDelta = pctDelta(degenAlloc, data?.degen_allocation_usd_prev);

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
      title={RANGE_TITLE[range]}
      meta={isLoading ? "loading…" : undefined}
      action={action}
      bodyClassName="p-0"
    >
      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line-dim)] sm:grid-cols-3 lg:grid-cols-6">
        <Metric
          label="Buy volume"
          value={
            isLoading ? (
              <Skeleton className="h-6 w-20" />
            ) : (
              <span className="text-[var(--pov)]">{formatUsd(vol, 0)}</span>
            )
          }
          delta={<Delta pct={volDelta} rangeLabel={rangeLabel} />}
          sub="all buys · USD"
        />

        <Metric
          label="New beliefs"
          value={isLoading ? <Skeleton className="h-6 w-12" /> : created}
          delta={<Delta pct={createdDelta} rangeLabel={rangeLabel} />}
          sub="markets created"
        />

        <Metric
          label="Active traders"
          value={
            isLoading ? (
              <Skeleton className="h-6 w-14" />
            ) : (
              <span className="text-[var(--up)]">{traders}</span>
            )
          }
          delta={<Delta pct={tradersDelta} rangeLabel={rangeLabel} />}
          sub="unique wallets"
        />

        <Metric
          label="Creator revenue"
          value={isLoading ? <Skeleton className="h-6 w-20" /> : formatUsd(creatorRev, 0)}
          sub={
            <span className="flex items-center gap-1.5">
              <span>3.33% of buy volume</span>
              <Delta pct={creatorRevDelta} rangeLabel={rangeLabel} />
            </span>
          }
        />
        <Metric
          label="DEGEN allocation"
          value={
            isLoading ? (
              <Skeleton className="h-6 w-20" />
            ) : (
              <span className="text-[var(--boost)]">{formatUsd(degenAlloc, 0)}</span>
            )
          }
          sub={
            <span className="flex items-center gap-1.5">
              <span>5% of buy volume</span>
              <Delta pct={degenAllocDelta} rangeLabel={rangeLabel} />
            </span>
          }
        />
        <Metric
          label="Repeat traders"
          value={
            isLoadingRetention ? (
              <Skeleton className="h-6 w-14" />
            ) : (
              <span className="text-[var(--pov)]">
                {repeatRate == null ? "—" : `${Math.round(repeatRate * 100)}%`}
              </span>
            )
          }
          sub={
            isLoadingRetention
              ? "loading wallet history…"
              : newWallets > 0
                ? `${repeatWallets} of ${newWallets} new wallets returned`
                : "Not enough wallet history yet"
          }
        />
      </div>
    </Panel>
  );
}
