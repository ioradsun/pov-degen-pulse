import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PulseBar } from "@/components/pulse/PulseBar";
import { StatGridApi } from "@/components/pulse/StatGridApi";
import { RhythmChart } from "@/components/pulse/RhythmChart";
import { BeliefBoardApi } from "@/components/pulse/BeliefBoardApi";
import { LiveFeedApi } from "@/components/pulse/LiveFeedApi";
import { InsightPanel } from "@/components/pulse/InsightPanel";
import { IndexerStatusBanner } from "@/components/pulse/IndexerStatusBanner";
import { useDegenPrice } from "@/hooks/pov/useDegenPrice";

import { useDegenOhlc } from "@/hooks/pov/useDegenOhlc";
import { buildPulse } from "@/lib/pov/pulse";
import { formatUsd, type Currency } from "@/lib/pov/format";
import {
  useApiGrid,
  useApiHeadline,
  useApiHealth,
  useApiRetention,
  useApiRhythm,
  usePulseRealtime,
} from "@/hooks/pov/useApiPulse";

export const Route = createFileRoute("/")({
  component: Pulse,
});

function Pulse() {
  usePulseRealtime();
  const health = useApiHealth();
  const headline = useApiHeadline("24h");
  const grid = useApiGrid("volume_24h", 15);
  const rhythm = useApiRhythm(24);
  const retention = useApiRetention();
  const { snapshot: degen } = useDegenPrice();
  const { bars: ohlc } = useDegenOhlc(24);
  const ethUsd = degen && degen.priceEth > 0 ? degen.priceUsd / degen.priceEth : undefined;
  const [currency, setCurrency] = useState<Currency>("usd");

  const buckets = useMemo(() => buildPulse(rhythm.data?.buckets ?? [], ohlc), [rhythm.data, ohlc]);

  const writerStatus = health.data?.writer_status ?? null;
  const ready = writerStatus === "ok" && !!headline.data;

  const insightSnapshot = useMemo(() => {
    const h = headline.data;
    return JSON.stringify({
      window: "24h",
      pov: {
        buyVolumeUsd: Number(h?.buy_volume_usd ?? 0),
        beliefsCreated: Number(h?.new_beliefs ?? 0),
        activeTraders: Number(h?.active_traders ?? 0),
        creatorRevenueUsd: Number(h?.creator_revenue_usd ?? 0),
        degenAllocationUsd: Number(h?.degen_allocation_usd ?? 0),
      },
      retention: retention.data
        ? {
            newWallets: retention.data.new_wallets,
            repeatWallets: retention.data.repeat_wallets,
            repeatRatePct:
              retention.data.repeat_rate == null
                ? null
                : Math.round(retention.data.repeat_rate * 1000) / 10,
          }
        : null,
      topBeliefs: (grid.data?.rows ?? []).slice(0, 15).map((b) => ({
        belief: b.title ?? `Belief #${b.belief_id}`,
        buyVolume24hUsd: formatUsd(Number(b.buy_volume_24h_usd ?? 0), 0),
        splitPct: b.split_pct,
        wallets: b.unique_wallets_24h,
        lifecycleStage: b.lifecycle_stage,
      })),
      hourly: buckets.map((b) => ({
        h: new Date(b.hour * 1000).toISOString().slice(11, 16),
        buyVolumeUsd: Number(b.buyVolumeUsd.toFixed(2)),
        trades: b.buys + b.sells,
        created: b.created,
        degenUsd: b.degenPriceUsd,
      })),
      degen: degen
        ? {
            priceUsd: degen.priceUsd,
            change24hPct: degen.change24h,
            volume24hUsd: degen.volume24h,
            buys24h: degen.buys24h,
            sells24h: degen.sells24h,
            marketCapUsd: degen.marketCap,
          }
        : null,
    });
  }, [headline.data, retention.data, grid.data, buckets, degen]);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <PulseBar
        writerStatus={writerStatus}
        lastIndexedBlock={health.data?.indexer?.last_indexed_block ?? null}
        degen={degen}
        currency={currency}
        onCurrencyChange={setCurrency}
      />
      <main className="mx-auto flex max-w-[1200px] flex-col gap-4 px-3 py-4 md:px-4 md:py-6">
        <IndexerStatusBanner
          writerStatus={writerStatus}
          lastError={health.data?.indexer?.last_error}
        />
        <StatGridApi />
        <RhythmChart buckets={buckets} currency={currency} ethUsd={ethUsd} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <LiveFeedApi />
          </div>
          <div className="flex flex-col gap-4 lg:col-span-4">
            <InsightPanel snapshot={insightSnapshot} ready={ready} />
            <BeliefBoardApi />
          </div>

        </div>
      </main>
      <footer className="mx-auto max-w-[1200px] px-4 pb-6">
        <p className="border-t border-[var(--line)] pt-3 text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
          Read-only · Base · POV activity vs $DEGEN · fees burn DEGEN
        </p>
      </footer>
    </div>
  );
}
