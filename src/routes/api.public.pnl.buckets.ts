import { createFileRoute } from "@tanstack/react-router";
import { getPublicSupabase } from "@/lib/pov/supabase-public.server";
import { z } from "zod";


const GranularitySchema = z.enum(["hour", "day", "week", "month"]);
const BucketsSchema = z.coerce.number().int().min(1).max(200).default(24);

export const Route = createFileRoute("/api/public/pnl/buckets")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const gP = GranularitySchema.safeParse(url.searchParams.get("granularity") ?? "hour");
        const bP = BucketsSchema.safeParse(url.searchParams.get("buckets") ?? "24");
        if (!gP.success || !bP.success) {
          return Response.json({ error: "invalid params" }, { status: 400 });
        }
        const supabase = getPublicSupabase();
        const { data, error } = await supabase.rpc(
          "pnl_buckets" as never,
          { granularity: gP.data, buckets_back: bP.data } as never,
        );
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json(
          { granularity: gP.data, buckets: data ?? [] },
          { headers: { "Cache-Control": "public, s-maxage=60" } },
        );
      },
    },
  },
});
