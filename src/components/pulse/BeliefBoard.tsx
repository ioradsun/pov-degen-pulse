import { Panel } from "@/components/pov/primitives/Panel";
import { formatEth, formatUsd, timeAgo, type Currency } from "@/lib/pov/format";
import type { BeliefRow } from "@/hooks/pov/useBeliefs";

interface BeliefBoardProps {
  beliefs: BeliefRow[];
  /** beliefId -> resolved human text, from useBeliefTexts. */
  beliefTexts: Map<string, string>;
  currency: Currency;
  ethUsd?: number;
}

function ConvictionBar({ buys, sells }: { buys: number; sells: number }) {
  const total = buys + sells;
  const pct = total ? (buys / total) * 100 : 50;
  return (
    <div className="flex items-center gap-2">
      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-[var(--down)]/40">
        <div className="h-full bg-[var(--up)]" style={{ width: `${pct}%` }} />
      </div>
      <span className="tabular-nums text-[10px] text-[var(--ink-dim)]">
        {buys}▲ {sells}▼
      </span>
    </div>
  );
}

export function BeliefBoard({ beliefs, beliefTexts, currency, ethUsd }: BeliefBoardProps) {
  const rows = [...beliefs]
    .sort((a, b) => (b.volumeWei > a.volumeWei ? 1 : b.volumeWei < a.volumeWei ? -1 : 0))
    .slice(0, 12);
  const showUsd = currency === "usd" && ethUsd;
  const meta = showUsd ? "ranked by USD in, last 24h" : "ranked by ETH in, last 24h";

  return (
    <Panel title="What people believe" meta={meta} bodyClassName="p-0">
      {rows.length === 0 ? (
        <div className="p-6 text-center text-xs text-[var(--ink-dim)]">
          No belief activity in the last 24h yet. New beliefs will appear here the moment they're
          created on-chain.
        </div>
      ) : (
        <ul className="divide-y divide-[var(--line-dim)]">
          {rows.map((b, i) => {
            const name = b.text ?? beliefTexts.get(b.id);
            return (
              <li
                key={b.id}
                className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2">
                    <span className="tabular-nums text-[10px] text-[var(--ink-faint)]">
                      {String(i + 1).padStart(2, "0")}
                    </span>
                    <span className="truncate text-[13px] text-[var(--ink)]">
                      {name ?? `Belief #${b.id}`}
                    </span>
                    {b.boostCount > 0 && (
                      <span
                        className="text-[10px] text-[var(--boost)]"
                        title={`${b.boostCount} DEGEN boosts`}
                      >
                        ⚡{b.boostCount}
                      </span>
                    )}
                  </div>
                  <div className="mt-1 flex items-center gap-3 pl-6">
                    <ConvictionBar buys={b.totalBuys} sells={b.totalSells} />
                    <span className="text-[10px] text-[var(--ink-faint)]">
                      {b.participants} wallet{b.participants === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
                <div className="flex items-baseline gap-3 pl-6 sm:pl-0">
                  <span className="tabular-nums text-[13px] text-[var(--pov)]">
                    {showUsd
                      ? formatUsd((Number(b.volumeWei) / 1e18) * (ethUsd as number), 0)
                      : `${formatEth(b.volumeWei, 3)} Ξ`}
                  </span>
                  <span className="tabular-nums text-[10px] text-[var(--ink-faint)]">
                    {b.lastEventAt ? timeAgo(b.lastEventAt * 1000) : "—"}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </Panel>
  );
}
