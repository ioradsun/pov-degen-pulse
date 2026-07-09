import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { Header } from "@/components/pov/layout/Header";
import { StatsStrip } from "@/components/pov/layout/StatsStrip";
import { TwinLaneChart } from "@/components/pov/charts/TwinLaneChart";
import { LiveFeed } from "@/components/pov/panels/LiveFeed";
import { ContractRegistry } from "@/components/pov/panels/ContractRegistry";
import { RpcHealth } from "@/components/pov/panels/RpcHealth";
import { useRealtime } from "@/hooks/pov/useRealtime";
import { useDegenPrice } from "@/hooks/pov/useDegenPrice";
import { useBalances } from "@/hooks/pov/useBalances";
import { useRpcHealth } from "@/hooks/pov/useRpcHealth";
import { useTabs, type TabId } from "@/hooks/pov/useTabs";
import { buildHourlyBuckets } from "@/lib/pov/buckets";
import { Panel } from "@/components/pov/primitives/Panel";

export const Route = createFileRoute("/")({
  component: Dashboard,
});

const ENABLED_TABS: readonly TabId[] = ["overview", "registry"];

function Dashboard() {
  const { tab, setTab, tabs } = useTabs();
  const { events, latestBlock } = useRealtime();
  const { snapshot: degen, history } = useDegenPrice();
  const balances = useBalances();
  const health = useRpcHealth();

  const buckets = useMemo(
    () => buildHourlyBuckets(events, history, 24),
    [events, history],
  );

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
            <StatsStrip
              events={events}
              degen={degen}
              balances={balances}
            />
            <TwinLaneChart buckets={buckets} />
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
              <div className="lg:col-span-7">
                <LiveFeed events={events} />
              </div>
              <div className="lg:col-span-5">
                <RpcHealth health={health} />
              </div>
            </div>
            <ContractRegistry balances={balances} events={events} />
          </div>
        )}
        {effectiveTab === "registry" && (
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
            <div className="lg:col-span-7">
              <ContractRegistry balances={balances} events={events} />
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
            <span>v0 · Overview live · POV deep-dive, Correlations, DEGEN deep-dive shipping in phases</span>
            <span>Read-only · Base · chainId 8453</span>
          </div>
        </Panel>
      </footer>
    </div>
  );
}
