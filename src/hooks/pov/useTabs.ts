import { useEffect, useState } from "react";

const TABS = ["overview", "pov", "degen", "correlations", "registry"] as const;
export type TabId = (typeof TABS)[number];
const KEY = "pov-analytics:tab";

export function useTabs(): {
  tab: TabId;
  setTab: (t: TabId) => void;
  tabs: readonly TabId[];
} {
  const [tab, setTabState] = useState<TabId>("overview");

  useEffect(() => {
    try {
      const stored = localStorage.getItem(KEY);
      if (stored && (TABS as readonly string[]).includes(stored)) {
        setTabState(stored as TabId);
      }
    } catch {
      /* noop */
    }
  }, []);

  function setTab(t: TabId) {
    setTabState(t);
    try {
      localStorage.setItem(KEY, t);
    } catch {
      /* noop */
    }
  }

  return { tab, setTab, tabs: TABS };
}
