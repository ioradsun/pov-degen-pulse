import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getPublicSupabase } from "@/lib/pov/supabase-public.server";

const QuerySchema = z.object({
  hours: z.coerce.number().int().min(1).max(168).default(24),
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
          "hourly_activity" as never,
          {
            hours_back: parsed.data.hours,
          } as never,
        );
        if (error) return Response.json({ error: error.message }, { status: 500 });

        return Response.json(
          { hours: parsed.data.hours, buckets: data ?? [] },
          { headers: { "Cache-Control": "public, s-maxage=30" } },
        );
      },
    },
  },
});
