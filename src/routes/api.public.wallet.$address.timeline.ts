import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getPublicSupabase } from "@/lib/pov/supabase-public.server";
import { toTimelinePoint, WALLET_RE } from "@/lib/pov/wallet";

const AddressSchema = z.string().regex(WALLET_RE);

/**
 * Daily P&L timeline for one wallet. Registers the wallet on view (which
 * backfills its full history on first sight and refreshes today), then returns
 * the stored snapshot series.
 */
export const Route = createFileRoute("/api/public/wallet/$address/timeline")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const parsed = AddressSchema.safeParse(params.address);
        if (!parsed.success) {
          return Response.json({ error: "invalid address" }, { status: 400 });
        }
        const address = parsed.data.toLowerCase();
        const supabase = getPublicSupabase();

        // register + backfill-if-new + refresh today (idempotent)
        const reg = await supabase.rpc("wallet_register" as never, { addr: address } as never);
        if (reg.error) return Response.json({ error: reg.error.message }, { status: 500 });

        const { data, error } = await supabase.rpc(
          "wallet_timeline" as never,
          { addr: address } as never,
        );
        if (error) return Response.json({ error: error.message }, { status: 500 });

        const points = (Array.isArray(data) ? data : []).map((r) =>
          toTimelinePoint(r as Record<string, unknown>),
        );
        return Response.json(
          { address, points, computedAt: new Date().toISOString() },
          { headers: { "Cache-Control": "public, s-maxage=30" } },
        );
      },
    },
  },
});
