import { Panel } from "@/components/pov/primitives/Panel";
import { formatUsd, timeAgo } from "@/lib/pov/format";
import { RANGES, type Range } from "@/lib/pov/ranges";
import { useApiGrid } from "@/hooks/pov/useApiPulse";

function ConvictionBar({ splitPct }: { splitPct: number | null }) {
  const pct = splitPct != null ? Math.max(0, Math.min(1, splitPct)) * 100 : 50;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--down)]/40">
        <div className="h-full bg-[var(--up)]" style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums text-[10px] text-[var(--ink-dim)]">{Math.round(pct)}% YES</span>
    </div>
  );
}

interface BeliefBoardApiProps {
  range: Range;
}

export function BeliefBoardApi({ range }: BeliefBoardApiProps) {
  const { data, isLoading } = useApiGrid("volume", range, 12);
  const rows = data?.rows ?? [];
  const rangeLabel = RANGES.find((r) => r.key === range)?.label ?? range;

  return (
    <Panel
      title="What people believe"
      meta={`ranked by buy volume · ${rangeLabel}`}
      bodyClassName="p-0"
    >
      {rows.length === 0 ? (
        <div className="p-6 text-center text-xs text-[var(--ink-dim)]">
          {isLoading ? "Loading beliefs…" : "No belief activity in this timeframe yet."}
        </div>
      ) : (
        <ul className="divide-y divide-[var(--line-dim)]">
          {rows.map((b, i) => (
            <li
              key={b.belief_id}
              className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-baseline gap-2">
                  <span className="tabular-nums text-[10px] text-[var(--ink-faint)]">
                    {String(i + 1).padStart(2, "0")}
                  </span>
                  <span
                    className="truncate text-[13px] text-[var(--ink)]"
                    title={b.title ?? undefined}
                  >
                    {b.title ?? `Belief #${b.belief_id}`}
                  </span>
                  <span className="text-[9px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
                    {b.lifecycle_stage}
                  </span>
                </div>
                <div className="mt-1 flex items-center gap-3 pl-6">
                  <ConvictionBar splitPct={b.split_pct} />
                  <span className="text-[10px] text-[var(--ink-faint)]">
                    {b.unique_wallets_24h} wallet{b.unique_wallets_24h === 1 ? "" : "s"} (24h)
                  </span>
                </div>
              </div>
              <div className="flex items-baseline gap-3 pl-6 sm:pl-0">
                <span className="tabular-nums text-[13px] text-[var(--pov)]">
                  {formatUsd(Number(b.buy_volume_usd ?? 0), 0)}
                </span>
                <span className="tabular-nums text-[10px] text-[var(--ink-faint)]">
                  {timeAgo(new Date(b.created_at).getTime())}
                </span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}
