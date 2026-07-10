import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getPublicSupabase } from "@/lib/pov/supabase-public.server";

const QuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(250).default(100),
  cursor: z.string().optional(),
  large: z.enum(["true", "false"]).optional(),
});

export const Route = createFileRoute("/api/public/feed")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) {
          return Response.json({ error: parsed.error.flatten() }, { status: 400 });
        }
        const { limit, cursor, large } = parsed.data;
        const supabase = getPublicSupabase();

        let query = supabase
          .from("live_activity_events" as never)
          .select("*")
          .order("event_timestamp", { ascending: false })
          .order("event_id", { ascending: false })
          .limit(limit);

        if (cursor) {
          const idx = cursor.indexOf(":");
          if (idx > 0) {
            const ts = cursor.slice(0, idx);
            const eventId = cursor.slice(idx + 1);
            query = query.or(
              `event_timestamp.lt.${ts},and(event_timestamp.eq.${ts},event_id.lt.${eventId})`,
            );
          }
        }
        if (large === "true") query = query.gte("amount_usd", 500);

        const { data, error } = await query;
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const last = data?.[data.length - 1] as { event_timestamp?: string; event_id?: string } | undefined;
        const nextCursor = last?.event_timestamp && last?.event_id
          ? `${last.event_timestamp}:${last.event_id}`
          : null;

        return Response.json({ events: data ?? [], nextCursor });
      },
    },
  },
});
