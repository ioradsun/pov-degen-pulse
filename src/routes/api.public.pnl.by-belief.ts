import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getPublicSupabase } from "@/lib/pov/supabase-public.server";

const RangeSchema = z.enum(["1h", "24h", "7d", "30d", "all"]);
const LimitSchema = z.coerce.number().int().min(1).max(500).default(50);

export const Route = createFileRoute("/api/public/pnl/by-belief")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const rangeP = RangeSchema.safeParse(url.searchParams.get("range") ?? "24h");
        const limitP = LimitSchema.safeParse(url.searchParams.get("limit") ?? "50");
        if (!rangeP.success || !limitP.success) {
          return Response.json({ error: "invalid params" }, { status: 400 });
        }
        const supabase = getPublicSupabase();
        const { data, error } = await supabase.rpc(
          "pnl_by_belief" as never,
          { range_key: rangeP.data, top_n: limitP.data } as never,
        );
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json(
          { range: rangeP.data, rows: data ?? [] },
          { headers: { "Cache-Control": "public, s-maxage=30" } },
        );
      },
    },
  },
});
