import { createFileRoute } from "@tanstack/react-router";
import { getPublicSupabase } from "@/lib/pov/supabase-public.server";
import { z } from "zod";

const RangeSchema = z.enum(["1h", "24h", "7d", "30d", "all"]);

export const Route = createFileRoute("/api/public/retention")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const parsed = RangeSchema.safeParse(url.searchParams.get("range") ?? "24h");
        if (!parsed.success) {
          return Response.json({ error: "invalid range" }, { status: 400 });
        }
        const rangeKey = parsed.data;
        const supabase = getPublicSupabase();
        const [{ data, error }, { data: growthData, error: growthError }] = await Promise.all([
          supabase.rpc("repeat_wallet_rate" as never, { range_key: rangeKey } as never),
          supabase.rpc("growth_health" as never, { range_key: rangeKey } as never),
        ]);
        if (error) return Response.json({ error: error.message }, { status: 500 });
        if (growthError) return Response.json({ error: growthError.message }, { status: 500 });

        const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
        const growthRow = (Array.isArray(growthData) ? growthData[0] : growthData) as Record<
          string,
          unknown
        > | null;
        return Response.json(
          {
            range: rangeKey,
            new_wallets: Number(row?.new_wallets ?? 0),
            repeat_wallets: Number(row?.repeat_wallets ?? 0),
            repeat_rate: row?.repeat_rate == null ? null : Number(row.repeat_rate),
            beliefs_created: Number(growthRow?.beliefs_created ?? 0),
            beliefs_filled: Number(growthRow?.beliefs_filled ?? 0),
            belief_fill_rate:
              growthRow?.belief_fill_rate == null ? null : Number(growthRow.belief_fill_rate),
            degen_burn_usd: Number(growthRow?.degen_burn_usd ?? 0),
            computedAt: new Date().toISOString(),
          },
          { headers: { "Cache-Control": "public, s-maxage=60" } },
        );
      },
    },
  },
});
