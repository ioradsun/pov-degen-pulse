import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getPublicSupabase } from "@/lib/pov/supabase-public.server";

export const Route = createFileRoute("/api/public/belief/$id")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const parsed = z.coerce.number().int().positive().safeParse(params.id);
        if (!parsed.success) {
          return Response.json({ error: "invalid id" }, { status: 400 });
        }
        const supabase = getPublicSupabase();
        const beliefId = parsed.data;

        const [belief, stats, recentTrades] = await Promise.all([
          supabase.from("beliefs" as never).select("*").eq("belief_id", beliefId).maybeSingle(),
          supabase.from("belief_stats" as never).select("*").eq("belief_id", beliefId).maybeSingle(),
          supabase
            .from("trades" as never)
            .select("*")
            .eq("belief_id", beliefId)
            .eq("is_canonical", true)
            .order("block_timestamp", { ascending: false })
            .limit(20),
        ]);

        const beliefRow = belief.data as { title?: string | null } | null;
        if (belief.error || !beliefRow) {
          return Response.json({ error: "not found" }, { status: 404 });
        }
        if (!beliefRow.title) {
          return Response.json({ error: "not hydrated" }, { status: 425 });
        }

        return Response.json({
          belief: beliefRow,
          stats: stats.data ?? null,
          recentTrades: recentTrades.data ?? [],
        });
      },
    },
  },
});
