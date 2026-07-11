import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PulseBar } from "@/components/pulse/PulseBar";
import { StatGridApi } from "@/components/pulse/StatGridApi";
import { RhythmChart } from "@/components/pulse/RhythmChart";
import { BeliefBoardApi } from "@/components/pulse/BeliefBoardApi";
import { LiveFeedApi } from "@/components/pulse/LiveFeedApi";
import { InsightPanel } from "@/components/pulse/InsightPanel";
import { IndexerStatusBanner } from "@/components/pulse/IndexerStatusBanner";
import { TraderOutcomesPanel } from "@/components/pulse/TraderOutcomesPanel";
import { ValueFlowPanel } from "@/components/pulse/ValueFlowPanel";
import { useDegenPrice } from "@/hooks/pov/useDegenPrice";
import { useDegenOhlc } from "@/hooks/pov/useDegenOhlc";
import { buildPulse } from "@/lib/pov/pulse";
import { formatUsd, type Currency } from "@/lib/pov/format";
import {
  RANGE_META,
  granularityForRange,
  OHLC_HOURS_FOR_RANGE,
  type Range,
} from "@/lib/pov/ranges";
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
  const [range, setRange] = useState<Range>("24h");
  const [outcomesRange, setOutcomesRange] = useState<Range>("all");
  const health = useApiHealth();
  const headline = useApiHeadline(range);
  const grid = useApiGrid("volume", range, 15);
  const rhythm = useApiRhythm(range);
  const retention = useApiRetention();
  const { snapshot: degen } = useDegenPrice();
  const { bars: ohlc } = useDegenOhlc(OHLC_HOURS_FOR_RANGE[range]);
  const ethUsd = degen && degen.priceEth > 0 ? degen.priceUsd / degen.priceEth : undefined;
  const [currency, setCurrency] = useState<Currency>("usd");

  const granularity = granularityForRange(range);
  const buckets = useMemo(
    () => buildPulse(rhythm.data?.buckets ?? [], ohlc, granularity),
    [rhythm.data, ohlc, granularity],
  );

  const writerStatus = health.data?.writer_status ?? null;
  const ready = writerStatus === "ok" && !!headline.data;

  const insightSnapshot = useMemo(() => {
    const h = headline.data;
    return JSON.stringify({
      window: range,
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
        buyVolumeUsd: formatUsd(Number(b.buy_volume_usd ?? 0), 0),
        splitPct: b.split_pct,
        wallets: b.unique_wallets_24h,
        lifecycleStage: b.lifecycle_stage,
      })),
      series: buckets.map((b) => ({
        t:
          granularity === "hour"
            ? new Date(b.ts * 1000).toISOString().slice(11, 16)
            : new Date(b.ts * 1000).toISOString().slice(0, 10),
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
  }, [range, headline.data, retention.data, grid.data, buckets, granularity, degen]);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <PulseBar
        writerStatus={writerStatus}
        lastIndexedBlock={health.data?.indexer?.last_indexed_block ?? null}
        degen={degen}
        currency={currency}
        onCurrencyChange={setCurrency}
        ethUsd={ethUsd}
      />
      <main className="mx-auto flex max-w-[1200px] flex-col gap-4 px-3 py-4 md:px-4 md:py-6">
        <IndexerStatusBanner
          writerStatus={writerStatus}
          lastError={health.data?.indexer?.last_error}
        />
        <StatGridApi range={range} onRangeChange={setRange} currency={currency} />
        <ValueFlowPanel range={range} currency={currency} ethUsd={ethUsd} />
        <TraderOutcomesPanel
          range={outcomesRange}
          onRangeChange={setOutcomesRange}
          currency={currency}
          ethUsd={ethUsd}
        />


        {rhythm.isLoading && buckets.length === 0 ? (
          <div className="rounded-sm border border-[var(--line)] bg-[var(--surface)] p-4">
            <div className="mb-3 h-3 w-24 animate-pulse rounded-sm bg-[var(--surface-2)]" />
            <div className="flex h-[280px] items-end gap-1">
              {Array.from({ length: 24 }).map((_, i) => (
                <div
                  key={i}
                  className="flex-1 animate-pulse rounded-sm bg-[var(--surface-2)]"
                  style={{ height: `${20 + ((i * 37) % 70)}%` }}
                />
              ))}
            </div>
          </div>
        ) : (
          <RhythmChart
            buckets={buckets}
            currency={currency}
            ethUsd={ethUsd}
            granularity={granularity}
            rangeLabel={RANGE_META[range]}
          />
        )}
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <LiveFeedApi />
          </div>
          <div className="flex flex-col gap-4 lg:col-span-4">
            <InsightPanel snapshot={insightSnapshot} ready={ready} />
            <BeliefBoardApi range={range} />
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
