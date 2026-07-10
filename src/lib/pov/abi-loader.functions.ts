import { createServerFn } from "@tanstack/react-start";

// Loose ABI item shape — viem re-parses it on the client anyway.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AbiItem = Record<string, any>;

export interface AbiFetchResult {
  address: string; // lowercase
  ok: boolean;
  abi: AbiItem[] | null;
  error?: string;
  isProxy: boolean;
  implementation?: string; // lowercase, when detected
  source?: "etherscan" | "blockscout";
}

/**
 * ABI resolution with no required config:
 *   1. Blockscout (base.blockscout.com) — keyless, tried first
 *   2. Etherscan v2 — only if ETHERSCAN_API_KEY is set
 * Results are cached in server memory for 24h so every viewer shares them.
 */

const cache = new Map<string, { at: number; result: AbiFetchResult }>();
const CACHE_MS = 24 * 60 * 60 * 1000;

function parseAbi(raw: string | undefined | null): AbiItem[] | null {
  if (!raw || raw === "Contract source code not verified") return null;
  try {
    const parsed = JSON.parse(raw) as AbiItem[];
    return Array.isArray(parsed) && parsed.length ? parsed : null;
  } catch {
    return null;
  }
}

async function fromBlockscout(addr: string): Promise<AbiFetchResult> {
  const base = "https://base.blockscout.com/api";
  const out: AbiFetchResult = {
    address: addr,
    ok: false,
    abi: null,
    isProxy: false,
    source: "blockscout",
  };
  try {
    const sr = await fetch(`${base}?module=contract&action=getsourcecode&address=${addr}`);
    const sj = (await sr.json()) as {
      status: string;
      result?: Array<{
        ABI?: string;
        IsProxy?: string;
        Proxy?: string;
        ImplementationAddress?: string;
        Implementation?: string;
      }>;
    };
    const entry = sj.status === "1" ? sj.result?.[0] : undefined;
    if (entry) {
      out.abi = parseAbi(entry.ABI);
      out.isProxy = entry.IsProxy === "true" || entry.Proxy === "1";
      const impl = (entry.ImplementationAddress || entry.Implementation || "").toLowerCase();
      if (impl && impl !== "0x" && impl.length === 42) out.implementation = impl;
    }
    // Proxy with unusable ABI → pull the implementation's ABI.
    if ((!out.abi || out.abi.length < 3) && out.implementation) {
      const ir = await fetch(`${base}?module=contract&action=getabi&address=${out.implementation}`);
      const ij = (await ir.json()) as { status: string; result?: string };
      if (ij.status === "1") out.abi = parseAbi(ij.result) ?? out.abi;
    }
    out.ok = !!out.abi;
    if (!out.ok) out.error = "not verified on Blockscout";
  } catch (e) {
    out.error = (e as Error).message;
  }
  return out;
}

async function fromEtherscan(
  addr: string,
  chainId: number,
  apiKey: string,
): Promise<AbiFetchResult> {
  const base = "https://api.etherscan.io/v2/api";
  const out: AbiFetchResult = {
    address: addr,
    ok: false,
    abi: null,
    isProxy: false,
    source: "etherscan",
  };
  try {
    const r = await fetch(
      `${base}?chainid=${chainId}&module=contract&action=getsourcecode&address=${addr}&apikey=${apiKey}`,
    );
    const j = (await r.json()) as {
      status: string;
      message: string;
      result?: Array<{ ABI?: string; Proxy?: string; Implementation?: string }>;
    };
    const entry = j.status === "1" ? j.result?.[0] : undefined;
    if (!entry) {
      out.error = j.message || "not verified";
      return out;
    }
    out.isProxy = entry.Proxy === "1";
    out.implementation = entry.Implementation?.toLowerCase() || undefined;
    out.abi = parseAbi(entry.ABI);
    if (out.isProxy && out.implementation && (!out.abi || out.abi.length < 3)) {
      const ir = await fetch(
        `${base}?chainid=${chainId}&module=contract&action=getabi&address=${out.implementation}&apikey=${apiKey}`,
      );
      const ij = (await ir.json()) as { status: string; result: string };
      if (ij.status === "1") out.abi = parseAbi(ij.result) ?? out.abi;
    }
    out.ok = !!out.abi;
    if (!out.ok) out.error = "no ABI available";
  } catch (e) {
    out.error = (e as Error).message;
  }
  return out;
}

export const fetchAbis = createServerFn({ method: "POST" })
  .inputValidator((input: { chainId: number; addresses: string[] }) => {
    if (!input || typeof input.chainId !== "number") {
      throw new Error("chainId is required");
    }
    if (!Array.isArray(input.addresses) || input.addresses.length === 0) {
      throw new Error("addresses[] required");
    }
    return {
      chainId: input.chainId,
      addresses: input.addresses.map((a) => a.toLowerCase()),
    };
  })
  .handler(async ({ data }): Promise<AbiFetchResult[]> => {
    const apiKey = process.env.ETHERSCAN_API_KEY;
    const results: AbiFetchResult[] = [];

    for (const addr of data.addresses) {
      const hit = cache.get(addr);
      if (hit && hit.result.ok && Date.now() - hit.at < CACHE_MS) {
        results.push(hit.result);
        continue;
      }
      // Blockscout first (keyless), Etherscan as backup when a key exists.
      let result = await fromBlockscout(addr);
      if (!result.ok && apiKey) {
        result = await fromEtherscan(addr, data.chainId, apiKey);
      }
      if (result.ok) cache.set(addr, { at: Date.now(), result });
      results.push(result);
    }

    return results;
  });
