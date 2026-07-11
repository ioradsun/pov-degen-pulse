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
        const supabase = getPublicSupabase();
        const { data, error } = await supabase.rpc(
          "activity_series" as never,
          {
            range_key: parsed.data.range,
          } as never,
        );
        if (error) return Response.json({ error: error.message }, { status: 500 });

        return Response.json(
          { range: parsed.data.range, buckets: data ?? [] },
          { headers: { "Cache-Control": "public, s-maxage=30" } },
        );
      },
    },
  },
});
