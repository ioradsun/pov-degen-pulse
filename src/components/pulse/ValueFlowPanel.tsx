import { clsx } from "clsx";
import { Panel } from "@/components/pov/primitives/Panel";
import { Skeleton } from "@/components/pov/primitives/Skeleton";
import { formatEthAmount, formatUsd, type Currency } from "@/lib/pov/format";
import { RANGE_META, type Range } from "@/lib/pov/ranges";
import { useApiValueFlow } from "@/hooks/pov/useApiPulse";

/**
 * Every gross buy splits ~90% into the curve backing the position, 5% into
 * DEGEN buyback & burn, 3.33% to the belief's creator, 1.67% to the AI-agent
 * pool. Net flow (buys minus sells) is the one real health number here —
 * everything else is a protocol-constant estimate of gross buy volume.
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

export function ValueFlowPanel({ range, currency }: { range: Range; currency: Currency }) {
  const { data, isLoading } = useApiValueFlow(range);
  const fmt = (n: number) => (currency === "usd" ? formatUsd(n, 0) : formatEthAmount(n));

  const buys = Number((currency === "usd" ? data?.buy_volume_usd : data?.buy_volume_eth) ?? 0);
  const net = Number((currency === "usd" ? data?.net_conviction_usd : data?.net_conviction_eth) ?? 0);
  const burn = Number((currency === "usd" ? data?.degen_burn_usd : data?.degen_burn_eth) ?? 0);
  const creators = Number(
    (currency === "usd" ? data?.creator_earned_usd : data?.creator_earned_eth) ?? 0,
  );
  const holders = Number(data?.holders_never_sold ?? 0);
  const buyers = Number(data?.buyers ?? 0);
  const holderPct = buyers > 0 ? Math.round((holders / buyers) * 100) : null;

  const netCls =
    net > 0 ? "text-[var(--up)]" : net < 0 ? "text-[var(--down)]" : "text-[var(--ink)]";
  const netText = buys === 0 ? "—" : (net < 0 ? "−" : "") + fmt(Math.abs(net));

  return (
    <Panel
      title="Where the money goes"
      meta={`every buy powers the flywheel · ${RANGE_META[range]}`}
      bodyClassName="p-0"
    >
      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line-dim)] sm:grid-cols-4">
        <Flow
          label="Backing beliefs"
          value={holderPct == null ? "—" : `${holderPct}%`}
          sub="of buyers haven't sold — conviction still on the curve"
          accent="text-[var(--pov)]"
          loading={isLoading}
        />
        <Flow
          label="DEGEN buyback & burn"
          value={fmt(burn)}
          sub="est. 5% of buys — structural $DEGEN demand"
          accent="text-[var(--degen)]"
          loading={isLoading}
        />
        <Flow
          label="Creators earned"
          value={fmt(creators)}
          sub="est. 3.33% of buys paid to belief creators"
          loading={isLoading}
        />
        <Flow
          label="Net flow"
          value={netText}
          sub="buys minus sells — capital entering vs leaving"
          accent={netCls}
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
