import { decodeAbiParameters, decodeFunctionResult, encodeFunctionData } from "viem";
import { rpc } from "./rpc";

/**
 * Belief tokens on POV are per-belief ERC20 clones. Their `name()` IS the
 * belief text — the single most useful piece of content the old dashboard
 * never read. One Multicall3 round-trip resolves every discovered token.
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

const NAME_CALLDATA = encodeFunctionData({
  abi: [
    {
      name: "name",
      type: "function",
      stateMutability: "view",
      inputs: [],
      outputs: [{ type: "string" }],
    },
  ],
  functionName: "name",
});

const cache = new Map<string, string>();

/** Resolves `name()` for many token addresses in a single eth_call. */
export async function resolveBeliefNames(tokens: string[]): Promise<Map<string, string>> {
  const missing = tokens.map((t) => t.toLowerCase()).filter((t) => t && !cache.has(t));
  const unique = [...new Set(missing)];

  if (unique.length) {
    try {
      const data = encodeFunctionData({
        abi: multicall3Abi,
        functionName: "aggregate3",
        args: [
          unique.map((target) => ({
            target: target as `0x${string}`,
            allowFailure: true,
            callData: NAME_CALLDATA,
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
          const [name] = decodeAbiParameters([{ type: "string" }], r.returnData);
          if (name) cache.set(unique[i], name);
        } catch {
          /* non-string name — skip */
        }
      });
    } catch {
      /* leave unresolved; UI falls back to Belief #id */
    }
  }

  const out = new Map<string, string>();
  for (const t of tokens) {
    const v = cache.get(t.toLowerCase());
    if (v) out.set(t.toLowerCase(), v);
  }
  return out;
}
