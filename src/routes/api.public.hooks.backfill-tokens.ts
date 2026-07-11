/**
 * One-shot / cron-safe backfill for `trades.tokens_delta`.
 *
 * The indexer now writes `tokens_delta` (word2 of TokensBought /
 * TokensSold, in 18-dec token units — see VERIFICATION.md) on every new
 * trade. This route walks historical rows where the column is NULL,
 * re-fetches their transaction receipts, and fills the value in from the
 * matching log by (tx_hash, log_index).
 *
 * Safe to call repeatedly. Bounded per tick so it fits inside Worker
 * limits. Auth: Supabase publishable key in the `apikey` header, same as
 * the other public hook routes.
 */
import { createFileRoute } from "@tanstack/react-router";
import { createPublicClient, http } from "viem";
import { base } from "viem/chains";
import { POV_CORE_SIGS } from "@/lib/pov/constants";

const LOCK_KEY = 987002;
const MAX_TRADES_PER_TICK = 400;
const MAX_TX_CONCURRENCY = 8;

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
function toBigInt(hex: string): bigint {
  return BigInt(hex.startsWith("0x") ? hex : `0x${hex}`);
}

const BUY = POV_CORE_SIGS.buy.toLowerCase();
const SELL = POV_CORE_SIGS.sell.toLowerCase();

export const Route = createFileRoute("/api/public/hooks/backfill-tokens")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const apiKey = request.headers.get("apikey");
        if (!apiKey || apiKey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const rpcOverride = process.env.ALCHEMY_BASE_RPC_URL;
        const rpcList = rpcOverride ? [rpcOverride, ...RPC_URLS] : RPC_URLS;
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        const { data: gotLock } = await supabaseAdmin.rpc(
          "pg_try_advisory_lock" as never,
          { key: LOCK_KEY } as never,
        );
        if (gotLock === false) return Response.json({ skipped: "locked" });

        try {
          const { data: rows, error } = await supabaseAdmin
            .from("trades")
            .select("event_id, tx_hash, log_index")
            .is("tokens_delta", null)
            .in("action", ["buy", "sell"])
            .order("block_number", { ascending: false })
            .limit(MAX_TRADES_PER_TICK);
          if (error) throw error;

          const trades = (rows ?? []) as Array<{
            event_id: string;
            tx_hash: string;
            log_index: number;
          }>;
          if (trades.length === 0) {
            return Response.json({ ok: true, remaining: 0, updated: 0 });
          }

          const uniqueHashes = Array.from(new Set(trades.map((t) => t.tx_hash.toLowerCase())));

          async function withRpc<T>(fn: (url: string) => Promise<T>): Promise<T> {
            let lastErr: unknown;
            for (const url of rpcList) {
              try {
                return await fn(url);
              } catch (e) {
                lastErr = e;
              }
            }
            throw lastErr instanceof Error ? lastErr : new Error(String(lastErr));
          }

          // Map: `${txHash}:${logIndex}` -> word2 as decimal string
          const wordMap = new Map<string, string>();

          // Fetch receipts with limited concurrency.
          let cursor = 0;
          async function worker() {
            while (cursor < uniqueHashes.length) {
              const idx = cursor++;
              const h = uniqueHashes[idx] as `0x${string}`;
              try {
                const receipt = await withRpc(async (url) => {
                  const c = createPublicClient({
                    chain: base,
                    transport: http(url, { timeout: 8000 }),
                  });
                  return c.getTransactionReceipt({ hash: h });
                });
                for (const log of receipt.logs) {
                  const topic0 = (log.topics?.[0] ?? "").toLowerCase();
                  if (topic0 !== BUY && topic0 !== SELL) continue;
                  const ws = words(log.data);
                  if (!ws[2]) continue;
                  const key = `${log.transactionHash.toLowerCase()}:${Number(log.logIndex)}`;
                  wordMap.set(key, toBigInt(ws[2]).toString());
                }
              } catch {
                // Skip; will retry on next tick.
              }
            }
          }
          await Promise.all(
            Array.from({ length: Math.min(MAX_TX_CONCURRENCY, uniqueHashes.length) }, worker),
          );

          let updated = 0;
          // Update each trade individually — simple, correct, and bounded
          // by MAX_TRADES_PER_TICK. Postgrest doesn't do multi-row UPDATE
          // in one call without a table-values CTE.
          for (const t of trades) {
            const key = `${t.tx_hash.toLowerCase()}:${Number(t.log_index)}`;
            const val = wordMap.get(key);
            if (val == null) continue;
            const { error: upErr } = await supabaseAdmin
              .from("trades")
              .update({ tokens_delta: val })
              .eq("event_id", t.event_id);
            if (!upErr) updated += 1;
          }

          const { count: remaining } = await supabaseAdmin
            .from("trades")
            .select("event_id", { count: "exact", head: true })
            .is("tokens_delta", null)
            .in("action", ["buy", "sell"]);

          return Response.json({
            ok: true,
            scanned_trades: trades.length,
            scanned_txs: uniqueHashes.length,
            updated,
            remaining: remaining ?? null,
            duration_ms: Date.now() - startedAt,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return Response.json(
            { error: msg, duration_ms: Date.now() - startedAt },
            { status: 500 },
          );
        } finally {
          await supabaseAdmin.rpc("pg_advisory_unlock" as never, {
            key: LOCK_KEY,
          } as never);
        }
      },
    },
  },
});
