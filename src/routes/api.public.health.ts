import { createFileRoute } from "@tanstack/react-router";
import { getPublicSupabase } from "@/lib/pov/supabase-public.server";

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

        const beliefs_total = total.count ?? 0;
        const beliefs_hydrated = hydrated.count ?? 0;
        const latest = (latestTrade.data as { block_timestamp?: string } | null)?.block_timestamp;

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
          writer_status: beliefs_total === 0 ? "no writer connected" : "ok",
        });
      },
    },
  },
});
