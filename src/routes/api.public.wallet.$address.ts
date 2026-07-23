import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getPublicSupabase } from "@/lib/pov/supabase-public.server";
import { summarizePositions, toWalletPosition, WALLET_RE } from "@/lib/pov/wallet";

const AddressSchema = z.string().regex(WALLET_RE);

/**
 * Lifetime position breakdown for one wallet: every (belief, side) it traded,
 * plus a rolled-up summary (deposited, withdrawn, holding value, net, ROI).
 */
export const Route = createFileRoute("/api/public/wallet/$address")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const parsed = AddressSchema.safeParse(params.address);
        if (!parsed.success) {
          return Response.json({ error: "invalid address" }, { status: 400 });
        }
        const address = parsed.data.toLowerCase();
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.rpc(
          "wallet_positions" as never,
          { addr: address } as never,
        );
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const rows = (Array.isArray(data) ? data : []) as Array<Record<string, unknown>>;
        const positions = rows.map(toWalletPosition);
        const summary = summarizePositions(positions);

        return Response.json(
          { address, summary, positions, computedAt: new Date().toISOString() },
          { headers: { "Cache-Control": "public, s-maxage=30" } },
        );
      },
    },
  },
});
