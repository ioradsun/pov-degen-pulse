import { createFileRoute } from "@tanstack/react-router";
import { getPublicSupabase } from "@/lib/pov/supabase-public.server";

const STALL_THRESHOLD_SEC = 60;

export const Route = createFileRoute("/api/public/health")({
  server: {
    handlers: {
      GET: async () => {
        const supabase = getPublicSupabase();

        const [total, hydrated, latestTrade, latestStats] = await Promise.all([
          supabase.from("beliefs" as never).select("*", { count: "exact", head: true }),
          supabase
            .from("beliefs" as never)
            .select("*", { count: "exact", head: true })
            .not("title", "is", null),
          supabase
            .from("trades" as never)
            .select("block_timestamp")
            .order("block_timestamp", { ascending: false })
            .limit(1)
            .maybeSingle(),
          supabase
            .from("belief_stats" as never)
            .select("computed_at")
            .order("computed_at", { ascending: false })
            .limit(1)
            .maybeSingle(),
        ]);

        // Indexer state exposed via a narrow view (chain, block, ts, error).
        const { data: idxRow } = await supabase
          .from("indexer_health" as never)
          .select("*")
          .maybeSingle();
        const idx = (idxRow as {
          chain_id?: number;
          last_indexed_block?: number;
          last_indexed_at?: string | null;
          last_error?: string | null;
        } | null) ?? null;

        const beliefs_total = total.count ?? 0;
        const beliefs_hydrated = hydrated.count ?? 0;
        const latest = (latestTrade.data as { block_timestamp?: string } | null)?.block_timestamp;

        const secondsSinceIndex = idx?.last_indexed_at
          ? Math.floor((Date.now() - new Date(idx.last_indexed_at).getTime()) / 1000)
          : null;

        let writer_status: "ok" | "stalled" | "starting" | "no writer connected";
        if (!idx || idx.last_indexed_block === 0) {
          writer_status = beliefs_total === 0 ? "no writer connected" : "starting";
        } else if (secondsSinceIndex != null && secondsSinceIndex > STALL_THRESHOLD_SEC) {
          writer_status = "stalled";
        } else {
          writer_status = "ok";
        }

        return Response.json({
          beliefs_total,
          beliefs_hydrated,
          beliefs_pending_hydration: beliefs_total - beliefs_hydrated,
          latest_trade_at: latest ?? null,
          seconds_since_last_trade: latest
            ? Math.floor((Date.now() - new Date(latest).getTime()) / 1000)
            : null,
          last_stats_refresh:
            (latestStats.data as { computed_at?: string } | null)?.computed_at ?? null,
          indexer: idx
            ? {
                chain_id: idx.chain_id,
                last_indexed_block: idx.last_indexed_block,
                last_indexed_at: idx.last_indexed_at ?? null,
                seconds_since_last_index: secondsSinceIndex,
                last_error: idx.last_error ?? null,
              }
            : null,
          writer_status,
        });
      },
    },
  },
});
