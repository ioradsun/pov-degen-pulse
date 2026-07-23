import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { getPublicSupabase } from "@/lib/pov/supabase-public.server";
import { POV_CONTRACTS, DEGEN } from "@/lib/pov/constants";
import { WALLET_RE } from "@/lib/pov/wallet";

/**
 * Wallet cash-flow P&L.
 *
 * "How much did I actually put in, and what is it all worth now?"
 *
 *   Net Deposits    = external inbound (valued at historical price) − external outbound
 *   Cash Available  = current wallet balances (ETH + priced tokens) × current price
 *   Positions Value = current market value of POV positions (from our FIFO cache)
 *   Net P&L         = (Cash + Positions) − Net Deposits
 *   ROI %           = Net P&L / Net Deposits
 *
 * Data:
 *   • ERC-20 + native transfers from Blockscout Base (Etherscan-compatible, no key)
 *   • Historical + current USD prices from DefiLlama coins API
 *   • "Internal" moves = any transfer whose tx_hash appears in our indexed POV trades
 *     for this wallet, OR whose counterparty is a known POV contract.
 */

const BLOCKSCOUT = "https://base.blockscout.com/api";
const LLAMA = "https://coins.llama.fi";
const CHAIN = "base";
const ETH_LLAMA = "coingecko:ethereum";
const NATIVE_ETH = "native:eth";

const AddressSchema = z.string().regex(WALLET_RE);

const INTERNAL_ADDRS = new Set<string>(
  Object.values(POV_CONTRACTS).map((a) => a.toLowerCase()),
);

interface BsTokenTx {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  contractAddress: string;
  tokenSymbol: string;
  tokenDecimal: string;
  isError?: string;
}
interface BsEthTx {
  hash: string;
  timeStamp: string;
  from: string;
  to: string;
  value: string;
  gasUsed: string;
  gasPrice: string;
  isError: string;
}
interface BsTokenBal {
  contractAddress: string;
  symbol: string;
  decimals: string;
  balance: string;
}

type Direction = "in" | "out";
type Classification = "deposit" | "withdrawal" | "internal";

interface Transfer {
  hash: string;
  ts: number; // unix seconds
  direction: Direction;
  classification: Classification;
  asset: string; // token key (address or "eth")
  symbol: string;
  amount: number; // human units
  counterparty: string;
  priceUsd: number | null; // at time of transfer
  valueUsd: number | null;
}

async function bsFetch<T>(params: Record<string, string>): Promise<T[]> {
  const url = new URL(BLOCKSCOUT);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const r = await fetch(url.toString());
  if (!r.ok) throw new Error(`blockscout ${r.status}`);
  const j = (await r.json()) as { status?: string; message?: string; result?: T[] | string };
  if (!Array.isArray(j.result)) return [];
  return j.result;
}

/** DefiLlama historical price. Accepts token addresses OR coingecko IDs. */
async function llamaHistorical(
  keys: Array<{ id: string; ts: number }>,
): Promise<Map<string, number>> {
  // Group into batched calls per timestamp (llama supports up to ~10 coins per call).
  const out = new Map<string, number>();
  if (keys.length === 0) return out;
  // Deduplicate (id, day) — 1 price per token per day is plenty
  const dayKey = (ts: number) => Math.floor(ts / 86400) * 86400;
  const unique = new Map<string, { id: string; ts: number }>();
  for (const k of keys) unique.set(`${k.id}|${dayKey(k.ts)}`, { id: k.id, ts: dayKey(k.ts) });
  // Group by day, then chunk 8 coins per request
  const byDay = new Map<number, string[]>();
  for (const { id, ts } of unique.values()) {
    const arr = byDay.get(ts) ?? [];
    arr.push(id);
    byDay.set(ts, arr);
  }
  const tasks: Promise<void>[] = [];
  for (const [ts, ids] of byDay) {
    for (let i = 0; i < ids.length; i += 8) {
      const chunk = ids.slice(i, i + 8);
      tasks.push(
        (async () => {
          const url = `${LLAMA}/prices/historical/${ts}/${chunk.join(",")}?searchWidth=4h`;
          try {
            const r = await fetch(url);
            if (!r.ok) return;
            const j = (await r.json()) as { coins?: Record<string, { price?: number }> };
            for (const id of chunk) {
              const p = j.coins?.[id]?.price;
              if (typeof p === "number") out.set(`${id}|${ts}`, p);
            }
          } catch {
            /* skip */
          }
        })(),
      );
    }
  }
  await Promise.all(tasks);
  return out;
}

async function llamaCurrent(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (ids.length === 0) return out;
  for (let i = 0; i < ids.length; i += 20) {
    const chunk = ids.slice(i, i + 20);
    try {
      const r = await fetch(`${LLAMA}/prices/current/${chunk.join(",")}?searchWidth=4h`);
      if (!r.ok) continue;
      const j = (await r.json()) as { coins?: Record<string, { price?: number }> };
      for (const id of chunk) {
        const p = j.coins?.[id]?.price;
        if (typeof p === "number") out.set(id, p);
      }
    } catch {
      /* skip */
    }
  }
  return out;
}

