import { useEffect, useState } from "react";
import { POV_CONTRACTS } from "@/lib/pov/constants";
import { fetchAbis, type AbiFetchResult } from "@/lib/pov/abi-loader.functions";

const CACHE_KEY = "pov-analytics:abis:v1";
const CHAIN_ID = 8453;

export interface AbiState {
  results: AbiFetchResult[];
  loading: boolean;
  error: string | null;
  loadedAt: number | null;
}

const ADDRS = Object.values(POV_CONTRACTS).map((a) => a.toLowerCase());

export function useAbis(): AbiState {
  const [state, setState] = useState<AbiState>({
    results: [],
    loading: true,
    error: null,
    loadedAt: null,
  });

  useEffect(() => {
    let alive = true;

    // Hydrate from cache first for instant UX
    try {
      const cached = localStorage.getItem(CACHE_KEY);
      if (cached) {
        const parsed = JSON.parse(cached) as {
          results: AbiFetchResult[];
          loadedAt: number;
        };
        setState({
          results: parsed.results,
          loading: false,
          error: null,
          loadedAt: parsed.loadedAt,
        });
      }
    } catch {
      /* noop */
    }

    (async () => {
      try {
        const results = await fetchAbis({
          data: { chainId: CHAIN_ID, addresses: ADDRS },
        });
        if (!alive) return;
        const payload = { results, loadedAt: Date.now() };
        setState({
          results,
          loading: false,
          error: null,
          loadedAt: payload.loadedAt,
        });
        try {
          localStorage.setItem(CACHE_KEY, JSON.stringify(payload));
        } catch {
          /* noop */
        }
      } catch (e) {
        if (!alive) return;
        setState((prev) => ({
          ...prev,
          loading: false,
          error: (e as Error).message,
        }));
      }
    })();

    return () => {
      alive = false;
    };
  }, []);

  return state;
}
