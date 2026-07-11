import { createFileRoute } from "@tanstack/react-router";
import { getPublicSupabase } from "@/lib/pov/supabase-public.server";
import { z } from "zod";


const RangeSchema = z.enum(["1h", "24h", "7d", "30d", "all"]);

export const Route = createFileRoute("/api/public/headline")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = RangeSchema.safeParse(url.searchParams.get("range") ?? "24h");
        if (!parsed.success) {
          return Response.json({ error: "invalid range" }, { status: 400 });
        }
        const supabase = getPublicSupabase();
        const { data, error } = await supabase.rpc(
          "headline_metrics" as never,
          {
            range_key: parsed.data,
          } as never,
        );
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
        return Response.json(
          { range: parsed.data, ...(row ?? {}), computedAt: new Date().toISOString() },
          { headers: { "Cache-Control": "public, s-maxage=30" } },
        );
      },
    },
  },
});
