import { decodeFunctionResult, encodeFunctionData, type AbiFunction } from "viem";
import { rpc } from "./rpc";
import { POV_CONTRACTS } from "./constants";
import type { AbiFetchResult } from "./abi-loader.functions";

/**
 * Second on-chain source for belief text (after event string args, which
 * are a dead end for POV's core events — confirmed in VERIFICATION.md,
 * MarketCreated only carries opaque UUIDs). Some market contracts expose
 * a view like `markets(uint256)` or `getBelief(uint256)` returning a
 * struct containing the question string. We don't hardcode the getter —
 * we look for it in whatever ABI we actually have, then resolve every id
 * in one Multicall3 round-trip.
 *
 * As of VERIFICATION.md, the BeliefMarket impl is unverified anywhere and
 * the proxy's own verified ABI is the minimal ERC1967 stub (constructor,
 * errors, Upgraded, fallback — zero view functions). So this currently
 * finds nothing. It's kept because it's cheap, harmless, and starts
 * working automatically the moment the impl is verified or an API key
 * resolves it — no code change needed then.
 */

const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

const multicall3Abi = [
  {
    name: "aggregate3",
    type: "function",
    stateMutability: "payable",
    inputs: [
      {
        name: "calls",
        type: "tuple[]",
        components: [
          { name: "target", type: "address" },
          { name: "allowFailure", type: "bool" },
          { name: "callData", type: "bytes" },
        ],
      },
    ],
    outputs: [
      {
        name: "returnData",
        type: "tuple[]",
        components: [
          { name: "success", type: "bool" },
          { name: "returnData", type: "bytes" },
        ],
      },
    ],
  },
] as const;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function outputsContainString(outputs: any[] | undefined): boolean {
  if (!outputs) return false;
  for (const o of outputs) {
    if (o?.type === "string") return true;
    if (Array.isArray(o?.components) && outputsContainString(o.components)) {
      return true;
    }
  }
  return false;
}

/** Finds candidate `f(uint256) -> ...string...` view getters, best first. */
export function findTextGetters(abi: unknown[]): AbiFunction[] {
  const fns = (abi as AbiFunction[]).filter(
    (f) =>
      f?.type === "function" &&
      (f.stateMutability === "view" || f.stateMutability === "pure") &&
      f.inputs?.length === 1 &&
      f.inputs[0]?.type === "uint256" &&
      outputsContainString(f.outputs as unknown[]),
  );
  const score = (f: AbiFunction) =>
    /market|belief|question|statement|opinion|get/i.test(f.name) ? 0 : 1;
  return fns.sort((a, b) => score(a) - score(b));
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function firstHumanString(value: any): string | undefined {
  if (typeof value === "string") {
    const s = value.trim();
    if (s.length >= 4 && !s.startsWith("0x") && /[a-zA-Z]/.test(s)) return s;
    return undefined;
  }
  if (Array.isArray(value)) {
    for (const v of value) {
      const s = firstHumanString(v);
      if (s) return s;
    }
  }
  if (value && typeof value === "object") {
    for (const v of Object.values(value)) {
      const s = firstHumanString(v);
      if (s) return s;
    }
  }
  return undefined;
}

const cache = new Map<string, string>(); // beliefId -> text
const dead = new Set<string>(); // ids the getter returned nothing for

/**
 * Resolves belief text for numeric belief ids by calling the discovered
 * getter on the BeliefMarket proxy via Multicall3.
 */
export async function resolveBeliefTextsFromMarket(
  abiResults: AbiFetchResult[],
  beliefIds: string[],
): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const numericIds = beliefIds.filter((id) => /^\d+$/.test(id));
  for (const id of numericIds) {
    const hit = cache.get(id);
    if (hit) out.set(id, hit);
  }
  const missing = numericIds.filter((id) => !cache.has(id) && !dead.has(id));
  if (!missing.length) return out;

  // Use the implementation's ABI (proxy delegates to it), call the proxy.
  const impl = abiResults.find(
    (r) =>
      r.ok &&
      r.abi &&
      [POV_CONTRACTS.beliefMarketImpl, POV_CONTRACTS.beliefMarketProxy]
        .map((a) => a.toLowerCase())
        .includes(r.address),
  );
  if (!impl?.abi) return out;
  const getters = findTextGetters(impl.abi).slice(0, 3);
  if (!getters.length) return out;

  for (const getter of getters) {
    const unresolved = missing.filter((id) => !cache.has(id));
    if (!unresolved.length) break;
    try {
      const data = encodeFunctionData({
        abi: multicall3Abi,
        functionName: "aggregate3",
        args: [
          unresolved.map((id) => ({
            target: POV_CONTRACTS.beliefMarketProxy as `0x${string}`,
            allowFailure: true,
            callData: encodeFunctionData({
              abi: [getter],
              functionName: getter.name,
              args: [BigInt(id)],
            }),
          })),
        ],
      });
      const raw = await rpc<string>("eth_call", [{ to: MULTICALL3, data }, "latest"]);
      const results = decodeFunctionResult({
        abi: multicall3Abi,
        functionName: "aggregate3",
        data: raw as `0x${string}`,
      });
      results.forEach((r, i) => {
        if (!r.success || r.returnData === "0x") return;
        try {
          const decoded = decodeFunctionResult({
            abi: [getter],
            functionName: getter.name,
            data: r.returnData,
          });
          const text = firstHumanString(decoded);
          if (text) cache.set(unresolved[i], text);
        } catch {
          /* wrong getter for this id — try next */
        }
      });
    } catch {
      /* multicall failed — try next getter */
    }
  }

  for (const id of missing) {
    const v = cache.get(id);
    if (v) out.set(id, v);
    else dead.add(id); // don't hammer the RPC for ids with no text
  }
  return out;
}