const llamaIdForAsset = (asset: string): string =>
  asset === NATIVE_ETH ? ETH_LLAMA : `${CHAIN}:${asset}`;

export const Route = createFileRoute("/api/public/wallet/$address/cashflow")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const parsed = AddressSchema.safeParse(params.address);
        if (!parsed.success) {
          return Response.json({ error: "invalid address" }, { status: 400 });
        }
        const addr = parsed.data.toLowerCase();

        // --- 1. Pull the internal-tx set from our own indexed POV trades. --------
        const supabase = getPublicSupabase();
        const { data: povTrades } = await supabase
          .from("trades")
          .select("tx_hash")
          .eq("wallet_address", addr);
        const internalTxHashes = new Set<string>(
          (povTrades ?? []).map((r) => String(r.tx_hash).toLowerCase()),
        );

        // --- 2. Fetch transfer history + current balances in parallel. -----------
        const [tokenTxs, ethTxs, tokenBals, ethBalRes] = await Promise.all([
          bsFetch<BsTokenTx>({
            module: "account",
            action: "tokentx",
            address: addr,
            sort: "asc",
          }),
          bsFetch<BsEthTx>({
            module: "account",
            action: "txlist",
            address: addr,
            sort: "asc",
          }),
          bsFetch<BsTokenBal>({
            module: "account",
            action: "tokenlist",
            address: addr,
          }),
          fetch(
            `${BLOCKSCOUT}?module=account&action=balance&address=${addr}`,
          ).then((r) => r.json() as Promise<{ result?: string }>),
        ]);

        // --- 3. Normalize transfers. --------------------------------------------
        const transfers: Transfer[] = [];
        let feesEth = 0;

        for (const t of tokenTxs) {
          if (t.isError === "1") continue;
          const decimals = Number(t.tokenDecimal) || 18;
          const raw = BigInt(t.value || "0");
          if (raw === 0n) continue;
          const amount = Number(raw) / 10 ** decimals;
          const ts = Number(t.timeStamp);
          const from = t.from.toLowerCase();
          const to = t.to.toLowerCase();
          const direction: Direction = to === addr ? "in" : "out";
          const counterparty = direction === "in" ? from : to;
          const hash = t.hash.toLowerCase();
          const asset = t.contractAddress.toLowerCase();

          let classification: Classification;
          if (internalTxHashes.has(hash)) classification = "internal";
          else if (INTERNAL_ADDRS.has(counterparty)) classification = "internal";
          else classification = direction === "in" ? "deposit" : "withdrawal";

          transfers.push({
            hash,
            ts,
            direction,
            classification,
            asset,
            symbol: t.tokenSymbol || "TOKEN",
            amount,
            counterparty,
            priceUsd: null,
            valueUsd: null,
          });
        }

        for (const t of ethTxs) {
          const ts = Number(t.timeStamp);
          const from = t.from.toLowerCase();
          const to = (t.to ?? "").toLowerCase();
          const hash = t.hash.toLowerCase();
          // Gas paid on any tx this wallet sent (even failed)
          if (from === addr) {
            const gas = Number(BigInt(t.gasUsed || "0") * BigInt(t.gasPrice || "0")) / 1e18;
            feesEth += gas;
          }
          if (t.isError === "1") continue;
          const raw = BigInt(t.value || "0");
          if (raw === 0n) continue;
          const amount = Number(raw) / 1e18;
          const direction: Direction = to === addr ? "in" : "out";
          const counterparty = direction === "in" ? from : to;

          let classification: Classification;
          if (internalTxHashes.has(hash)) classification = "internal";
          else if (INTERNAL_ADDRS.has(counterparty)) classification = "internal";
          else classification = direction === "in" ? "deposit" : "withdrawal";

          transfers.push({
            hash,
            ts,
            direction,
            classification,
            asset: NATIVE_ETH,
            symbol: "ETH",
            amount,
            counterparty,
            priceUsd: null,
            valueUsd: null,
          });
        }

        // --- 4. Value external transfers at historical price. -------------------
        const external = transfers.filter((t) => t.classification !== "internal");
        const priceKeys = external.map((t) => ({ id: llamaIdForAsset(t.asset), ts: t.ts }));
        const hist = await llamaHistorical(priceKeys);
        const dayKey = (ts: number) => Math.floor(ts / 86400) * 86400;
        for (const t of external) {
          const key = `${llamaIdForAsset(t.asset)}|${dayKey(t.ts)}`;
          const p = hist.get(key);
          if (typeof p === "number") {
            t.priceUsd = p;
            t.valueUsd = p * t.amount;
          }
        }

        // --- 5. Current balances → USD. -----------------------------------------
        const balances: Array<{ asset: string; symbol: string; amount: number; priceUsd: number | null; valueUsd: number | null }> =
          [];
        const ethBalWei = BigInt(ethBalRes?.result ?? "0");
        const ethAmount = Number(ethBalWei) / 1e18;
        balances.push({
          asset: NATIVE_ETH,
          symbol: "ETH",
          amount: ethAmount,
          priceUsd: null,
          valueUsd: null,
        });
        for (const b of tokenBals) {
          const decimals = Number(b.decimals) || 18;
          const amount = Number(BigInt(b.balance || "0")) / 10 ** decimals;
          if (amount <= 0) continue;
          balances.push({
            asset: b.contractAddress.toLowerCase(),
            symbol: b.symbol || "TOKEN",
            amount,
            priceUsd: null,
            valueUsd: null,
          });
        }

        const currentIds = Array.from(new Set(balances.map((b) => llamaIdForAsset(b.asset))));
        const currentPrices = await llamaCurrent(currentIds);
        for (const b of balances) {
          const p = currentPrices.get(llamaIdForAsset(b.asset));
          if (typeof p === "number") {
            b.priceUsd = p;
            b.valueUsd = p * b.amount;
          }
        }

        // --- 6. Aggregates. -----------------------------------------------------
        const sum = (arr: Transfer[], pred: (t: Transfer) => boolean) =>
          arr.reduce((s, t) => s + (pred(t) && t.valueUsd ? t.valueUsd : 0), 0);
        const depositsUsd = sum(transfers, (t) => t.classification === "deposit");
        const withdrawalsUsd = sum(transfers, (t) => t.classification === "withdrawal");
        const netDepositsUsd = depositsUsd - withdrawalsUsd;

        const cashAvailableUsd = balances.reduce((s, b) => s + (b.valueUsd ?? 0), 0);

        // Positions value → sum of holding_value from wallet_positions RPC.
        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data: posData } = await supabaseAdmin.rpc("wallet_positions" as never, { addr } as never);
        const positionsUsdEth = (Array.isArray(posData) ? posData : []).reduce(
          (s: number, r: Record<string, unknown>) => s + Number(r.hold_value_eth ?? 0),
          0,
        );
        const ethNowUsd = currentPrices.get(ETH_LLAMA) ?? null;
        const positionsValueUsd = ethNowUsd ? positionsUsdEth * ethNowUsd : null;

        const feesUsd = ethNowUsd ? feesEth * ethNowUsd : null;

        const totalValueUsd =
          cashAvailableUsd + (positionsValueUsd ?? 0) - (feesUsd ?? 0);
        const netPnlUsd = totalValueUsd - netDepositsUsd;
        const roi = netDepositsUsd > 0 ? netPnlUsd / netDepositsUsd : null;

        // ---- DEGEN-denominated twin --------------------------------------------
        const degenNowUsd = currentPrices.get(`${CHAIN}:${DEGEN.address.toLowerCase()}`) ?? null;
        const usdToDegen = (usd: number | null): number | null =>
          usd == null || !degenNowUsd ? null : usd / degenNowUsd;

        // For historical DEGEN valuation: fetch DEGEN price on each transfer day
        let netDepositsDegen: number | null = null;
        if (degenNowUsd) {
          const degenId = `${CHAIN}:${DEGEN.address.toLowerCase()}`;
          const degenKeys = external.map((t) => ({ id: degenId, ts: t.ts }));
          const degenHist = await llamaHistorical(degenKeys);
          let dep = 0;
          let wd = 0;
          for (const t of external) {
            if (t.valueUsd == null) continue;
            const dp = degenHist.get(`${degenId}|${dayKey(t.ts)}`);
            if (!dp) continue;
            const inDegen = t.valueUsd / dp;
            if (t.classification === "deposit") dep += inDegen;
            else if (t.classification === "withdrawal") wd += inDegen;
          }
          netDepositsDegen = dep - wd;
        }

        return Response.json(
          {
            address: addr,
            summary: {
              deposits_usd: depositsUsd,
              withdrawals_usd: withdrawalsUsd,
              net_deposits_usd: netDepositsUsd,
              cash_available_usd: cashAvailableUsd,
              positions_value_usd: positionsValueUsd,
              fees_usd: feesUsd,
              fees_eth: feesEth,
              total_value_usd: totalValueUsd,
              net_pnl_usd: netPnlUsd,
              roi,
              // DEGEN denomination
              eth_usd: ethNowUsd,
              degen_usd: degenNowUsd,
              net_deposits_degen: netDepositsDegen,
              cash_available_degen: usdToDegen(cashAvailableUsd),
              positions_value_degen: usdToDegen(positionsValueUsd),
              total_value_degen: usdToDegen(totalValueUsd),
              net_pnl_degen:
                netDepositsDegen != null && usdToDegen(totalValueUsd) != null
                  ? (usdToDegen(totalValueUsd) as number) - netDepositsDegen
                  : null,
            },
            balances: balances.sort((a, b) => (b.valueUsd ?? 0) - (a.valueUsd ?? 0)),
            transfers: transfers.sort((a, b) => b.ts - a.ts),
            computedAt: new Date().toISOString(),
          },
          { headers: { "Cache-Control": "public, s-maxage=60" } },
        );
      },
    },
  },
});
