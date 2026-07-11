import { clsx } from "clsx";
import { Metric } from "@/components/pov/primitives/Metric";
import { Panel } from "@/components/pov/primitives/Panel";
import { formatUsd } from "@/lib/pov/format";
import { RANGES, RANGE_TITLE, type Range } from "@/lib/pov/ranges";
import { useApiHeadline, useApiRetention } from "@/hooks/pov/useApiPulse";

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
          value={<span className="text-[var(--pov)]">{formatUsd(vol, 0)}</span>}
          sub="all buys · USD"
        />
        <Metric label="New beliefs" value={created} sub="markets created" />
        <Metric
          label="Active traders"
          value={<span className="text-[var(--up)]">{traders}</span>}
          sub="unique wallets"
        />
        <Metric
          label="Creator revenue"
          value={formatUsd(creatorRev, 0)}
          sub="3.33% of buy volume"
        />
        <Metric
          label="DEGEN allocation"
          value={<span className="text-[var(--boost)]">{formatUsd(degenAlloc, 0)}</span>}
          sub="5% of buy volume"
        />
        <Metric
          label="Repeat traders"
          value={
            <span className="text-[var(--pov)]">
              {isLoadingRetention || repeatRate == null ? "—" : `${Math.round(repeatRate * 100)}%`}
            </span>
          }
          sub={
            newWallets > 0
              ? `${repeatWallets} of ${newWallets} new wallets returned`
              : "Not enough wallet history yet"
          }
        />
      </div>
    </Panel>
  );
}
