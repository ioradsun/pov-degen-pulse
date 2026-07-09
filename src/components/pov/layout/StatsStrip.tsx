import { Metric } from "../primitives/Metric";
import {
  formatCompact,
  formatEth,
  formatPct,
  formatUsd,
} from "@/lib/pov/format";
import { POV_CONTRACTS } from "@/lib/pov/constants";
import type { DecodedEvent, DegenSnapshot } from "@/lib/pov/types";

interface Props {
  events: DecodedEvent[];
  degen: DegenSnapshot | null;
  balances: Record<string, bigint>;
}

export function StatsStrip({ events, degen, balances }: Props) {
  const now = Math.floor(Date.now() / 1000);
  const last24 = events.filter((e) => e.timestamp && now - e.timestamp <= 86400);
  const uniq = new Set(last24.map((e) => e.from).filter(Boolean));
  const totalEth = Object.values(POV_CONTRACTS).reduce((acc, addr) => {
    const b = balances[addr.toLowerCase()];
    return b ? acc + b : acc;
  }, 0n);

  return (
    <div className="grid grid-cols-2 border border-[var(--line)] bg-[var(--surface)] md:grid-cols-3 lg:grid-cols-6">
      <Cell>
        <Metric
          label="POV events / 24h"
          value={formatCompact(last24.length)}
          sub={`${events.length} in feed`}
        />
      </Cell>
      <Cell>
        <Metric
          label="Unique addrs / 24h"
          value={formatCompact(uniq.size)}
          sub="from decoded logs"
        />
      </Cell>
      <Cell>
        <Metric
          label="ETH in contracts"
          value={`${formatEth(totalEth, 3)} Ξ`}
          sub={`${Object.keys(balances).length} tracked`}
        />
      </Cell>
      <Cell>
        <Metric
          label="DEGEN price"
          value={degen ? formatUsd(degen.priceUsd, 5) : "—"}
          sub={degen ? formatPct(degen.change24h) : "loading"}
          trend={degen?.change24h ?? 0}
        />
      </Cell>
      <Cell>
        <Metric
          label="DEGEN vol / 24h"
          value={degen ? formatUsd(degen.volume24h) : "—"}
          sub={degen ? `${formatCompact(degen.buys24h + degen.sells24h)} tx` : "—"}
        />
      </Cell>
      <Cell last>
        <Metric
          label="DEGEN liquidity"
          value={degen ? formatUsd(degen.liquidityUsd) : "—"}
          sub={degen ? `mcap ${formatUsd(degen.marketCap)}` : "—"}
        />
      </Cell>
    </div>
  );
}

function Cell({
  children,
  last,
}: {
  children: React.ReactNode;
  last?: boolean;
}) {
  return (
    <div
      className={
        "border-b border-[var(--line)] md:border-b-0 " +
        (last
          ? ""
          : "border-r-0 md:border-r border-[var(--line)]")
      }
    >
      {children}
    </div>
  );
}
