import { createFileRoute } from "@tanstack/react-router";
import { createPublicClient, http, type Log } from "viem";
import { base } from "viem/chains";
import {
  POV_CONTRACTS,
  POV_CORE_SIGS,
} from "@/lib/pov/constants";

const CHAIN_ID = 8453;
const LOCK_KEY = 987001; // stable advisory-lock id for this indexer
const MAX_BLOCK_RANGE = 800; // publicnode allows large ranges; keep conservative
const CONFIRMATIONS = 1;
const START_LOOKBACK = 43_200; // ~24h at 2s Base blocks — one-shot backfill on cursor reset

// RPCs, in order. First one wins; on getLogs range errors we auto-shrink.
// Alchemy free tier caps getLogs at 10 blocks, so we prefer public RPCs
// that permit large ranges for the indexer even when Alchemy is set.
const RPC_URLS = [
  "https://base-rpc.publicnode.com",
  "https://base.llamarpc.com",
  "https://base.drpc.org",
  "https://mainnet.base.org",
];

const TRACKED_ADDRS = [
  POV_CONTRACTS.beliefMarketProxy.toLowerCase() as `0x${string}`,
  POV_CONTRACTS.linearCurve.toLowerCase() as `0x${string}`,
  POV_CONTRACTS.cpCurve.toLowerCase() as `0x${string}`,
  POV_CONTRACTS.degenBoost.toLowerCase() as `0x${string}`,
];

const CORE_TOPICS = [
  POV_CORE_SIGS.created as `0x${string}`,
  POV_CORE_SIGS.buy as `0x${string}`,
  POV_CORE_SIGS.sell as `0x${string}`,
];

/** 32-byte word slicer for raw log data blobs. */
function words(data: string): string[] {
  const hex = data.startsWith("0x") ? data.slice(2) : data;
  const out: string[] = [];
  for (let i = 0; i + 64 <= hex.length; i += 64) out.push(hex.slice(i, i + 64));
  return out;
}
function toBigInt(hex: string): bigint {
  return BigInt(hex.startsWith("0x") ? hex : `0x${hex}`);
}
function topicAddr(t: string | undefined): string | null {
  return t && t.length >= 42 ? `0x${t.slice(-40)}`.toLowerCase() : null;
}
function wordAddr(w: string | undefined): string | null {
  return w ? `0x${w.slice(-40)}`.toLowerCase() : null;
}

