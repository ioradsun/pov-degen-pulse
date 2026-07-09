import { useEffect, useRef, useState } from "react";
import { fetchDegenHourlyOhlc, type OhlcBar } from "@/lib/pov/geckoterminal";

const POLL_MS = 5 * 60_000; // 5 min — hourly bars don't change often

export function useDegenOhlc(hours = 168): {
  bars: OhlcBar[];
  loading: boolean;
  lastFetch: number | null;
} {
  const [bars, setBars] = useState<OhlcBar[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastFetch, setLastFetch] = useState<number | null>(null);
  const hidden = useRef(false);

  useEffect(() => {
    let alive = true;
    async function tick() {
      if (hidden.current) return;
      const b = await fetchDegenHourlyOhlc(hours);
      if (!alive) return;
      if (b.length) setBars(b);
      setLastFetch(Date.now());
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
  }, [hours]);

  return { bars, loading, lastFetch };
}
