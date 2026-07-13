import { useEffect, useRef, useState } from "react";
import { fetchDegenSnapshot } from "@/lib/pov/dexscreener";
import { fetchDegenGlobal } from "@/lib/pov/coingecko";
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
      // Pool-level texture from DexScreener (buys/sells/liquidity) + global
      // money figures from CoinGecko (price/change/volume/mcap across all venues).
      const [pool, global] = await Promise.all([fetchDegenSnapshot(), fetchDegenGlobal()]);
      if (!alive) return;
      let s: DegenSnapshot | null = null;
      if (pool || global) {
        s = {
          ts: Date.now(),
          priceUsd: global?.priceUsd ?? pool?.priceUsd ?? 0,
          priceEth: global?.priceEth ?? pool?.priceEth ?? 0,
          change24h: global?.change24h ?? pool?.change24h ?? 0,
          volume24h: global?.volume24h ?? pool?.volume24h ?? 0,
          marketCap: global?.marketCap ?? pool?.marketCap ?? 0,
          liquidityUsd: pool?.liquidityUsd ?? 0,
          buys24h: pool?.buys24h ?? 0,
          sells24h: pool?.sells24h ?? 0,
        };
      }
      if (s) {
        const snap = s;
        setSnapshot(snap);
        setHistory((prev) => {
          const next = [...prev, snap];
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
