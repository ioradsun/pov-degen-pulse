import { createFileRoute } from "@tanstack/react-router";
import { getPublicSupabase } from "@/lib/pov/supabase-public.server";

/** CSV export of every belief with its full stats + lifetime aggregates. */
export const Route = createFileRoute("/api/public/export/beliefs")({
  server: {
    handlers: {
      GET: async () => {
        const supabase = getPublicSupabase();

        const PAGE = 1000;
        async function fetchAll<T = Record<string, unknown>>(
          table: string,
          select: string,
        ): Promise<T[]> {
          const rows: T[] = [];
          for (let from = 0; ; from += PAGE) {
            const { data, error } = await supabase
              .from(table as never)
              .select(select)
              .range(from, from + PAGE - 1);
            if (error) throw new Error(error.message);
            const chunk = (data ?? []) as T[];
            rows.push(...chunk);
            if (chunk.length < PAGE) break;
          }
          return rows;
        }

        let beliefs: Array<Record<string, unknown>>;
        let stats: Array<Record<string, unknown>>;
        let tradesAggRes: { error: unknown; data: unknown };
        try {
          [beliefs, stats, tradesAggRes] = await Promise.all([
            fetchAll<Record<string, unknown>>(
              "beliefs",
              "belief_id, chain_id, market_address, creator_address, creator_display_name, title, slug, is_ai_generated, created_at, created_block, hydrated_at",
            ),
            fetchAll<Record<string, unknown>>("belief_stats", "*"),
            supabase.rpc("belief_lifetime_totals" as never),
          ]);
        } catch (e) {
          return Response.json({ error: (e as Error).message }, { status: 500 });
        }

        const statsById = new Map<number, Record<string, unknown>>();
        for (const s of stats) statsById.set(Number(s.belief_id), s);

        const totalsById = new Map<
          number,
          { buy_volume_all_usd: number; sell_volume_all_usd: number; unique_buyers_all: number; trades_all: number }
        >();
        if (!tradesAggRes.error && Array.isArray(tradesAggRes.data)) {
          for (const r of tradesAggRes.data as Array<Record<string, unknown>>) {
            totalsById.set(Number(r.belief_id), {
              buy_volume_all_usd: Number(r.buy_volume_all_usd ?? 0),
              sell_volume_all_usd: Number(r.sell_volume_all_usd ?? 0),
              unique_buyers_all: Number(r.unique_buyers_all ?? 0),
              trades_all: Number(r.trades_all ?? 0),
            });
          }
        }

        const columns = [
          "belief_id",
          "title",
          "slug",
          "creator_address",
          "creator_display_name",
          "chain_id",
          "market_address",
          "is_ai_generated",
          "created_at",
          "created_block",
          "hydrated_at",
          "buy_volume_all_usd",
          "sell_volume_all_usd",
          "unique_buyers_all",
          "trades_all",
          "buy_volume_1h_usd",
          "buy_volume_24h_usd",
          "buy_volume_7d_usd",
          "buy_volume_30d_usd",
          "market_cap_usd",
          "unique_wallets_24h",
          "ignition_score",
          "momentum",
          "split_pct",
          "whale_activity_pct",
          "distribution_gini",
          "delta_conviction_1h",
          "lifecycle_stage",
          "lifecycle_since",
          "buy_velocity_15m",
          "buy_velocity_baseline",
          "computed_at",
        ] as const;

        const escape = (v: unknown): string => {
          if (v == null) return "";
          const s = typeof v === "string" ? v : String(v);
          if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
          return s;
        };

        const lines: string[] = [columns.join(",")];
        for (const b of beliefs) {
          const id = Number(b.belief_id);
          const s = statsById.get(id) ?? {};
          const t = totalsById.get(id) ?? {};
          const row: Record<string, unknown> = { ...b, ...s, ...t };
          lines.push(columns.map((c) => escape(row[c])).join(","));
        }

        const csv = lines.join("\n");
        const stamp = new Date().toISOString().slice(0, 10);
        return new Response(csv, {
          headers: {
            "content-type": "text/csv; charset=utf-8",
            "content-disposition": `attachment; filename="pov-beliefs-${stamp}.csv"`,
            "cache-control": "public, max-age=60",
          },
        });
      },
    },
  },
});
