import { createFileRoute } from "@tanstack/react-router";
import { getPublicSupabase } from "@/lib/pov/supabase-public.server";

export const Route = createFileRoute("/api/public/market-caps")({
  server: {
    handlers: {
      GET: async () => {
        const supabase = getPublicSupabase();
        const { data, error } = await supabase
          .from("belief_stats" as never)
          .select("belief_id, market_cap_usd");
        if (error) return Response.json({ error: error.message }, { status: 500 });
        const rows = (data ?? []) as Array<{ belief_id: number; market_cap_usd: number | null }>;
        const map: Record<string, number> = {};
        for (const r of rows) map[String(r.belief_id)] = Number(r.market_cap_usd ?? 0);
        return Response.json(
          { caps: map },
          { headers: { "cache-control": "public, max-age=30" } },
        );
      },
    },
  },
});
