import { useMemo } from "react";
import { Panel } from "@/components/pov/primitives/Panel";
import { Skeleton } from "@/components/pov/primitives/Skeleton";
import { PriceDelta } from "@/components/pov/primitives/PriceDelta";
import { formatUsd, shortAddr, timeAgo } from "@/lib/pov/format";
import { RANGES, RANGE_META, type Range } from "@/lib/pov/ranges";
import {
  useApiGrid,
  useApiPnlByBelief,
  useApiBeliefPriceDeltas,
  type GridRow,
} from "@/hooks/pov/useApiPulse";


const POV_MARKET_URL = (slug: string) => `https://pov.co/markets/${slug}`;
const POV_PROFILE_URL = (walletAddress: string) => `https://pov.co/${walletAddress}`;

function BeliefTitle({ belief }: { belief: GridRow }) {
  const label = belief.title ?? `Belief #${belief.belief_id}`;
  // pov.co has no /markets/{numericId} route — only /markets/{slug} — so
  // without a resolved slug there's nowhere real to link to yet.
  if (!belief.slug) {
    return (
      <span className="truncate text-[13px] text-[var(--ink)]" title={belief.title ?? undefined}>
        {label}
      </span>
    );
  }
  return (
    <a
      href={POV_MARKET_URL(belief.slug)}
      target="_blank"
      rel="noreferrer"
      className="truncate text-[13px] text-[var(--ink)] hover:text-[var(--pov)] hover:underline"
      title={belief.title ?? undefined}
    >
      {label}
    </a>
  );
}


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
  const { data: pnlData } = useApiPnlByBelief(range, 500);
  const rows = data?.rows ?? [];
  const rangeLabel = RANGES.find((r) => r.key === range)?.label ?? range;

  const pnlByBelief = useMemo(() => {
    const m = new Map<number, { realized: number; exits: number }>();
    for (const r of pnlData?.rows ?? []) {
      m.set(r.belief_id, {
        realized: Number(r.realized_usd),
        exits: Number(r.exits),
      });
    }
    return m;
  }, [pnlData]);

  return (
    <Panel
      title="What people believe"
      meta={`ranked by buy volume · ${rangeLabel}`}
      bodyClassName="p-0"
    >
      {rows.length === 0 ? (
        isLoading ? (
          <ul className="divide-y divide-[var(--line-dim)]">
            {Array.from({ length: 6 }).map((_, i) => (
              <li key={i} className="flex items-center justify-between gap-3 px-4 py-3">
                <div className="flex min-w-0 flex-1 flex-col gap-2">
                  <Skeleton className="h-3 w-2/3" />
                  <Skeleton className="h-2 w-1/3" />
                </div>
                <Skeleton className="h-3 w-16" />
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-6 text-center text-xs text-[var(--ink-dim)]">
            No belief activity in this timeframe yet.
          </div>
        )
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
                  <BeliefTitle belief={b} />
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
                <div className="mt-1 pl-6 text-[10px] text-[var(--ink-faint)]">
                  by{" "}
                  {b.creator_address ? (
                    <a
                      href={POV_PROFILE_URL(b.creator_address)}
                      target="_blank"
                      rel="noreferrer"
                      className="text-[var(--ink-dim)] hover:text-[var(--pov)]"
                    >
                      {b.creator_display_name || shortAddr(b.creator_address)}
                    </a>
                  ) : (
                    "unknown"
                  )}
                </div>
              </div>
              <div className="flex items-baseline gap-3 pl-6 sm:pl-0">
                <div className="flex flex-col items-end">
                  <span className="tabular-nums text-[13px] text-[var(--pov)]">
                    {formatUsd(Number(b.buy_volume_usd ?? 0), 0)}
                  </span>
                  <span className="tabular-nums text-[9px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
                    MC {formatUsd(Number(b.market_cap_usd ?? 0), 0)}
                  </span>
                  {(() => {
                    const p = pnlByBelief.get(b.belief_id);
                    if (!p || p.exits === 0) {
                      return (
                        <span className="tabular-nums text-[9px] uppercase tracking-[0.14em] text-[var(--ink-faint)]">
                          no exits
                        </span>
                      );
                    }
                    const cls =
                      p.realized > 0
                        ? "text-[var(--up)]"
                        : p.realized < 0
                          ? "text-[var(--down)]"
                          : "text-[var(--ink-dim)]";
                    const sign = p.realized < 0 ? "−" : "";
                    return (
                      <span
                        className={`tabular-nums text-[9px] uppercase tracking-[0.14em] ${cls}`}
                        title={`${p.exits} exit${p.exits === 1 ? "" : "s"}`}
                      >
                        P&L {sign}
                        {formatUsd(Math.abs(p.realized), 0)}
                      </span>
                    );
                  })()}
                </div>

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
