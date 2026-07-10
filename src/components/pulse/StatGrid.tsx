import { useMemo } from "react";
import { Metric } from "@/components/pov/primitives/Metric";
import { Panel } from "@/components/pov/primitives/Panel";
import { formatEth, formatUsd, type Currency } from "@/lib/pov/format";
import type { DecodedEvent } from "@/lib/pov/types";

interface StatGridProps {
  events: DecodedEvent[];
  currency: Currency;
  ethUsd?: number;
}

export interface PovStats {
  volumeWei: bigint;
  buys: number;
  sells: number;
  created: number;
  boosts: number;
  traders: number;
}

export function computeStats(events: DecodedEvent[]): PovStats {
  const s: PovStats = {
    volumeWei: 0n,
    buys: 0,
    sells: 0,
    created: 0,
    boosts: 0,
    traders: 0,
  };
  const addrs = new Set<string>();
  for (const e of events) {
    if (e.kind === "buy") s.buys++;
    else if (e.kind === "sell") s.sells++;
    else if (e.kind === "created") s.created++;
    else if (e.kind === "boost") s.boosts++;
    if (e.valueWei && (e.kind === "buy" || e.kind === "sell")) {
      s.volumeWei += e.valueWei;
    }
    if (e.from && e.kind !== "unknown") addrs.add(e.from);
  }
  s.traders = addrs.size;
  return s;
}

export function StatGrid({ events }: StatGridProps) {
  const s = useMemo(() => computeStats(events), [events]);
  const convictionPct =
    s.buys + s.sells > 0 ? Math.round((s.buys / (s.buys + s.sells)) * 100) : null;

  return (
    <Panel title="POV · last 24 hours" bodyClassName="p-0">
      <div className="grid grid-cols-2 divide-x divide-y divide-[var(--line-dim)] sm:grid-cols-3 lg:grid-cols-6">
        <Metric
          label="ETH transacted"
          value={<span className="text-[var(--pov)]">{formatEth(s.volumeWei, 3)}</span>}
          sub="buys + sells"
        />
        <Metric label="Beliefs created" value={s.created} sub="new markets" />
        <Metric
          label="Investments"
          value={<span className="text-[var(--up)]">{s.buys}</span>}
          sub="yes/no buys"
        />
        <Metric
          label="Exits"
          value={<span className="text-[var(--down)]">{s.sells}</span>}
          sub="positions sold"
        />
        <Metric label="Traders" value={s.traders} sub="unique wallets" />
        <Metric
          label="Conviction"
          value={convictionPct == null ? "—" : `${convictionPct}%`}
          sub={convictionPct == null ? "no trades yet" : "share of trades that are buys"}
          trend={convictionPct == null ? undefined : convictionPct - 50}
        />
      </div>
    </Panel>
  );
}
