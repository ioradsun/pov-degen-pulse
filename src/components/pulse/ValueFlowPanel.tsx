import { clsx } from "clsx";
import { Panel } from "@/components/pov/primitives/Panel";
import { Skeleton } from "@/components/pov/primitives/Skeleton";
import { formatUsd } from "@/lib/pov/format";
import type { Range } from "@/lib/pov/ranges";
import { useApiValueFlow } from "@/hooks/pov/useApiPulse";

/**
 * The positive lens that is also the true one: on POV, buy fees aren't a
 * cost that disappears — they ARE the product working. Every gross buy
 * splits ~90% into the curve backing the position, 5% into DEGEN buyback
 * & burn, 3.33% to the belief's creator, 1.67% to the AI-agent pool.
 */

function Flow({
  label,
  value,
  sub,
  accent,
  loading,
}: {
  label: string;
  value: string;
  sub: string;
  accent?: string;
  loading?: boolean;
}) {
  return (
    <div className="flex flex-col justify-between gap-2 p-4">
      <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">{label}</div>
      <div className={clsx("text-[22px] leading-none tabular-nums", accent ?? "text-[var(--ink)]")}>
        {loading ? <Skeleton className="h-6 w-24" /> : value}
      </div>
      <div className="text-[11px] leading-snug text-[var(--ink-dim)]">{sub}</div>
    </div>
  );
}

export function ValueFlowPanel({ range }: { range: Range }) {
  const { data, isLoading } = useApiValueFlow(range);

  const buys = Number(data?.buy_volume_usd ?? 0);
  const net = Number(data?.net_conviction_usd ?? 0);
  const burn = Number(data?.degen_burn_usd ?? 0);
  const creators = Number(data?.creator_earned_usd ?? 0);
  const holders = Number(data?.holders_never_sold ?? 0);
  const buyers = Number(data?.buyers ?? 0);
  const holderPct = buyers > 0 ? Math.round((holders / buyers) * 100) : null;

  return (
    <Panel title="Where the money goes" meta="every buy powers the flywheel" bodyClassName="p-0">
      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line-dim)] sm:grid-cols-4">
        <Flow
          label="Conviction deployed"
          value={formatUsd(buys, 0)}
          sub="gross value spent backing beliefs"
          accent="text-[var(--pov)]"
          loading={isLoading}
        />
        <Flow
          label="DEGEN buyback & burn"
          value={formatUsd(burn, 0)}
          sub="est. 5% of buys — structural $DEGEN demand"
          accent="text-[var(--degen)]"
          loading={isLoading}
        />
        <Flow
          label="Creators earned"
          value={formatUsd(creators, 0)}
          sub="est. 3.33% of buys paid to belief creators"
          loading={isLoading}
        />
        <Flow
          label="Still backing beliefs"
          value={holderPct == null ? formatUsd(Math.max(net, 0), 0) : `${holderPct}%`}
          sub={
            holderPct == null
              ? "net capital deployed in curves"
              : `of buyers haven't sold — ${formatUsd(Math.max(net, 0), 0)} net deployed`
          }
          accent="text-[var(--up)]"
          loading={isLoading}
        />
      </div>
      <p className="border-t border-[var(--line-dim)] px-4 py-2 text-[11px] leading-relaxed text-[var(--ink-dim)]">
        POV's 10% buy fee is the engine, not overhead: half of it buys and burns DEGEN, a third pays
        creators, the rest funds AI agents. Splits are protocol constants estimated from gross buy
        volume.
      </p>
    </Panel>
  );
}
