import { Panel } from "@/components/pov/primitives/Panel";
import { Skeleton } from "@/components/pov/primitives/Skeleton";
import { formatUsd } from "@/lib/pov/format";
import { RANGE_META, type Range } from "@/lib/pov/ranges";
import { useApiRetention } from "@/hooks/pov/useApiPulse";

/**
 * "Are people coming back?" — retention and supply-side health for the
 * selected timeframe. Repeat rate measures wallets that had the full window to
 * return and did; belief fill rate and DEGEN burn are scoped to the same
 * window. All three follow the global timeframe control.
 */

function Health({
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
      <div className={`text-[22px] leading-none tabular-nums ${accent ?? "text-[var(--ink)]"}`}>
        {loading ? <Skeleton className="h-6 w-24" /> : value}
      </div>
      <div className="text-[11px] leading-snug text-[var(--ink-dim)]">{sub}</div>
    </div>
  );
}

export function GrowthPanel({ range }: { range: Range }) {
  const { data, isLoading } = useApiRetention(range);
  const window = RANGE_META[range];

  const repeatRate = data?.repeat_rate;
  const repeatWallets = data?.repeat_wallets ?? 0;
  const newWallets = data?.new_wallets ?? 0;
  const fillRate = data?.belief_fill_rate;
  const beliefsCreated = data?.beliefs_created ?? 0;
  const beliefsFilled = data?.beliefs_filled ?? 0;
  const degenBurn = Number(data?.degen_burn_usd ?? 0);

  const returnWindow = range === "all" ? "at any point after" : `within ${window}`;

  return (
    <Panel
      title="Are people coming back?"
      meta={`retention & supply health · ${window}`}
      bodyClassName="p-0"
    >
      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line-dim)] sm:grid-cols-4">
        <Health
          label="Repeat trader rate"
          value={repeatRate == null ? "—" : `${Math.round(repeatRate * 100)}%`}
          accent="text-[var(--pov)]"
          sub={
            newWallets > 0
              ? `${repeatWallets} of ${newWallets} bought again ${returnWindow}`
              : "no wallets have had the full window to return yet"
          }
          loading={isLoading}
        />
        <Health
          label="Wallets eligible to return"
          value={newWallets.toLocaleString()}
          sub={
            range === "all"
              ? "every wallet that has ever bought"
              : `first buy ${window} ago or more`
          }
          loading={isLoading}
        />
        <Health
          label="Belief fill rate"
          value={fillRate == null ? "—" : `${Math.round(fillRate * 100)}%`}
          accent="text-[var(--up)]"
          sub={
            beliefsCreated === 0
              ? `no beliefs created in the ${window}`
              : `${beliefsFilled} of ${beliefsCreated} beliefs found ≥3 buyers`
          }
          loading={isLoading}
        />
        <Health
          label="DEGEN buyback & burn"
          value={formatUsd(degenBurn, 0)}
          accent="text-[var(--degen)]"
          sub={`est. 5% of buy volume · ${window}`}
          loading={isLoading}
        />
      </div>
    </Panel>
  );
}
