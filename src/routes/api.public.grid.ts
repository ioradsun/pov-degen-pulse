import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getPublicSupabase } from "@/lib/pov/supabase-public.server";

const SortSchema = z.enum([
  "ignition",
  "volume_24h",
  "momentum",
  "whale",
  "split",
  "delta_conviction",
]);

const SORT_COLUMN: Record<z.infer<typeof SortSchema>, string> = {
  ignition: "ignition_score",
  volume_24h: "buy_volume_24h_usd",
  momentum: "momentum",
  whale: "whale_activity_pct",
  split: "split_pct",
  delta_conviction: "delta_conviction_1h",
};

const QuerySchema = z.object({
  sort: SortSchema.default("ignition"),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const Route = createFileRoute("/api/public/grid")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = QuerySchema.safeParse(Object.fromEntries(url.searchParams));
        if (!parsed.success) {
          return Response.json({ error: parsed.error.flatten() }, { status: 400 });
        }
        const supabase = getPublicSupabase();
        const { data, error } = await supabase
          .from("behavioral_grid" as never)
          .select("*")
          .order(SORT_COLUMN[parsed.data.sort], { ascending: false, nullsFirst: false })
          .limit(parsed.data.limit);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        return Response.json({ rows: data ?? [] });
      },
    },
  },
});
