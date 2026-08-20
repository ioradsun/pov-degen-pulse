import { createFileRoute } from "@tanstack/react-router";
import { POV_CONTRACTS, POV_CORE_SIGS } from "@/lib/pov/constants";

// One-off backfill for sells missed while the indexer only knew the pre-upgrade
// TokensSold signature. Scans a block range for the v2 sell topic and inserts
// any missing trades. Does NOT move the indexer cursor.

const CHAIN_ID = 8453;
const RPC_URLS = [
  "https://base-rpc.publicnode.com",
  "https://base.llamarpc.com",
  "https://base.drpc.org",
  "https://mainnet.base.org",
];

function words(data: string): string[] {
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  const out: string[] = [];
  for (let i = 0; i + 64 <= hex.length; i += 64) out.push(hex.slice(i, i + 64));
  return out;
}
const toBigInt = (h: string) => BigInt(h.startsWith("0x") ? h : `0x${h}`);
const topicAddr = (t?: string) => (t && t.length >= 42 ? `0x${t.slice(-40)}`.toLowerCase() : "0x");

type RawLog = {
  address: string;
  topics: string[];
  data: string;
  blockNumber: string;
  transactionHash: string;
  logIndex: string;
};

async function rpc<T>(method: string, params: unknown[]): Promise<T> {
  let lastErr: unknown;
  for (const url of RPC_URLS) {
    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
        signal: AbortSignal.timeout(15000),
      });
      const json = (await res.json()) as { result?: T; error?: { message: string } };
      if (json.error) throw new Error(json.error.message);
      return json.result as T;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
}

/** Daily ETH/USD from DefiLlama, cached per UTC day within a run. */
async function ethUsdAt(tsSec: number, cache: Map<string, number | null>) {
  const day = new Date(tsSec * 1000).toISOString().slice(0, 10);
  if (cache.has(day)) return cache.get(day) ?? null;
  let price: number | null = null;
  try {
    const res = await fetch(
      `https://coins.llama.fi/prices/historical/${tsSec}/coingecko:ethereum`,
      { signal: AbortSignal.timeout(8000) },
    );
    const json = (await res.json()) as {
      coins?: Record<string, { price?: number }>;
    };
    const p = json.coins?.["coingecko:ethereum"]?.price;
    if (typeof p === "number" && p > 0) price = p;
  } catch {
    price = null;
  }
  cache.set(day, price);
  return price;
}

export const Route = createFileRoute("/api/public/hooks/backfill-sells")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const apiKey = request.headers.get("apikey");
        if (!apiKey || apiKey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return Response.json({ error: "unauthorized" }, { status: 401 });
        }
        const url = new URL(request.url);
        const step = Math.min(Number(url.searchParams.get("step") ?? 2000), 5000);
        const head = Number(await rpc<string>("eth_blockNumber", []));
        const from = Number(url.searchParams.get("from") ?? 0);
        if (!from) return Response.json({ error: "from block required" }, { status: 400 });
        const to = Math.min(from + step - 1, head - 1);
        if (from > to) return Response.json({ done: true, head });

        const logs = await rpc<RawLog[]>("eth_getLogs", [
          {
            address: POV_CONTRACTS.beliefMarketProxy.toLowerCase(),
            topics: [[POV_CORE_SIGS.sellV2]],
            fromBlock: `0x${from.toString(16)}`,
            toBlock: `0x${to.toString(16)}`,
          },
        ]);

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // Block timestamps for the touched blocks.
        const blockNums = Array.from(new Set(logs.map((l) => l.blockNumber)));
        const tsMap = new Map<string, number>();
        for (const bn of blockNums) {
          const b = await rpc<{ timestamp: string }>("eth_getBlockByNumber", [bn, false]);
          tsMap.set(bn, Number(BigInt(b.timestamp)));
        }

        const priceCache = new Map<string, number | null>();
        const rows: Record<string, unknown>[] = [];
        for (const l of logs) {
          const beliefId = l.topics[1] ? Number(toBigInt(l.topics[1])) : null;
          if (!beliefId) continue;
          const ts = tsMap.get(l.blockNumber) ?? Math.floor(Date.now() / 1000);
          const w = words(l.data);
          const tokens = w[2] ? toBigInt(w[2]) : 0n;
          const grossWei = w[3] ? toBigInt(w[3]) : 0n;
          const ethUsd = await ethUsdAt(ts, priceCache);
          rows.push({
            event_id: `${CHAIN_ID}:${l.transactionHash}:${Number(BigInt(l.logIndex))}`,
            chain_id: CHAIN_ID,
            tx_hash: l.transactionHash,
            log_index: Number(BigInt(l.logIndex)),
            block_number: Number(BigInt(l.blockNumber)),
            block_timestamp: new Date(ts * 1000).toISOString(),
            belief_id: beliefId,
            wallet_address: topicAddr(l.topics[2]),
            action: "sell",
            side: w[1] && toBigInt(w[1]) === 1n ? "yes" : "no",
            gross_amount_native: grossWei.toString(),
            gross_amount_usd: ethUsd ? (Number(grossWei) / 1e18) * ethUsd : null,
            tokens_delta: tokens.toString(),
            payment_token: "0x0000000000000000000000000000000000000000",
            payment_token_symbol: "ETH",
            is_canonical: true,
            is_confirmed: true,
          });
        }

        let inserted = 0;
        if (rows.length) {
          const ids = Array.from(new Set(rows.map((r) => r.belief_id as number)));
          const { data: existingBeliefs } = await supabaseAdmin
            .from("beliefs")
            .select("belief_id")
            .in("belief_id", ids);
          const known = new Set((existingBeliefs ?? []).map((b) => b.belief_id as number));
          const stubs = ids
            .filter((id) => !known.has(id))
            .map((id) => {
              const first = rows.find((r) => r.belief_id === id)!;
              return {
                belief_id: id,
                chain_id: CHAIN_ID,
                market_address: POV_CONTRACTS.beliefMarketProxy.toLowerCase(),
                creator_address: "0x0000000000000000000000000000000000000000",
                title: null,
                raw_title_source: "backfill_stub",
                is_ai_generated: false,
                created_block: first.block_number,
                created_at: first.block_timestamp,
                creation_tx_hash: first.tx_hash,
                creation_log_index: 0,
              };
            });
          if (stubs.length) {
            await supabaseAdmin
              .from("beliefs")
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .upsert(stubs as any, { onConflict: "belief_id", ignoreDuplicates: true });
          }
          const { error } = await supabaseAdmin
            .from("trades")
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .upsert(rows as any, { onConflict: "event_id", ignoreDuplicates: true });
          if (error) return Response.json({ error: error.message }, { status: 500 });
          inserted = rows.length;
        }

        return Response.json({
          ok: true,
          from,
          to,
          head,
          logs: logs.length,
          inserted,
          next_from: to + 1,
          done: to >= head - 1,
        });
      },
    },
  },
});
