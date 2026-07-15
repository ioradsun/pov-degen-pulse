import { useState } from "react";
import { Panel } from "@/components/pov/primitives/Panel";
import { Skeleton } from "@/components/pov/primitives/Skeleton";
import { RANGE_META, type Range } from "@/lib/pov/ranges";
import { useApiRetention } from "@/hooks/pov/useApiPulse";
import { EscapeVelocityDrawer } from "./EscapeVelocityDrawer";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { Info } from "lucide-react";

/**
 * "Are people coming back?" — retention and Escape Velocity for the
 * selected timeframe. Repeat rate measures wallets that had the full window to
 * return and did; Escape Velocity is the share of new beliefs that attracted
 * at least N unique buyers in the same window.
 */

const THRESHOLDS = [3, 5, 10, 25, 50, 100] as const;

function Health({
  label,
  value,
  sub,
  accent,
  loading,
  headerRight,
}: {
  label: string;
  value: string;
  sub: React.ReactNode;
  accent?: string;
  loading?: boolean;
  headerRight?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col justify-between gap-2 p-4">
      <div className="flex items-center justify-between gap-2">
        <div className="text-[10px] uppercase tracking-[0.18em] text-[var(--ink-faint)]">
          {label}
        </div>
        {headerRight}
      </div>
      <div className={`text-[22px] leading-none tabular-nums ${accent ?? "text-[var(--ink)]"}`}>
        {loading ? <Skeleton className="h-6 w-24" /> : value}
      </div>
      <div className="text-[11px] leading-snug text-[var(--ink-dim)]">{sub}</div>
    </div>
  );
}

export function GrowthPanel({ range }: { range: Range }) {
  const [threshold, setThreshold] = useState<number>(3);
  const [drawerOpen, setDrawerOpen] = useState<boolean>(false);
  const { data, isLoading } = useApiRetention(range, threshold);
  const window = RANGE_META[range];

  const repeatRate = data?.repeat_rate;
  const repeatWallets = data?.repeat_wallets ?? 0;
  const newWallets = data?.new_wallets ?? 0;
  const fillRate = data?.belief_fill_rate;
  const beliefsCreated = data?.beliefs_created ?? 0;
  const beliefsFilled = data?.beliefs_filled ?? 0;

  const returnWindow = range === "all" ? "at any point after" : `within ${window}`;

  return (
    <Panel
      title="Are people coming back?"
      meta={`retention & escape velocity · ${window}`}
      bodyClassName="p-0"
      headerRight={
        <a
          href="/api/public/export/beliefs"
          download
          className="text-[10px] uppercase tracking-[0.14em] text-[var(--ink-dim)] hover:text-[var(--pov)]"
        >
          Export CSV ↓
        </a>
      }
    >
      <div className="grid grid-cols-1 divide-x divide-y divide-[var(--line-dim)] sm:grid-cols-3">
        <Health
          label="Repeat trader rate"
          value={repeatRate == null ? "—" : `${Math.round(repeatRate * 100)}%`}
          accent="text-[var(--pov)]"
          sub={
            newWallets > 0
              ? `${repeatWallets} of ${newWallets} bought again ${returnWindow}`
              : "no wallets have had the full window to return yet"
          }
          loading={isLoading}
        />
        <Health
          label="Wallets eligible to return"
          value={newWallets.toLocaleString()}
          sub={
            range === "all"
              ? "every wallet that has ever bought"
              : `first buy ${window} ago or more`
          }
          loading={isLoading}
        />
        <Health
          label="Escape velocity"
          value={fillRate == null ? "—" : `${Math.round(fillRate * 100)}%`}
          accent="text-[var(--up)]"
          headerRight={
            <div className="flex items-center gap-1">
              <TooltipProvider delayDuration={100}>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      type="button"
                      aria-label="What is escape velocity?"
                      className="text-[var(--ink-faint)] hover:text-[var(--ink-dim)]"
                    >
                      <Info className="h-3 w-3" />
                    </button>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="max-w-[240px] text-[11px] leading-snug">
                    <p className="font-medium">Escape Velocity</p>
                    <p className="mt-1">
                      Share of newly created beliefs that attracted at least {threshold} unique
                      buyers during the selected timeframe.
                    </p>
                    <p className="mt-1">Measures whether beliefs spread beyond their creator. Higher is healthier.</p>
                  </TooltipContent>
                </Tooltip>
              </TooltipProvider>
              <Select
                value={String(threshold)}
                onValueChange={(v) => setThreshold(Number(v))}
              >
                <SelectTrigger
                  className="h-6 w-auto gap-1 border-[var(--line-dim)] bg-transparent px-2 py-0 text-[10px] uppercase tracking-[0.14em] text-[var(--ink-dim)]"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {THRESHOLDS.map((n) => (
                    <SelectItem key={n} value={String(n)} className="text-[11px]">
                      {n}+ buyers
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          }
          sub={
            beliefsCreated === 0 ? (
              `no beliefs created in the ${window}`
            ) : (
              <button
                type="button"
                onClick={() => beliefsFilled > 0 && setDrawerOpen(true)}
                disabled={beliefsFilled === 0}
                className={
                  beliefsFilled > 0
                    ? "cursor-pointer text-left underline decoration-dotted decoration-[var(--ink-faint)] underline-offset-2 hover:text-[var(--pov)] hover:decoration-[var(--pov)]"
                    : "cursor-default text-left"
                }
              >
                {beliefsFilled} of {beliefsCreated} beliefs reached {threshold}+ buyers
                {beliefsFilled > 0 && " →"}
              </button>
            )
          }
          loading={isLoading}
        />
      </div>
      <EscapeVelocityDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        range={range}
        threshold={threshold}
      />
    </Panel>
  );
}
