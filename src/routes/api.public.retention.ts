import { createFileRoute } from "@tanstack/react-router";
import { getPublicSupabase } from "@/lib/pov/supabase-public.server";

export const Route = createFileRoute("/api/public/retention")({
  server: {
    handlers: {
      GET: async () => {
        const supabase = getPublicSupabase();
        const { data, error } = await supabase.rpc("repeat_wallet_rate" as never, {} as never);
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const row = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
        return Response.json(
          {
            new_wallets: Number(row?.new_wallets ?? 0),
            repeat_wallets: Number(row?.repeat_wallets ?? 0),
            repeat_rate: row?.repeat_rate == null ? null : Number(row.repeat_rate),
            computedAt: new Date().toISOString(),
          },
          { headers: { "Cache-Control": "public, s-maxage=60" } },
        );
      },
    },
  },
});
