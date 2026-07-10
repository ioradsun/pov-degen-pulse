import { BASE_RPCS } from "./constants";
import type { RpcHealthState } from "./types";

type Sub = (h: RpcHealthState) => void;

interface InternalState extends RpcHealthState {
  subs: Set<Sub>;
  consecutiveFailures: number;
}

const state: InternalState = {
  active: BASE_RPCS[0],
  attempts: 0,
  successes: 0,
  failures: 0,
  lastError: null,
  lastSuccessAt: null,
  lastErrorAt: null,
  perEndpoint: {},
  consecutiveFailures: 0,
  subs: new Set(),
};

function snapshot(): RpcHealthState {
  const { subs: _s, consecutiveFailures: _c, ...rest } = state;
  return { ...rest, perEndpoint: { ...rest.perEndpoint } };
}

function notify() {
  const snap = snapshot();
  state.subs.forEach((fn) => fn(snap));
}

export function subscribeRpcHealth(fn: Sub): () => void {
  state.subs.add(fn);
  fn(snapshot());
  return () => {
    state.subs.delete(fn);
  };
}

export function getRpcHealth(): RpcHealthState {
  return snapshot();
}

export function getConsecutiveFailures(): number {
  return state.consecutiveFailures;
}

export async function rpc<T = unknown>(method: string, params: unknown[]): Promise<T> {
  const ordered = [state.active, ...BASE_RPCS.filter((u) => u !== state.active)];
  let lastErr: Error | null = null;
  let anySuccess = false;
  for (const url of ordered) {
    state.attempts++;
    state.perEndpoint[url] ??= { s: 0, f: 0 };
    try {
      const r = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: Date.now(),
          method,
          params,
        }),
      });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      if (j.error) throw new Error(j.error.message ?? "rpc error");
      state.active = url;
      state.successes++;
      state.perEndpoint[url].s++;
      state.lastSuccessAt = Date.now();
      state.consecutiveFailures = 0;
      anySuccess = true;
      notify();
      return j.result as T;
    } catch (e) {
      lastErr = e as Error;
      state.failures++;
      state.perEndpoint[url].f++;
      state.lastError = `${url.replace("https://", "")} · ${(e as Error).message}`;
      state.lastErrorAt = Date.now();
      notify();
    }
  }
  if (!anySuccess) state.consecutiveFailures++;
  throw lastErr ?? new Error("all RPCs failed");
}
