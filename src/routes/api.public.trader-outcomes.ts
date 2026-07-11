import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";

const RangeSchema = z.enum(["1h", "24h", "7d", "30d", "all"]);

/**
 * Cumulative trader outcomes. Returns two snapshots — `now` and `prev`
 * (= now - window) — so the client can show a cumulative headline plus the
 * windowed change. `prev` is null for range=all (no baseline).
 */
export const Route = createFileRoute("/api/public/trader-outcomes")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = RangeSchema.safeParse(url.searchParams.get("range") ?? "24h");
        if (!parsed.success) {
          return Response.json({ error: "invalid range" }, { status: 400 });
        }
        const { supabaseAdmin: supabase } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabase.rpc(
          "trader_outcomes" as never,
          { range_key: parsed.data } as never,
        );
        if (error) return Response.json({ error: error.message }, { status: 500 });
        const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
        const now = rows.find((r) => r.label === "now") ?? null;
        const prev = rows.find((r) => r.label === "prev") ?? null;
        return Response.json(
          { range: parsed.data, now, prev, computedAt: new Date().toISOString() },
          { headers: { "Cache-Control": "public, s-maxage=30" } },
        );
      },
    },
  },
});
