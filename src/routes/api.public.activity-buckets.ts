import { createFileRoute } from "@tanstack/react-router";
import { getPublicSupabase } from "@/lib/pov/supabase-public.server";
import { z } from "zod";


const QuerySchema = z.object({
  granularity: z.enum(["hour", "day", "week", "month"]).default("hour"),
  buckets: z.coerce.number().int().min(2).max(120).default(24),
});

export const Route = createFileRoute("/api/public/activity-buckets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) {
          return Response.json({ error: parsed.error.flatten() }, { status: 400 });
        }
        const supabase = getPublicSupabase();
        const { data, error } = await supabase.rpc("activity_buckets", {
          granularity: parsed.data.granularity,
          buckets_back: parsed.data.buckets,
        });
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const buckets = (data ?? []).map((r: Record<string, unknown>) => ({
          bucket: r.bucket,
          buy_volume_usd: Number(r.buy_volume_usd ?? 0),
          buy_volume_eth: Number(r.buy_volume_eth ?? 0),
          buys: r.buys ?? 0,
          sells: r.sells ?? 0,
          created: r.created ?? 0,
          active_traders: r.active_traders ?? 0,
        }));

        return Response.json(
          { granularity: parsed.data.granularity, buckets },
          { headers: { "Cache-Control": "public, s-maxage=30" } },
        );
      },
    },
  },
});
