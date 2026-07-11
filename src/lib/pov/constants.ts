export const POV_CONTRACTS = {
  beliefMarketProxy: "0xd4f4619bb4590598C778178690b77C589b93A3eB",
  beliefMarketImpl: "0xeEc43FF91502d7715F02C55f1Ab3dEb02b6A488a",
  beliefTokenImpl: "0x90178F03279E900885Bed11AdEA6459673d0553D",
  linearCurve: "0x79e7C938C90CF20bB6E8830773B1e48664CAF85a",
  cpCurve: "0x06A6a243b2202397180295963Fde3163b4F85228",
  degenBoost: "0xFB9a8A5f1ec4f505a9000E8998E009266E286Dd4",
} as const;

export const DEGEN = {
  address: "0x4ed4E862860bEd51a9570b96d89aF5E1B0Efefed",
  chainId: 8453,
  symbol: "DEGEN",
  decimals: 18,
} as const;

/**
 * The BeliefMarket impl, curve, and belief-token contracts are NOT verified
 * on Blockscout or Basescan — there is no public ABI for POV's core trading
 * events anywhere. These topic0 hashes and field layouts were reverse
 * engineered directly from on-chain logs and cross-checked against real
 * transactions: minted/burned token amounts, `name()` calls on the
 * resulting tokens, and wallet balance deltas. Full evidence and tx hashes
 * in VERIFICATION.md — plausibility/percentage checks alone previously
 * produced a wrong field mapping, so every claim here is now backed by an
 * exact match against real chain state.
 */
export const POV_CORE_SIGS = {
  created: "0x3763381a96c90abffc097e48cddec39f4c2d156fbdf0505509ba2b71f8e2061e",
  buy: "0xcae03a4e04b999ff7f42e7303a8573cdd0a983dfeb874f33cf93610321f66a18",
  sell: "0xa7796618d9cf132535c50e8284b93c935eef8ca99f5db7412d708026a1f05931",
} as const;

export const BASESCAN_TX = (h: string) => `https://basescan.org/tx/${h}`;
export const BASESCAN_ADDR = (a: string) => `https://basescan.org/address/${a}`;
