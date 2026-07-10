import { useEffect, useRef, useState } from "react";
import { fetchDegenSnapshot } from "@/lib/pov/dexscreener";
import type { DegenSnapshot } from "@/lib/pov/types";

const POLL_MS = 30_000;
const HISTORY_CAP = 48;

export function useDegenPrice(): {
  snapshot: DegenSnapshot | null;
  history: DegenSnapshot[];
  loading: boolean;
} {
  const [snapshot, setSnapshot] = useState<DegenSnapshot | null>(null);
  const [history, setHistory] = useState<DegenSnapshot[]>([]);
  const [loading, setLoading] = useState(true);
  const hidden = useRef(false);

  useEffect(() => {
    let alive = true;
    async function tick() {
      if (hidden.current) return;
      const s = await fetchDegenSnapshot();
      if (!alive) return;
      if (s) {
        setSnapshot(s);
        setHistory((prev) => {
          const next = [...prev, s];
          return next.length > HISTORY_CAP ? next.slice(next.length - HISTORY_CAP) : next;
        });
      }
      setLoading(false);
    }
    tick();
    const id = window.setInterval(tick, POLL_MS);

    const onVis = () => {
      hidden.current = document.visibilityState === "hidden";
      if (!hidden.current) tick();
    };
    document.addEventListener("visibilitychange", onVis);
    return () => {
      alive = false;
      clearInterval(id);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return { snapshot, history, loading };
}
