import { createServerFn } from "@tanstack/react-start";

// Loose ABI item shape — viem re-parses it on the client anyway.
// Kept JSON-serializable so it can cross the server-fn RPC boundary.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AbiItem = Record<string, any>;

export interface AbiFetchResult {
  address: string; // lowercase
  ok: boolean;
  abi: AbiItem[] | null;
  error?: string;
  isProxy: boolean;
  implementation?: string; // lowercase, when detected
}

/**
 * Fetches verified ABIs from Etherscan v2 for a set of addresses on a chain.
 * If a contract is an EIP-1967 proxy, also resolves and fetches the
 * implementation ABI (per Etherscan's `getsourcecode` proxy detection).
 */
export const fetchAbis = createServerFn({ method: "POST" })
  .inputValidator(
    (input: { chainId: number; addresses: string[] }) => {
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
    },
  )
  .handler(async ({ data }): Promise<AbiFetchResult[]> => {
    const apiKey = process.env.ETHERSCAN_API_KEY;
    if (!apiKey) {
      return data.addresses.map((a) => ({
        address: a,
        ok: false,
        abi: null,
        error: "ETHERSCAN_API_KEY not configured",
        isProxy: false,
      }));
    }

    const base = "https://api.etherscan.io/v2/api";
    const results: AbiFetchResult[] = [];

    // Serial fetch to stay well under 5 req/sec free-tier cap.
    for (const addr of data.addresses) {
      try {
        const srcUrl = `${base}?chainid=${data.chainId}&module=contract&action=getsourcecode&address=${addr}&apikey=${apiKey}`;
        const r = await fetch(srcUrl);
        const j = (await r.json()) as {
          status: string;
          message: string;
          result?: Array<{
            ABI?: string;
            Proxy?: string;
            Implementation?: string;
          }>;
        };
        if (j.status !== "1" || !j.result?.length) {
          results.push({
            address: addr,
            ok: false,
            abi: null,
            error: j.message || "not verified",
            isProxy: false,
          });
          continue;
        }
        const entry = j.result[0];
        const isProxy = entry.Proxy === "1";
        const impl = entry.Implementation?.toLowerCase() || undefined;
        const abiRaw = entry.ABI ?? "";
        let abi: AbiItem[] | null = null;
        if (abiRaw && abiRaw !== "Contract source code not verified") {
          try {
            abi = JSON.parse(abiRaw) as AbiItem[];
          } catch {
            abi = null;
          }
        }

        // If proxy AND implementation is separately verified, fetch its ABI too
        if (isProxy && impl && (!abi || abi.length < 3)) {
          try {
            const iUrl = `${base}?chainid=${data.chainId}&module=contract&action=getabi&address=${impl}&apikey=${apiKey}`;
            const ir = await fetch(iUrl);
            const ij = (await ir.json()) as {
              status: string;
              result: string;
            };
            if (ij.status === "1") {
              try {
                abi = JSON.parse(ij.result) as AbiItem[];
              } catch {
                /* keep original */
              }
            }
          } catch {
            /* noop */
          }
        }

        results.push({
          address: addr,
          ok: !!abi,
          abi,
          isProxy,
          implementation: impl,
          error: abi ? undefined : "no ABI available",
        });
      } catch (e) {
        results.push({
          address: addr,
          ok: false,
          abi: null,
          error: (e as Error).message,
          isProxy: false,
        });
      }
    }

    return results;
  });
