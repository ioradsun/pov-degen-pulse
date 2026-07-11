import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getPublicSupabase } from "@/lib/pov/supabase-public.server";

const SortSchema = z.enum(["ignition", "volume", "momentum", "whale", "split", "delta_conviction"]);
const RangeSchema = z.enum(["1h", "24h", "7d", "30d", "all"]);

const VOLUME_COLUMN: Record<z.infer<typeof RangeSchema>, string> = {
  "1h": "buy_volume_1h_usd",
  "24h": "buy_volume_24h_usd",
  "7d": "buy_volume_7d_usd",
  "30d": "buy_volume_30d_usd",
  all: "buy_volume_all_usd",
};

const SORT_COLUMN: Record<Exclude<z.infer<typeof SortSchema>, "volume">, string> = {
  ignition: "ignition_score",
  momentum: "momentum",
  whale: "whale_activity_pct",
  split: "split_pct",
  delta_conviction: "delta_conviction_1h",
};

const QuerySchema = z.object({
  sort: SortSchema.default("ignition"),
  range: RangeSchema.default("24h"),
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
        const { sort, range, limit } = parsed.data;
        const volumeColumn = VOLUME_COLUMN[range];
        const orderColumn = sort === "volume" ? volumeColumn : SORT_COLUMN[sort];

        const supabase = getPublicSupabase();
        const { data, error } = await supabase
          .from("behavioral_grid" as never)
          .select("*")
          .order(orderColumn, { ascending: false, nullsFirst: false })
          .limit(limit);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const rows = ((data ?? []) as Record<string, unknown>[]).map((row) => ({
          ...row,
          buy_volume_usd: Number(row[volumeColumn] ?? 0),
        }));
        return Response.json({ range, rows });
      },
    },
  },
});
