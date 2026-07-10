import { Metric } from "@/components/pov/primitives/Metric";
import { Panel } from "@/components/pov/primitives/Panel";
import { formatUsd } from "@/lib/pov/format";
import { useApiHeadline } from "@/hooks/pov/useApiPulse";

export function StatGridApi() {
  const { data, isLoading } = useApiHeadline("24h");
  const vol = Number(data?.buy_volume_usd ?? 0);
  const traders = Number(data?.active_traders ?? 0);
  const created = Number(data?.new_beliefs ?? 0);
  const creatorRev = Number(data?.creator_revenue_usd ?? 0);
  const degenAlloc = Number(data?.degen_allocation_usd ?? 0);

  return (
    <Panel title="POV · last 24 hours" meta={isLoading ? "loading…" : undefined} bodyClassName="p-0">
      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line-dim)] sm:grid-cols-3 lg:grid-cols-5">
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
      </div>
    </Panel>
  );
}
