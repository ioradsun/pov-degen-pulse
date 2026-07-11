import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getPublicSupabase } from "@/lib/pov/supabase-public.server";

const QuerySchema = z.object({
  range: z.enum(["1h", "24h", "7d", "30d", "all"]).default("24h"),
});

export const Route = createFileRoute("/api/public/rhythm")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) {
          return Response.json({ error: parsed.error.flatten() }, { status: 400 });
        }
        const hoursByRange: Record<string, number> = {
          "1h": 1,
          "24h": 24,
          "7d": 24 * 7,
          "30d": 24 * 30,
          all: 24 * 30,
        };
        const supabase = getPublicSupabase();
        const { data, error } = await supabase.rpc("hourly_activity", {
          hours_back: hoursByRange[parsed.data.range] ?? 24,
        });
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const buckets = (data ?? []).map((r) => ({
          bucket: r.hour,
          buy_volume_usd: Number(r.buy_volume_usd ?? 0),
          buy_volume_eth: Number((r as { buy_volume_eth?: number }).buy_volume_eth ?? 0),
          buys: r.buys ?? 0,
          sells: r.sells ?? 0,
          created: r.created ?? 0,
          active_traders: (r as { active_traders?: number }).active_traders ?? 0,
        }));


        return Response.json(
          { range: parsed.data.range, buckets },
          { headers: { "Cache-Control": "public, s-maxage=30" } },
        );
      },
    },
  },
});
