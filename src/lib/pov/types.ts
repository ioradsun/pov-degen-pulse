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
