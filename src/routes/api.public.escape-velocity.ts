import { createFileRoute } from "@tanstack/react-router";
import { getPublicSupabase } from "@/lib/pov/supabase-public.server";
import { z } from "zod";

const RangeSchema = z.enum(["1h", "24h", "7d", "30d", "all"]);
const ThresholdSchema = z.coerce.number().int().min(1).max(10000).default(3);

export const Route = createFileRoute("/api/public/escape-velocity")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const rangeP = RangeSchema.safeParse(url.searchParams.get("range") ?? "24h");
        const thresholdP = ThresholdSchema.safeParse(
          url.searchParams.get("threshold") ?? "3",
        );
        if (!rangeP.success || !thresholdP.success) {
          return Response.json({ error: "invalid params" }, { status: 400 });
        }
        const supabase = getPublicSupabase();
        const { data, error } = await supabase.rpc(
          "escape_velocity_beliefs" as never,
          { range_key: rangeP.data, min_buyers: thresholdP.data } as never,
        );
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json(
          {
            range: rangeP.data,
            threshold: thresholdP.data,
            rows: data ?? [],
          },
          { headers: { "Cache-Control": "public, s-maxage=60" } },
        );
      },
    },
  },
});
