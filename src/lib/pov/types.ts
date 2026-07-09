export type EventKind =
  | "created"
  | "buy"
  | "sell"
  | "boost"
  | "transfer"
  | "approval"
  | "admin"
  | "unknown";

export interface RawLog {
  block: number;
  logIndex: number;
  txHash: string;
  address: string;
  topic0: string;
  topics: string[];
  data: string;
  timestamp?: number;
}

export interface DecodedEvent extends RawLog {
  contractLabel: string;
  eventName: string;
  kind: EventKind;
  from?: string;
  to?: string;
  valueWei?: bigint;
  /** Belief/market group id (marketId as string, or per-belief token address). */
  beliefId?: string;
  /** The market's yes-token address, when the event carries it (MarketCreated). */
  yesToken?: string;
  /** The bonding curve address for this market, when known (MarketCreated). */
  curveAddress?: string;
  /** Y/N side flag from TokensBought/TokensSold. */
  yes?: boolean;
  /** Human-readable question id, when the event carries it. */
  questionId?: string;
  _newUntil?: number;
}



export interface DegenSnapshot {
  ts: number;
  priceUsd: number;
  priceEth: number;
  change24h: number;
  volume24h: number;
  liquidityUsd: number;
  marketCap: number;
  buys24h: number;
  sells24h: number;
}

export interface HourBucket {
  hour: number;
  povEvents: number;
  povBuys: number;
  povSells: number;
  povUniqueAddrs: number;
  degenVolumeUsd: number;
  degenPriceUsd: number;
  degenBuys: number;
  degenSells: number;
}

export interface RpcHealthState {
  active: string;
  attempts: number;
  successes: number;
  failures: number;
  lastError: string | null;
  lastSuccessAt: number | null;
  lastErrorAt: number | null;
  perEndpoint: Record<string, { s: number; f: number }>;
}
