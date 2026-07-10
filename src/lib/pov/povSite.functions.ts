import { createServerFn } from "@tanstack/react-start";

/**
 * Belief text lives off-chain, on pov.co — confirmed in VERIFICATION.md:
 * MarketCreated only emits opaque strings (turned out to be AI-agent ids,
 * reused across many markets — not content ids), and the belief token's
 * name() is a placeholder ("Belief YES #246"). Neither is usable.
 *
 * pov.co's homepage IS server-rendered and embeds a JSON blob listing
 * every shown market's `title`, `slug`, and — critically — its
 * `onChainMarketId`, which is exactly the marketId our on-chain events
 * carry in topics[1]. That's a direct, reliable join key.
 *
 * Two other joins were tried by hand against the real site and confirmed
 * NOT to work, so this deliberately doesn't use them:
 *   - Matching a belief's on-chain yes/no token address against 0x
 *     addresses embedded in its pov.co page: the addresses on the page
 *     have zero bytecode on Base — they're unrelated (wallet/infra refs),
 *     not the belief tokens.
 *   - Matching the UUIDs from MarketCreated against UUIDs on the page:
 *     those UUIDs are `agentId`s for AI personas that post opinions on
 *     many different markets, not a per-market content id.
 *
 * Runs server-side: no CORS, and the marketId->title map is shared by
 * every viewer instead of re-scraped per browser.
 */

const resolved = new Map<string, string>(); // marketId -> title
let indexFetchedAt = 0;
const INDEX_TTL_MS = 60_000;
const UA = { "User-Agent": "degen-pulse/1.0 (+analytics dashboard)" };

// Matches pov.co's escaped JSON blob:
// \"title\":\"...\",\"slug\":\"...\",...,\"onChainMarketId\":\"123\"
const ENTRY_RE =
  /\\"title\\":\\"(.+?)\\",\\"slug\\":\\"[a-z0-9-]+\\".*?\\"onChainMarketId\\":\\"(\d+)\\"/g;

function decodeText(s: string): string {
  return s
    .replace(/\\u([0-9a-fA-F]{4})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)))
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;|&#39;/g, "'")
    .trim();
}

async function refreshIndex(): Promise<void> {
  if (Date.now() - indexFetchedAt < INDEX_TTL_MS) return;
  try {
    const html = await (await fetch("https://pov.co/", { headers: UA })).text();
    for (const m of html.matchAll(ENTRY_RE)) {
      const [, title, marketId] = m;
      if (!resolved.has(marketId)) resolved.set(marketId, decodeText(title));
    }
    indexFetchedAt = Date.now();
  } catch {
    /* leave the existing cache in place, retry after TTL */
  }
}

export const fetchPovTexts = createServerFn({ method: "POST" })
  .inputValidator((input: { marketIds: string[] }) => {
    if (!input || !Array.isArray(input.marketIds)) {
      throw new Error("marketIds[] required");
    }
    return {
      marketIds: input.marketIds.filter((id) => /^\d+$/.test(id)).slice(0, 200),
    };
  })
  .handler(async ({ data }): Promise<Record<string, string>> => {
    const out: Record<string, string> = {};
    const missing = data.marketIds.some((id) => !resolved.has(id));
    if (missing) await refreshIndex();
    for (const id of data.marketIds) {
      const t = resolved.get(id);
      if (t) out[id] = t;
    }
    return out;
  });
