import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Header } from "@/components/pov/layout/Header";
import { StatsStrip } from "@/components/pov/layout/StatsStrip";
import { TwinLaneChart } from "@/components/pov/charts/TwinLaneChart";
import { CurveMixArea } from "@/components/pov/charts/CurveMixArea";
import { LifecycleFunnel } from "@/components/pov/charts/LifecycleFunnel";
import { CohortHeatmap } from "@/components/pov/charts/CohortHeatmap";
import { LiveFeed } from "@/components/pov/panels/LiveFeed";
import { ContractRegistry } from "@/components/pov/panels/ContractRegistry";
import { RpcHealth } from "@/components/pov/panels/RpcHealth";
import { BeliefLeaderboard } from "@/components/pov/panels/BeliefLeaderboard";
import { DegenBoostPanel } from "@/components/pov/panels/DegenBoostPanel";
import { AbiStatus } from "@/components/pov/panels/AbiStatus";
import { DegenOhlcChart } from "@/components/pov/charts/DegenOhlcChart";
import { LaggedXcorrChart } from "@/components/pov/charts/LaggedXcorrChart";
import { RollingRegressionPanel } from "@/components/pov/panels/RollingRegressionPanel";
import { CorrelationSummary } from "@/components/pov/panels/CorrelationSummary";
import { useRealtime } from "@/hooks/pov/useRealtime";
import { useDegenPrice } from "@/hooks/pov/useDegenPrice";
import { useBalances } from "@/hooks/pov/useBalances";
import { useRpcHealth } from "@/hooks/pov/useRpcHealth";
import { useTabs, type TabId } from "@/hooks/pov/useTabs";
import { useAbis } from "@/hooks/pov/useAbis";
import { useBeliefs } from "@/hooks/pov/useBeliefs";
import { useDegenOhlc } from "@/hooks/pov/useDegenOhlc";
import { buildAbiIndex } from "@/lib/pov/events";
import { buildHourlyBuckets } from "@/lib/pov/buckets";
import { joinPovDegen, summarize, xcorrSeries } from "@/lib/pov/correlations";
import { Panel } from "@/components/pov/primitives/Panel";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

const ENABLED_TABS: readonly TabId[] = ["overview", "pov", "correlations", "registry"];

function Dashboard() {
  const { tab, setTab, tabs } = useTabs();
  const abis = useAbis();
  const abiIndex = useMemo(() => buildAbiIndex(abis.results), [abis.results]);
  const { events, latestBlock } = useRealtime(abiIndex);
  const { snapshot: degen, history } = useDegenPrice();
  const balances = useBalances();
  const health = useRpcHealth();
  const beliefs = useBeliefs(events);
  const { bars: ohlc, loading: ohlcLoading } = useDegenOhlc(168);

  const buckets = useMemo(
    () => buildHourlyBuckets(events, history, 24),
    [events, history],
  );

  const joined = useMemo(() => joinPovDegen(events, ohlc), [events, ohlc]);
  const corrSummary = useMemo(() => summarize(joined), [joined]);
  const xcorr = useMemo(() => xcorrSeries(joined, 12), [joined]);

  const effectiveTab: TabId = ENABLED_TABS.includes(tab) ? tab : "overview";

  return (
    <div className="min-h-screen bg-[var(--bg)] text-[var(--ink)]">
      <Header
        tab={effectiveTab}
        setTab={setTab}
        tabs={tabs}
        enabled={ENABLED_TABS}
        health={health}
        latestBlock={latestBlock}
        degen={degen}
      />
      <main className="mx-auto max-w-[1400px] px-3 py-4 md:px-4 md:py-6">
        {effectiveTab === "overview" && (
          <div className="flex flex-col gap-4">
            <StatsStrip events={events} degen={degen} balances={balances} />
            <TwinLaneChart buckets={buckets} />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <LiveFeed events={events} />
              </div>
              <div className="lg:col-span-5 flex flex-col gap-4">
                <DegenBoostPanel events={events} />
                <RpcHealth health={health} />
              </div>
            </div>
            <ContractRegistry balances={balances} events={events} />
          </div>
        )}

        {effectiveTab === "pov" && (
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <LifecycleFunnel beliefs={beliefs} />
              </div>
              <div className="lg:col-span-5">
                <DegenBoostPanel events={events} />
              </div>
            </div>
            <CurveMixArea beliefs={beliefs} />
            <BeliefLeaderboard beliefs={beliefs} />
            <CohortHeatmap events={events} />
          </div>
        )}

        {effectiveTab === "registry" && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-7 flex flex-col gap-4">
              <ContractRegistry balances={balances} events={events} />
              <AbiStatus state={abis} />
            </div>
            <div className="lg:col-span-5">
              <RpcHealth health={health} />
            </div>
          </div>
        )}
      </main>
      <footer className="mx-auto max-w-[1400px] border-t border-[var(--line)] px-4 py-4">
        <Panel bodyClassName="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
            <span>
              v2 · Overview + POV live · Correlations, DEGEN deep-dive next
            </span>
            <span>Read-only · Base · chainId 8453</span>
          </div>
        </Panel>
      </footer>
    </div>
  );
}
