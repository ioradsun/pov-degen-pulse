import { createServerFn } from "@tanstack/react-start";

/**
 * AI read on the tape. Runs server-side so the API key never ships to the
 * browser. Powered by Lovable AI (LOVABLE_API_KEY is auto-provisioned).
 * Responses are cached for 5 minutes — every viewer shares one read.
 */


export interface PulseInsight {
  headline: string;
  themes: string[];
  momentum: string;
  degenReadThrough: string;
  watch: string;
}

export interface InsightResult {
  ok: boolean;
  insight?: PulseInsight;
  error?: string;
  generatedAt?: number;
}

interface CacheEntry {
  at: number;
  result: InsightResult;
}

let cached: CacheEntry | null = null;
const CACHE_MS = 5 * 60 * 1000;

const SYSTEM = `You are a crypto market analyst for a live dashboard watching POV — a belief market on Base where people create "beliefs" (statements) and buy/sell yes-tokens on them with ETH, and where trading fees buy back and burn DEGEN.

You receive a JSON snapshot of the last 24h: POV on-chain activity (belief texts, buys, sells, ETH volume, unique traders, boosts, hourly rhythm) and DEGEN market data (price, change, volume, buy/sell counts).

Your audience is a NOVICE trader. Plain English, no jargon without a five-word explanation, no hedging boilerplate. Be concrete: name actual beliefs, actual numbers.

Respond with ONLY a JSON object, no markdown fences, in this exact shape:
{
  "headline": "one punchy sentence on the state of POV right now",
  "themes": ["2-4 short bullets on WHAT people are creating beliefs about and which are attracting money"],
  "momentum": "2-3 sentences: is activity accelerating or fading, buys vs sells, new traders",
  "degenReadThrough": "2-3 sentences connecting POV fee flow / activity to DEGEN price action — remember fees burn DEGEN, so real usage is structural buy pressure",
  "watch": "one specific thing to watch next"
}`;

export const fetchInsight = createServerFn({ method: "POST" })
  .inputValidator((input: { snapshot: string; force?: boolean }) => {
    if (!input || typeof input.snapshot !== "string") {
      throw new Error("snapshot (JSON string) required");
    }
    if (input.snapshot.length > 60_000) {
      throw new Error("snapshot too large");
    }
    return { snapshot: input.snapshot, force: !!input.force };
  })
  .handler(async ({ data }): Promise<InsightResult> => {
    if (!data.force && cached && Date.now() - cached.at < CACHE_MS) {
      return cached.result;
    }

    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        error: "AI insights are off. LOVABLE_API_KEY is not configured on the server.",
      };
    }

    try {
      const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Lovable-API-Key": apiKey,
        },
        body: JSON.stringify({
          model: process.env.LOVABLE_AI_MODEL ?? "openai/gpt-5.5",
          messages: [
            { role: "system", content: SYSTEM },
            { role: "user", content: data.snapshot },
          ],
          response_format: { type: "json_object" },
        }),
      });
      if (!r.ok) {
        const body = await r.text();
        if (r.status === 429) throw new Error("Rate limit hit — please retry in a moment.");
        if (r.status === 402)
          throw new Error("Lovable AI credits exhausted. Add credits in workspace billing.");
        throw new Error(`AI ${r.status}: ${body.slice(0, 200)}`);
      }
      const j = (await r.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const text = j.choices?.[0]?.message?.content ?? "";
      const clean = text.replace(/```json|```/g, "").trim();
      const insight = JSON.parse(clean) as PulseInsight;


      const result: InsightResult = {
        ok: true,
        insight,
        generatedAt: Date.now(),
      };
      cached = { at: Date.now(), result };
      return result;
    } catch (e) {
      return { ok: false, error: (e as Error).message };
    }
  });
