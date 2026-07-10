import type { EventKind } from "./types";

export const POV_CONTRACTS = {
  beliefMarketProxy: "0xd4f4619bb4590598C778178690b77C589b93A3eB",
  beliefMarketImpl: "0xeEc43FF91502d7715F02C55f1Ab3dEb02b6A488a",
  beliefTokenImpl: "0x90178F03279E900885Bed11AdEA6459673d0553D",
  linearCurve: "0x79e7C938C90CF20bB6E8830773B1e48664CAF85a",
  cpCurve: "0x06A6a243b2202397180295963Fde3163b4F85228",
  degenBoost: "0xFB9a8A5f1ec4f505a9000E8998E009266E286Dd4",
} as const;

export const POV_TRACKED: string[] = [
  POV_CONTRACTS.beliefMarketProxy,
  POV_CONTRACTS.linearCurve,
  POV_CONTRACTS.cpCurve,
  POV_CONTRACTS.degenBoost,
];

export const CONTRACT_LABELS: Record<string, string> = {
  [POV_CONTRACTS.beliefMarketProxy.toLowerCase()]: "BeliefMarket",
  [POV_CONTRACTS.beliefMarketImpl.toLowerCase()]: "BeliefMarketImpl",
  [POV_CONTRACTS.beliefTokenImpl.toLowerCase()]: "BeliefTokenImpl",
  [POV_CONTRACTS.linearCurve.toLowerCase()]: "LinearCurve",
  [POV_CONTRACTS.cpCurve.toLowerCase()]: "CPCurve",
  [POV_CONTRACTS.degenBoost.toLowerCase()]: "DegenBoost",
};

export const DEGEN = {
  address: "0x4ed4E862860bEd51a9570b96d89aF5E1B0Efefed",
  chainId: 8453,
  symbol: "DEGEN",
  decimals: 18,
} as const;

// Optional env override — first-priority endpoint if set
const ENV_RPC =
  typeof import.meta !== "undefined"
    ? (import.meta.env?.VITE_BASE_RPC as string | undefined)
    : undefined;

export const BASE_RPCS: string[] = [
  ...(ENV_RPC ? [ENV_RPC] : []),
  "https://base.llamarpc.com",
  "https://base-rpc.publicnode.com",
  "https://base.drpc.org",
  "https://1rpc.io/base",
  "https://mainnet.base.org",
];

export const KNOWN_SIGS: Record<string, { name: string; kind: EventKind }> = {
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef": {
    name: "Transfer",
    kind: "transfer",
  },
  "0x8c5be1e5ebec7d5bd14f71427d1e84f3dd0314c0f7b2291e5b200ac8c7c3b925": {
    name: "Approval",
    kind: "approval",
  },
  "0xbc7cd75a20ee27fd9adebab32041f755214dbc6bffa90cc0225b39da2e5c2d3b": {
    name: "Upgraded",
    kind: "admin",
  },
  "0x7e644d79422f17c01e4894b5f4f588d331ebfa28653d42ae832dc59e38c9798f": {
    name: "AdminChanged",
    kind: "admin",
  },
  "0x8be0079c531659141344cd1fd0a4f28419497f9722a3daafe3b4186f6b6457e0": {
    name: "OwnershipTransferred",
    kind: "admin",
  },
};

/**
 * The BeliefMarket impl, curve, and belief-token contracts are NOT verified
 * on Blockscout or Basescan — there is no public ABI for POV's core trading
 * events anywhere. These topic0 hashes and field layouts were reverse
 * engineered directly from on-chain logs (see events.ts `decodePovCore`)
 * and cross-checked against real transactions: minted/burned token amounts,
 * `name()` calls on the resulting tokens, and fee-percentage sanity checks.
 */
export const POV_CORE_SIGS = {
  created: "0x3763381a96c90abffc097e48cddec39f4c2d156fbdf0505509ba2b71f8e2061e",
  buy: "0xcae03a4e04b999ff7f42e7303a8573cdd0a983dfeb874f33cf93610321f66a18",
  sell: "0xa7796618d9cf132535c50e8284b93c935eef8ca99f5db7412d708026a1f05931",
} as const;

/**
 * Auxiliary fee/referral events on the proxy. Signatures resolved via the
 * OpenChain public hash registry (crowd-sourced, matches by hash so the
 * name/types are reliable even though this specific contract isn't verified).
 */
export const POV_FEE_SIGS = {
  referralCreated: "0x59401499203519cc0aa58c644591c8538c041ff58fa97c7d2f767b945e5dd3fd",
  feesClaimed: "0x9493e5bbe4e8e0ac67284469a2d677403d0378a85a59e341d3abc433d0d9a209",
  referralFeePaid: "0x2d86eaa89c1bf59c51148f13caf015070dfcb55b273a8bfca944b38b2cf60809",
  referralFeesClaimed: "0x48da114cbb70df50064204591b1e4de39bbf228aed4dd83eb18c1957dc4c5119",
} as const;

export const BASESCAN_TX = (h: string) => `https://basescan.org/tx/${h}`;
export const BASESCAN_ADDR = (a: string) => `https://basescan.org/address/${a}`;
