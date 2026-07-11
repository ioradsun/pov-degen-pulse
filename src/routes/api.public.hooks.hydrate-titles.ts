import { createFileRoute } from "@tanstack/react-router";

// Scrape pov.co's server-rendered homepage JSON blob and hydrate beliefs.title
// for any rows still NULL. onChainMarketId is the reliable join key back to
// beliefs.belief_id — event args and token name() calls don't carry it.

const UA = { "User-Agent": "degen-pulse/1.0 (+analytics dashboard)" };

// Matches escaped JSON: \"title\":\"...\",\"slug\":\"...\",...,\"onChainMarketId\":\"123\"
const ENTRY_RE =
  /\\"title\\":\\"(.+?)\\",\\"slug\\":\\"[a-z0-9-]+\\".*?\\"onChainMarketId\\":\\"(\d+)\\"/g;

function decodeText(s: string): string {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/\\"/g, '"')
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .trim();
}

async function scrapePovIndex(): Promise<Map<number, string>> {
  const out = new Map<number, string>();
  const res = await fetch("https://pov.co/", {
    headers: UA,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return out;
  const html = await res.text();
  for (const m of html.matchAll(ENTRY_RE)) {
    const [, title, marketId] = m;
    const id = Number(marketId);
    if (Number.isFinite(id) && !out.has(id)) out.set(id, decodeText(title));
  }
  return out;
}

export const Route = createFileRoute("/api/public/hooks/hydrate-titles")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const startedAt = Date.now();
        const apiKey = request.headers.get("apikey");
        if (!apiKey || apiKey !== process.env.SUPABASE_PUBLISHABLE_KEY) {
          return new Response(JSON.stringify({ error: "unauthorized" }), {
            status: 401,
            headers: { "Content-Type": "application/json" },
          });
        }

        try {
          const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
          const scraped = await scrapePovIndex();
          if (scraped.size === 0) {
            return Response.json({ ok: true, scraped: 0, updated: 0 });
          }

          const ids = Array.from(scraped.keys());
          const { data: needing, error: selErr } = await supabaseAdmin
            .from("beliefs")
            .select("belief_id")
            .in("belief_id", ids)
            .is("title", null);
          if (selErr) throw selErr;

          let updated = 0;
          for (const row of needing ?? []) {
            const id = row.belief_id as number;
            const title = scraped.get(id);
            if (!title) continue;
            const { error } = await supabaseAdmin
              .from("beliefs")
              .update({ title, raw_title_source: "pov.co" })
              .eq("belief_id", id);
            if (!error) updated++;
          }

          return Response.json({
            ok: true,
            scraped: scraped.size,
            candidates: needing?.length ?? 0,
            updated,
            duration_ms: Date.now() - startedAt,
          });
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          return Response.json(
            { error: msg, duration_ms: Date.now() - startedAt },
            { status: 500 },
          );
        }
      },
    },
  },
});
