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
  all: "buy_volume_30d_usd",
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
          .from("belief_stats" as never)
          .select(
            "belief_id, buy_volume_1h_usd, buy_volume_24h_usd, buy_volume_7d_usd, buy_volume_30d_usd, split_pct, ignition_score, momentum, whale_activity_pct, delta_conviction_1h, distribution_gini, lifecycle_stage, unique_wallets_24h, beliefs!inner(title, slug, creator_address, creator_display_name, created_at)",
          )
          .order(orderColumn, { ascending: false, nullsFirst: false })
          .limit(limit);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const rows = (
          (data ?? []) as Array<
            Record<string, unknown> & {
              beliefs?: {
                title: string | null;
                slug: string | null;
                creator_address: string;
                creator_display_name: string | null;
                created_at: string;
              } | null;
            }
          >
        ).map((row) => {
          const b = row.beliefs ?? null;
          return {
            belief_id: row.belief_id,
            title: b?.title ?? null,
            slug: b?.slug ?? null,
            creator_address: b?.creator_address ?? "",
            creator_display_name: b?.creator_display_name ?? null,
            created_at: b?.created_at ?? "",
            buy_volume_usd: Number(row[volumeColumn] ?? 0),
            buy_volume_1h_usd: Number(row.buy_volume_1h_usd ?? 0),
            buy_volume_24h_usd: Number(row.buy_volume_24h_usd ?? 0),
            buy_volume_7d_usd: Number(row.buy_volume_7d_usd ?? 0),
            buy_volume_30d_usd: Number(row.buy_volume_30d_usd ?? 0),
            buy_volume_all_usd: Number(row.buy_volume_30d_usd ?? 0),
            split_pct: row.split_pct ?? null,
            ignition_score: row.ignition_score ?? null,
            momentum: row.momentum ?? null,
            whale_activity_pct: row.whale_activity_pct ?? null,
            distribution_gini: row.distribution_gini ?? null,
            delta_conviction_1h: row.delta_conviction_1h ?? null,
            lifecycle_stage: row.lifecycle_stage ?? "new",
            unique_wallets_24h: row.unique_wallets_24h ?? 0,
            creator_quality: null,
          };
        });
        return Response.json({ range, rows });
      },
    },
  },
});
