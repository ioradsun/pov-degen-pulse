import { createFileRoute } from "@tanstack/react-router";


export const Route = createFileRoute("/api/public/retention")({
  server: {
    handlers: {
      GET: async () => {
        const { supabaseAdmin: supabase } = await import("@/integrations/supabase/client.server");
        const [{ data, error }, { data: growthData, error: growthError }] = await Promise.all([
          supabase.rpc("repeat_wallet_rate" as never, {} as never),
          supabase.rpc("growth_health" as never, {} as never),
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
            new_wallets: Number(row?.new_wallets ?? 0),
            repeat_wallets: Number(row?.repeat_wallets ?? 0),
            repeat_rate: row?.repeat_rate == null ? null : Number(row.repeat_rate),
            beliefs_created_7d: Number(growthRow?.beliefs_created_7d ?? 0),
            beliefs_filled_7d: Number(growthRow?.beliefs_filled_7d ?? 0),
            belief_fill_rate_7d:
              growthRow?.belief_fill_rate_7d == null ? null : Number(growthRow.belief_fill_rate_7d),
            degen_burn_all_time_usd: Number(growthRow?.degen_burn_all_time_usd ?? 0),
            computedAt: new Date().toISOString(),
          },
          { headers: { "Cache-Control": "public, s-maxage=60" } },
        );
      },
    },
  },
});
