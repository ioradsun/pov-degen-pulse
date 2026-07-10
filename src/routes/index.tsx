import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { PulseBar } from "@/components/pulse/PulseBar";
import { StatGrid, computeStats } from "@/components/pulse/StatGrid";
import { RhythmChart } from "@/components/pulse/RhythmChart";
import { BeliefBoard } from "@/components/pulse/BeliefBoard";
import { LiveFeed } from "@/components/pulse/LiveFeed";
import { InsightPanel } from "@/components/pulse/InsightPanel";
import { DecodeBanner } from "@/components/pulse/DecodeBanner";
import { useActivity } from "@/hooks/pov/useActivity";
import { useBeliefs } from "@/hooks/pov/useBeliefs";
import { useBeliefTexts } from "@/hooks/pov/useBeliefTexts";
import { useDegenPrice } from "@/hooks/pov/useDegenPrice";
import { useDegenOhlc } from "@/hooks/pov/useDegenOhlc";
import { useAbis } from "@/hooks/pov/useAbis";
import { buildAbiIndex } from "@/lib/pov/events";
import { buildPulse } from "@/lib/pov/pulse";
import { formatEth, type Currency } from "@/lib/pov/format";

export const Route = createFileRoute("/")({
  component: Pulse,
});

function Pulse() {
  const abis = useAbis();
  const abiIndex = useMemo(() => buildAbiIndex(abis.results), [abis.results]);
  const { events, latestBlock, backfill, live } = useActivity(abiIndex);
  const { snapshot: degen } = useDegenPrice();
  const { bars: ohlc } = useDegenOhlc(24);
  const beliefs = useBeliefs(events);
  const beliefTexts = useBeliefTexts(beliefs);
  const ethUsd = degen && degen.priceEth > 0 ? degen.priceUsd / degen.priceEth : undefined;
  const [currency, setCurrency] = useState<Currency>("usd");

  const buckets = useMemo(() => buildPulse(events, ohlc, 24), [events, ohlc]);

  const insightSnapshot = useMemo(() => {
    const s = computeStats(events);
    return JSON.stringify({
      window: "24h",
      pov: {
        ethTransacted: formatEth(s.volumeWei, 4),
        beliefsCreated: s.created,
        buys: s.buys,
        sells: s.sells,
        boosts: s.boosts,
        uniqueTraders: s.traders,
      },
      topBeliefs: beliefs.slice(0, 15).map((b) => ({
        belief: b.text ?? beliefTexts.get(b.id) ?? `#${b.id}`,
        buys: b.totalBuys,
        sells: b.totalSells,
        ethVolume: formatEth(b.volumeWei, 4),
        wallets: b.participants,
        boosts: b.boostCount,
      })),
      hourly: buckets.map((b) => ({
        h: new Date(b.hour * 1000).toISOString().slice(11, 16),
        eth: Number(b.volumeEth.toFixed(4)),
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
  }, [events, beliefs, beliefTexts, buckets, degen]);

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <PulseBar
        latestBlock={latestBlock}
        live={live}
        backfill={backfill}
        degen={degen}
        currency={currency}
        onCurrencyChange={setCurrency}
      />
      <main className="mx-auto flex max-w-[1200px] flex-col gap-4 px-3 py-4 md:px-4 md:py-6">
        <DecodeBanner events={events} abis={abis} live={live} />
        <StatGrid events={events} currency={currency} ethUsd={ethUsd} />
        <RhythmChart buckets={buckets} currency={currency} ethUsd={ethUsd} />
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-8">
            <LiveFeed
              events={events}
              beliefs={beliefs}
              beliefTexts={beliefTexts}
              ethUsd={ethUsd}
              live={live}
              backfill={backfill}
              currency={currency}
            />
          </div>
          <div className="flex flex-col gap-4 lg:col-span-4">
            <InsightPanel snapshot={insightSnapshot} ready={live} />
            <BeliefBoard
              beliefs={beliefs}
              beliefTexts={beliefTexts}
              currency={currency}
              ethUsd={ethUsd}
            />
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
