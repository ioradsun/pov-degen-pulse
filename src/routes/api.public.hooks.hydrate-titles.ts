import { createFileRoute } from "@tanstack/react-router";

// Scrape pov.co's server-rendered homepage JSON blob and hydrate beliefs.title
// (plus slug and creator display name) for any rows still missing either.
// onChainMarketId is the reliable join key back to beliefs.belief_id — event
// args and token name() calls don't carry it.
//
// pov.co never exposes a real X/Twitter handle for belief creators (checked
// directly: their profile pages have no x.com/twitter.com link, "username"
// is just their wallet address) — only their chosen displayName is public,
// so that's what we link out with, to their pov.co profile.

const UA = { "User-Agent": "degen-pulse/1.0 (+analytics dashboard)" };

// Matches escaped JSON for one market entry, from its title through its
// author block: \"title\":\"...\",\"slug\":\"...\",...,\"onChainMarketId\":
// \"123\",...,\"author\":{\"username\":\"...\",\"displayName\":\"...\",
// \"walletAddress\":\"...\"
const ENTRY_RE =
  /\\"title\\":\\"(.+?)\\",\\"slug\\":\\"([a-z0-9-]+)\\".*?\\"onChainMarketId\\":\\"(\d+)\\".*?\\"author\\":\{\\"username\\":\\"[^"\\]*\\",\\"displayName\\":\\"(.*?)\\",\\"walletAddress\\":\\"([^"\\]*)\\"/g;

interface ScrapedEntry {
  title: string;
  slug: string;
  creatorDisplayName: string;
  creatorWalletAddress: string;
}

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

async function scrapePovIndex(): Promise<Map<number, ScrapedEntry>> {
  const out = new Map<number, ScrapedEntry>();
  const res = await fetch("https://pov.co/", {
    headers: UA,
    signal: AbortSignal.timeout(8000),
  });
  if (!res.ok) return out;
  const html = await res.text();
  for (const m of html.matchAll(ENTRY_RE)) {
    const [, title, slug, marketId, displayName, walletAddress] = m;
    const id = Number(marketId);
    if (Number.isFinite(id) && !out.has(id)) {
      out.set(id, {
        title: decodeText(title),
        slug,
        creatorDisplayName: decodeText(displayName),
        creatorWalletAddress: walletAddress,
      });
    }
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
            .from("beliefs" as never)
            .select("belief_id")
            .in("belief_id", ids)
            .or("title.is.null,slug.is.null,creator_display_name.is.null");
          if (selErr) throw selErr;

          let updated = 0;
          for (const row of (needing ?? []) as { belief_id: number }[]) {
            const id = row.belief_id;
            const entry = scraped.get(id);
            if (!entry) continue;
            const { error } = await supabaseAdmin
              .from("beliefs" as never)
              .update({
                title: entry.title,
                raw_title_source: "pov.co",
                slug: entry.slug,
                creator_display_name: entry.creatorDisplayName,
              } as never)
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
