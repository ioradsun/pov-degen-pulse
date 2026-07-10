import { createServerFn } from "@tanstack/react-start";

/**
 * AI read on the tape. Runs server-side so the API key never ships to the
 * browser. Set ANTHROPIC_API_KEY (and optionally ANTHROPIC_MODEL) in env.
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

    const apiKey = process.env.ANTHROPIC_API_KEY;
    if (!apiKey) {
      return {
        ok: false,
        error:
          "AI insights are off. Add ANTHROPIC_API_KEY to the server environment to turn them on.",
      };
    }

    try {
      const r = await fetch("https://api.anthropic.com/v1/messages", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-api-key": apiKey,
          "anthropic-version": "2023-06-01",
        },
        body: JSON.stringify({
          model: process.env.ANTHROPIC_MODEL ?? "claude-sonnet-4-6",
          max_tokens: 800,
          system: SYSTEM,
          messages: [{ role: "user", content: data.snapshot }],
        }),
      });
      if (!r.ok) {
        const body = await r.text();
        throw new Error(`API ${r.status}: ${body.slice(0, 200)}`);
      }
      const j = (await r.json()) as {
        content?: Array<{ type: string; text?: string }>;
      };
      const text = (j.content ?? [])
        .filter((c) => c.type === "text" && c.text)
        .map((c) => c.text)
        .join("\n");
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
