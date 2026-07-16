import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getPublicSupabase } from "@/lib/pov/supabase-public.server";

const QuerySchema = z.object({
  range: z.enum(["1h", "24h", "7d", "30d", "all"]).default("24h"),
  ids: z.string().min(1),
});

export const Route = createFileRoute("/api/public/belief-price-deltas")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) {
          return Response.json({ error: parsed.error.flatten() }, { status: 400 });
        }
        const ids = Array.from(
          new Set(
            parsed.data.ids
              .split(",")
              .map((s) => Number.parseInt(s.trim(), 10))
              .filter((n) => Number.isFinite(n) && n > 0),
          ),
        ).slice(0, 250);
        if (ids.length === 0) {
          return Response.json({ range: parsed.data.range, deltas: {} });
        }

        const supabase = getPublicSupabase();
        const { data, error } = await supabase.rpc(
          "belief_price_deltas" as never,
          { range_key: parsed.data.range, belief_ids: ids } as never,
        );
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const deltas: Record<string, {
          yes_pct: number | null;
          yes_start: number | null;
          yes_end: number | null;
          yes_trades: number;
          no_pct: number | null;
          no_start: number | null;
          no_end: number | null;
          no_trades: number;
        }> = {};
        for (const r of (data ?? []) as Array<{
          belief_id: number;
          yes_start: number | null;
          yes_end: number | null;
          yes_pct: number | null;
          yes_trades: number | null;
          no_start: number | null;
          no_end: number | null;
          no_pct: number | null;
          no_trades: number | null;
        }>) {
          deltas[String(r.belief_id)] = {
            yes_pct: r.yes_pct == null ? null : Number(r.yes_pct),
            yes_start: r.yes_start == null ? null : Number(r.yes_start),
            yes_end: r.yes_end == null ? null : Number(r.yes_end),
            yes_trades: Number(r.yes_trades ?? 0),
            no_pct: r.no_pct == null ? null : Number(r.no_pct),
            no_start: r.no_start == null ? null : Number(r.no_start),
            no_end: r.no_end == null ? null : Number(r.no_end),
            no_trades: Number(r.no_trades ?? 0),
          };
        }

        return Response.json(
          { range: parsed.data.range, deltas },
          { headers: { "Cache-Control": "public, s-maxage=30" } },
        );
      },
    },
  },
});
