import { clsx } from "clsx";
import { formatUsd } from "@/lib/pov/format";
import { TabStrip } from "./TabStrip";
import type { TabId } from "@/hooks/pov/useTabs";
import type { DegenSnapshot, RpcHealthState } from "@/lib/pov/types";

interface Props {
  tab: TabId;
  setTab: (t: TabId) => void;
  tabs: readonly TabId[];
  enabled: readonly TabId[];
  health: RpcHealthState;
  latestBlock: number | null;
  degen: DegenSnapshot | null;
}

export function Header({
  tab,
  setTab,
  tabs,
  enabled,
  health,
  latestBlock,
  degen,
}: Props) {
  const successRate =
    health.attempts > 0 ? (health.successes / health.attempts) * 100 : 0;
  const ok = successRate >= 80 || health.attempts < 5;

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--line)] bg-[var(--bg)]/95 backdrop-blur">
      <div className="mx-auto flex max-w-[1400px] items-stretch justify-between">
        <div className="flex items-stretch">
          <div className="flex items-center gap-2 border-r border-[var(--line)] px-4 py-3">
            <span className="text-[13px] font-medium tracking-[0.14em] text-[var(--ink)]">
              POV
            </span>
            <span className="text-[13px] text-[var(--ink-faint)]">×</span>
            <span className="text-[13px] font-medium tracking-[0.14em] text-[var(--pov)]">
              DEGEN
            </span>
          </div>
          <TabStrip tab={tab} setTab={setTab} tabs={tabs} enabled={enabled} />
        </div>
        <div className="flex items-stretch">
          <StatusCell label="RPC">
            <span
              className={clsx(
                "inline-block h-2 w-2 rounded-full",
                ok
                  ? "bg-[var(--up)] animate-[pulse_1.6s_ease-in-out_infinite]"
                  : "bg-[var(--down)]",
              )}
            />
            <span className="tabular-nums text-[var(--ink)]">
              {successRate.toFixed(0)}%
            </span>
          </StatusCell>
          <StatusCell label="Block">
            <span className="tabular-nums text-[var(--ink)]">
              {latestBlock ? `#${latestBlock.toLocaleString()}` : "—"}
            </span>
          </StatusCell>
          <StatusCell label="DEGEN">
            <span className="tabular-nums text-[var(--ink)]">
              {degen ? formatUsd(degen.priceUsd, 5) : "—"}
            </span>
            {degen && (
              <span
                className={clsx(
                  "tabular-nums text-[11px]",
                  degen.change24h >= 0
                    ? "text-[var(--up)]"
                    : "text-[var(--down)]",
                )}
              >
                {degen.change24h >= 0 ? "+" : ""}
                {degen.change24h.toFixed(2)}%
              </span>
            )}
          </StatusCell>
        </div>
      </div>
    </header>
  );
}

function StatusCell({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-2 border-l border-[var(--line)] px-4 py-3">
      <span className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
        {label}
      </span>
      {children}
    </div>
  );
}