async function fetchEthUsd(): Promise<number | null> {
  try {
    const res = await fetch("https://api.coinbase.com/v2/prices/ETH-USD/spot", {
      signal: AbortSignal.timeout(3000),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { data?: { amount?: string } };
    const n = Number(json.data?.amount);
    return Number.isFinite(n) && n > 0 ? n : null;
  } catch {
    return null;
  }
}

export const Route = createFileRoute("/api/public/hooks/index-tick")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();

        // Auth: pg_cron passes the Supabase publishable key in `apikey`.
        const apiKey = request.headers.get("apikey");
        if (!apiKey || apiKey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        const rpcOverride = process.env.ALCHEMY_BASE_RPC_URL;
        // If user set an override, still keep the public RPCs as fallbacks
        // for getLogs (Alchemy free tier limits ranges to 10 blocks).
        const rpcList = rpcOverride ? [rpcOverride, ...RPC_URLS] : RPC_URLS;

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

        // 1. Advisory lock — skip this tick if a prior tick is still running.
        const { data: gotLock } = await supabaseAdmin.rpc("pg_try_advisory_lock" as never, {
          key: LOCK_KEY,
        } as never);
        if (gotLock === false) {
          return Response.json({ skipped: "locked" });
        }

        try {
          // 2. Load cursor.
          const { data: stateRow, error: stateErr } = await supabaseAdmin
            .from("indexer_state")
            .select("last_indexed_block")
            .eq("chain_id", CHAIN_ID)
            .maybeSingle();
          if (stateErr) throw stateErr;
          const cursor = BigInt(stateRow?.last_indexed_block ?? 0);

          // Helper: try each RPC until one succeeds. Records last error.
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

          const head = await withRpc(async (url) => {
            const c = createPublicClient({
              chain: base,
              transport: http(url, { timeout: 8000 }),
            });
            return c.getBlockNumber();
          });
          const safeHead = head - BigInt(CONFIRMATIONS);

          const fromBlock =
            cursor === 0n ? safeHead - BigInt(START_LOOKBACK) : cursor + 1n;
          if (fromBlock > safeHead) {
            await supabaseAdmin
              .from("indexer_state")
              .update({ last_indexed_at: new Date().toISOString(), last_error: null })
              .eq("chain_id", CHAIN_ID);
            return Response.json({
              skipped: "no new blocks",
              cursor: Number(cursor),
              head: Number(safeHead),
            });
          }
          const toBlock =
            fromBlock + BigInt(MAX_BLOCK_RANGE) < safeHead
              ? fromBlock + BigInt(MAX_BLOCK_RANGE)
              : safeHead;

          // 3. Fetch logs — pass topic0 as an OR filter so the RPC does the work.
          // viem's `topics` accepts a 2D array: outer = positional, inner = OR.
          const logs: Log[] = await withRpc(async (url) => {
            const c = createPublicClient({
              chain: base,
              transport: http(url, { timeout: 10000 }),
            });
            return c.request({
              method: "eth_getLogs",
              params: [
                {
                  address: TRACKED_ADDRS,
                  topics: [CORE_TOPICS],
                  fromBlock: `0x${fromBlock.toString(16)}`,
                  toBlock: `0x${toBlock.toString(16)}`,
                },
              ],
            } as never) as Promise<Log[]>;
          });
          const povLogs = logs; // already filtered by topic0 server-side

          // Track which RPC succeeded for enrichment (tx.value + block ts).
          const enrichClient = createPublicClient({
            chain: base,
            transport: http(rpcList[0], { timeout: 8000 }),
          });


          // 4. Enrich: unique tx.value + block timestamps for the touched blocks.
          const uniqueTxs = Array.from(
            new Set(povLogs.map((l) => l.transactionHash!.toLowerCase())),
          );
          const uniqueBlocks = Array.from(
            new Set(povLogs.map((l) => l.blockNumber!.toString())),
          );
          const [txValues, blockTs] = await Promise.all([
            Promise.all(
              uniqueTxs.map(async (h) => {
                try {
                  const tx = await enrichClient.getTransaction({ hash: h as `0x${string}` });
                  return [h, tx.value] as const;
                } catch {
                  return [h, 0n] as const;
                }
              }),
            ),
            Promise.all(
              uniqueBlocks.map(async (n) => {
                try {
                  const b = await enrichClient.getBlock({ blockNumber: BigInt(n) });
                  return [n, Number(b.timestamp)] as const;
                } catch {
                  return [n, Math.floor(Date.now() / 1000)] as const;
                }
              }),
            ),
          ]);
          const txValueMap = new Map(txValues);
          const tsMap = new Map(blockTs);

          const ethUsd = await fetchEthUsd();
          if (ethUsd) {
            await supabaseAdmin.from("price_ticks").insert({
              token: "ETH",
              source: "coinbase",
              usd_price: ethUsd,
              block_timestamp: new Date().toISOString(),
            });
          }

          // 5. Build inserts.
          const beliefsToInsert: Array<Record<string, unknown>> = [];
          const tradesToInsert: Array<Record<string, unknown>> = [];
          const creatorsToUpsert = new Map<string, { at: number }>();

          for (const l of povLogs) {
            const topic0 = (l.topics?.[0] ?? "").toLowerCase();
            const beliefId = l.topics?.[1] ? toBigInt(l.topics[1]).toString() : null;
            if (!beliefId) continue;
            const actor = topicAddr(l.topics?.[2]) ?? "0x";
            const bn = Number(l.blockNumber);
            const ts = tsMap.get(l.blockNumber!.toString()) ?? Math.floor(Date.now() / 1000);
            const eventId = `${CHAIN_ID}:${l.transactionHash}:${l.logIndex}`;
            const ws = words(l.data);

            if (topic0 === POV_CORE_SIGS.created.toLowerCase()) {
              beliefsToInsert.push({
                belief_id: Number(beliefId),
                chain_id: CHAIN_ID,
                market_address: l.address.toLowerCase(),
                creator_address: actor,
                title: null, // hydrator (later) fills this
                raw_title_source: null,
                is_ai_generated: false,
                created_block: bn,
                created_at: new Date(ts * 1000).toISOString(),
                creation_tx_hash: l.transactionHash,
                creation_log_index: l.logIndex,
              });
              creatorsToUpsert.set(actor, { at: ts });
              continue;
            }

            const isBuy = topic0 === POV_CORE_SIGS.buy.toLowerCase();
            const isSell = topic0 === POV_CORE_SIGS.sell.toLowerCase();
            if (!isBuy && !isSell) continue;

            const side = ws[1] && toBigInt(ws[1]) === 1n ? "yes" : "no";
            const grossWei = isBuy
              ? txValueMap.get(l.transactionHash!.toLowerCase()) ?? 0n
              : ws[3]
                ? toBigInt(ws[3])
                : 0n;
            const grossEth = Number(grossWei) / 1e18;
            const grossUsd = ethUsd ? grossEth * ethUsd : null;

            tradesToInsert.push({
              event_id: eventId,
              chain_id: CHAIN_ID,
              tx_hash: l.transactionHash,
              log_index: l.logIndex,
              block_number: bn,
              block_timestamp: new Date(ts * 1000).toISOString(),
              belief_id: Number(beliefId),
              wallet_address: actor,
              action: isBuy ? "buy" : "sell",
              side,
              gross_amount_native: grossWei.toString(),
              gross_amount_usd: grossUsd,
              payment_token: "0x0000000000000000000000000000000000000000",
              payment_token_symbol: "ETH",
              is_canonical: true,
              is_confirmed: true,
            });
          }

          // 6. Upserts. Beliefs first (FK from trades).
          //
          // Backfill safety: a trade may reference a belief_id whose
          // `created` event was emitted before our scan window. Insert a
          // stub row for any such id so the FK holds; the hydrator can
          // fill title/creator later.
          const knownIds = new Set<number>(
            beliefsToInsert.map((b) => b.belief_id as number),
          );
          const orphanBeliefIds = new Set<number>();
          for (const t of tradesToInsert) {
            const id = t.belief_id as number;
            if (!knownIds.has(id)) orphanBeliefIds.add(id);
          }
          if (orphanBeliefIds.size) {
            const { data: existing } = await supabaseAdmin
              .from("beliefs")
              .select("belief_id")
              .in("belief_id", Array.from(orphanBeliefIds));
            const existingIds = new Set<number>(
              (existing ?? []).map((r) => r.belief_id as number),
            );
            for (const id of orphanBeliefIds) {
              if (existingIds.has(id)) continue;
              const firstTrade = tradesToInsert.find((t) => t.belief_id === id)!;
              beliefsToInsert.push({
                belief_id: id,
                chain_id: CHAIN_ID,
                market_address: POV_CONTRACTS.beliefMarketProxy.toLowerCase(),
                creator_address: "0x0000000000000000000000000000000000000000",
                title: null,
                raw_title_source: "backfill_stub",
                is_ai_generated: false,
                created_block: firstTrade.block_number,
                created_at: firstTrade.block_timestamp,
                creation_tx_hash: firstTrade.tx_hash,
                creation_log_index: 0,
              });
            }
          }

          if (beliefsToInsert.length) {
            // Split real created events from backfill stubs. Real events
            // must overwrite any pre-existing stub row (so created_at gets
            // corrected). Stubs must NEVER overwrite an existing row.
            const realCreated = beliefsToInsert.filter(
              (b) => b.raw_title_source !== "backfill_stub",
            );
            const stubs = beliefsToInsert.filter(
              (b) => b.raw_title_source === "backfill_stub",
            );
            if (realCreated.length) {
              const { error } = await supabaseAdmin
                .from("beliefs")
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .upsert(realCreated as any, { onConflict: "belief_id" });
              if (error) throw error;
            }
            if (stubs.length) {
              const { error } = await supabaseAdmin
                .from("beliefs")
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                .upsert(stubs as any, { onConflict: "belief_id", ignoreDuplicates: true });
              if (error) throw error;
            }
          }
          if (creatorsToUpsert.size) {
            const rows = Array.from(creatorsToUpsert.entries()).map(([addr, { at }]) => ({
              creator_address: addr,
              first_market_at: new Date(at * 1000).toISOString(),
              markets_created: 1,
              avg_market_volume_usd: 0,
              total_earned_usd: 0,
            }));
            await supabaseAdmin
              .from("creators")
              .upsert(rows, { onConflict: "creator_address", ignoreDuplicates: true });
          }
          if (tradesToInsert.length) {
            const { error } = await supabaseAdmin
              .from("trades")
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              .upsert(tradesToInsert as any, { onConflict: "event_id", ignoreDuplicates: true });
            if (error) throw error;
          }

          // 7. Advance cursor.
          await supabaseAdmin
            .from("indexer_state")
            .update({
              last_indexed_block: Number(toBlock),
              last_indexed_at: new Date().toISOString(),
              last_error: null,
              updated_at: new Date().toISOString(),
            })
            .eq("chain_id", CHAIN_ID);

          return Response.json({
            ok: true,
            from_block: Number(fromBlock),
            to_block: Number(toBlock),
            logs_scanned: logs.length,
            pov_logs: povLogs.length,
            beliefs_inserted: beliefsToInsert.length,
            trades_inserted: tradesToInsert.length,
            eth_usd: ethUsd,
            duration_ms: Date.now() - startedAt,
          });
        } catch (err) {
          const msg =
            err instanceof Error
              ? `${err.name}: ${err.message}${err.cause ? ` (cause: ${JSON.stringify(err.cause).slice(0, 200)})` : ""}`
              : typeof err === "object"
                ? JSON.stringify(err).slice(0, 500)
                : String(err);
          await supabaseAdmin
            .from("indexer_state")
            .update({
              last_error: msg.slice(0, 500),
              last_error_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("chain_id", CHAIN_ID);
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
