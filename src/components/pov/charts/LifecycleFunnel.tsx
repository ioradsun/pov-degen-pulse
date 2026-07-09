import { Panel } from "../primitives/Panel";
import type { BeliefRow } from "@/hooks/pov/useBeliefs";

export function LifecycleFunnel({ beliefs }: { beliefs: BeliefRow[] }) {
  const total = beliefs.length;
  const firstBuy = beliefs.filter((b) => b.totalBuys > 0).length;
  const tenBuys = beliefs.filter((b) => b.totalBuys >= 10).length;
  const boosted = beliefs.filter((b) => b.boostCount > 0).length;
  const now = Math.floor(Date.now() / 1000);
  const dead = beliefs.filter(
    (b) => !b.lastEventAt || now - b.lastEventAt > 24 * 3600,
  ).length;

  const rows: { label: string; count: number; color: string }[] = [
    { label: "Created", count: total, color: "var(--pov)" },
    { label: "First buy", count: firstBuy, color: "var(--up)" },
    { label: "≥ 10 buys", count: tenBuys, color: "var(--up)" },
    { label: "Boosted", count: boosted, color: "var(--boost)" },
    { label: "Idle > 24h", count: dead, color: "var(--down)" },
  ];
  const max = Math.max(1, ...rows.map((r) => r.count));

  return (
    <Panel title="Lifecycle funnel" meta="cumulative counts">
      <div className="flex flex-col gap-2">
        {rows.map((r) => {
          const pct = (r.count / max) * 100;
          return (
            <div key={r.label} className="flex items-center gap-3">
              <span className="w-24 text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
                {r.label}
              </span>
              <div className="relative h-5 flex-1 bg-[var(--surface-2)]">
                <div
                  className="h-full"
                  style={{
                    width: `${pct}%`,
                    backgroundColor: r.color,
                    opacity: 0.28,
                  }}
                />
                <div
                  className="absolute inset-y-0 left-0 border-l-2"
                  style={{ borderColor: r.color, width: `${pct}%` }}
                />
              </div>
              <span className="w-14 text-right text-[13px] tabular-nums text-[var(--ink)]">
                {r.count}
              </span>
            </div>
          );
        })}
      </div>
    </Panel>
  );
}
