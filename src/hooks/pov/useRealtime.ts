import { useEffect, useRef, useState } from "react";
import { POV_TRACKED } from "@/lib/pov/constants";
import { decodeLog, normalizeLog } from "@/lib/pov/events";
import { getConsecutiveFailures, rpc } from "@/lib/pov/rpc";
import type { DecodedEvent } from "@/lib/pov/types";

const BASE_POLL_MS = 5_000;
const SLOW_POLL_MS = 15_000;
const FEED_CAP = 150;
const NEW_ROW_MS = 1_800;
const MAX_BLOCK_CHUNK = 50;
const EVENT_RETENTION_HOURS = 48;
const BLOCK_TS_CACHE = new Map<number, number>();

interface RpcLog {
  address: string;
  blockNumber: string;
  logIndex: string;
  transactionHash: string;
  topics: string[];
  data: string;
}

async function getBlockTs(block: number): Promise<number | undefined> {
  const cached = BLOCK_TS_CACHE.get(block);
  if (cached) return cached;
  try {
    const b = await rpc<{ timestamp: string } | null>("eth_getBlockByNumber", [
      `0x${block.toString(16)}`,
      false,
    ]);
    if (!b?.timestamp) return undefined;
    const ts = Number.parseInt(b.timestamp, 16);
    BLOCK_TS_CACHE.set(block, ts);
    return ts;
  } catch {
    return undefined;
  }
}

async function fetchLogsChunk(
  address: string,
  from: number,
  to: number,
): Promise<RpcLog[]> {
  return rpc<RpcLog[]>("eth_getLogs", [
    {
      address,
      fromBlock: `0x${from.toString(16)}`,
      toBlock: `0x${to.toString(16)}`,
    },
  ]);
}

async function fetchAllLogs(
  from: number,
  to: number,
): Promise<RpcLog[]> {
  const out: RpcLog[] = [];
  for (const addr of POV_TRACKED) {
    for (let start = from; start <= to; start += MAX_BLOCK_CHUNK) {
      const end = Math.min(start + MAX_BLOCK_CHUNK - 1, to);
      try {
        const logs = await fetchLogsChunk(addr, start, end);
        out.push(...logs);
      } catch {
        // swallow — health tracker already recorded
      }
    }
  }
  return out;
}

export function useRealtime(): {
  events: DecodedEvent[];
  latestBlock: number | null;
  ready: boolean;
} {
  const [events, setEvents] = useState<DecodedEvent[]>([]);
  const [latestBlock, setLatestBlock] = useState<number | null>(null);
  const [ready, setReady] = useState(false);
  const lastBlockRef = useRef<number | null>(null);
  const seen = useRef<Set<string>>(new Set());
  const hidden = useRef(false);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let alive = true;

    async function tick() {
      if (hidden.current) return schedule();
      try {
        const hex = await rpc<string>("eth_blockNumber", []);
        const latest = Number.parseInt(hex, 16);
        if (!alive) return;
        setLatestBlock(latest);

        let from = lastBlockRef.current;
        if (from == null) {
          // bootstrap: scan last ~150 blocks (~5 min on Base)
          from = Math.max(0, latest - 150);
        } else {
          from = from + 1;
        }
        if (from <= latest) {
          const rawLogs = await fetchAllLogs(from, latest);
          const decoded: DecodedEvent[] = [];
          const uniqBlocks = new Set<number>();
          for (const l of rawLogs) {
            const raw = normalizeLog(l);
            const key = `${raw.txHash}-${raw.logIndex}`;
            if (seen.current.has(key)) continue;
            seen.current.add(key);
            uniqBlocks.add(raw.block);
            const ev = decodeLog(raw);
            ev._newUntil = Date.now() + NEW_ROW_MS;
            decoded.push(ev);
          }
          // enrich timestamps (bounded parallel)
          await Promise.all(
            [...uniqBlocks].slice(0, 25).map(async (b) => {
              const ts = await getBlockTs(b);
              if (ts) {
                for (const e of decoded) if (e.block === b) e.timestamp = ts;
              }
            }),
          );
          if (decoded.length) {
            decoded.sort((a, b) =>
              b.block - a.block || b.logIndex - a.logIndex,
            );
            setEvents((prev) => {
              const merged = [...decoded, ...prev];
              const cutoff =
                Math.floor(Date.now() / 1000) - EVENT_RETENTION_HOURS * 3600;
              const filtered = merged.filter(
                (e) => !e.timestamp || e.timestamp >= cutoff,
              );
              return filtered.slice(0, FEED_CAP);
            });
          }
          lastBlockRef.current = latest;
        }
        setReady(true);
      } catch {
        // health tracker recorded
      }
      schedule();
    }

    function schedule() {
      if (!alive) return;
      const delay = getConsecutiveFailures() >= 3 ? SLOW_POLL_MS : BASE_POLL_MS;
      timerRef.current = window.setTimeout(tick, delay);
    }

    const onVis = () => {
      hidden.current = document.visibilityState === "hidden";
      if (!hidden.current) tick();
    };
    document.addEventListener("visibilitychange", onVis);
    tick();
    return () => {
      alive = false;
      if (timerRef.current) clearTimeout(timerRef.current);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, []);

  return { events, latestBlock, ready };
}
