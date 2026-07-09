import { clsx } from "clsx";
import type { TabId } from "@/hooks/pov/useTabs";

interface Props {
  tab: TabId;
  setTab: (t: TabId) => void;
  tabs: readonly TabId[];
  enabled: readonly TabId[];
}

const LABELS: Record<TabId, string> = {
  overview: "Overview",
  pov: "POV",
  degen: "DEGEN",
  correlations: "Correlations",
  registry: "Registry",
};

export function TabStrip({ tab, setTab, tabs, enabled }: Props) {
  return (
    <nav
      className="flex items-stretch"
      role="tablist"
      onKeyDown={(e) => {
        const idx = tabs.indexOf(tab);
        if (e.key === "ArrowRight") {
          const next = tabs[(idx + 1) % tabs.length];
          if (enabled.includes(next)) setTab(next);
        } else if (e.key === "ArrowLeft") {
          const next = tabs[(idx - 1 + tabs.length) % tabs.length];
          if (enabled.includes(next)) setTab(next);
        }
      }}
    >
      {tabs.map((t) => {
        const active = t === tab;
        const isEnabled = enabled.includes(t);
        return (
          <button
            key={t}
            role="tab"
            aria-selected={active}
            disabled={!isEnabled}
            onClick={() => isEnabled && setTab(t)}
            className={clsx(
              "border-r border-[var(--line)] px-4 py-3 text-[11px] uppercase tracking-[0.18em] transition-colors",
              active
                ? "bg-[var(--surface)] text-[var(--pov)]"
                : isEnabled
                  ? "text-[var(--ink-dim)] hover:text-[var(--ink)]"
                  : "cursor-not-allowed text-[var(--ink-faint)]",
            )}
          >
            {LABELS[t]}
          </button>
        );
      })}
    </nav>
  );
}
