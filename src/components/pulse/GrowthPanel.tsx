import { Panel } from "@/components/pov/primitives/Panel";
import { Skeleton } from "@/components/pov/primitives/Skeleton";
import { formatUsd } from "@/lib/pov/format";
import { useApiRetention } from "@/hooks/pov/useApiPulse";

/**
 * "Are people coming back?" — retention and supply-side health, deliberately
 * separate from the raw activity grid. Repeat rate and new wallets are a
 * rolling 7-day cohort (not the header range); DEGEN burn here is all-time,
 * the platform's cumulative thesis number.
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

export function GrowthPanel() {
  const { data, isLoading } = useApiRetention();

  const repeatRate = data?.repeat_rate;
  const repeatWallets = data?.repeat_wallets ?? 0;
  const newWallets = data?.new_wallets ?? 0;
  const fillRate = data?.belief_fill_rate_7d;
  const beliefsCreated = data?.beliefs_created_7d ?? 0;
  const beliefsFilled = data?.beliefs_filled_7d ?? 0;
  const degenBurn = Number(data?.degen_burn_all_time_usd ?? 0);

  return (
    <Panel title="Are people coming back?" meta="7d rolling · DEGEN burn all-time" bodyClassName="p-0">
      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line-dim)] sm:grid-cols-4">
        <Health
          label="Repeat trader rate"
          value={repeatRate == null ? "—" : `${Math.round(repeatRate * 100)}%`}
          accent="text-[var(--pov)]"
          sub={
            newWallets > 0
              ? `${repeatWallets} of ${newWallets} returned within 7 days`
              : "no wallets older than 24h yet"
          }
          loading={isLoading}
        />
        <Health
          label="New wallets"
          value={newWallets.toLocaleString()}
          sub="first buy 7+ days ago, eligible for repeat"
          loading={isLoading}
        />
        <Health
          label="Belief fill rate"
          value={fillRate == null ? "—" : `${Math.round(fillRate * 100)}%`}
          accent="text-[var(--up)]"
          sub={
            beliefsCreated === 0
              ? "no beliefs created in the last 7 days"
              : `${beliefsFilled} of ${beliefsCreated} beliefs found ≥3 buyers`
          }
          loading={isLoading}
        />
        <Health
          label="Cumulative DEGEN burn"
          value={formatUsd(degenBurn, 0)}
          accent="text-[var(--degen)]"
          sub="est. 5% of all-time buy volume"
          loading={isLoading}
        />
      </div>
    </Panel>
  );
}
