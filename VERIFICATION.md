# POV on-chain verification (Phase 0)

No ABI exists anywhere for the BeliefMarket implementation, either curve
contract, or the belief-token implementation — confirmed unverified on both
Blockscout (`base.blockscout.com`) and Basescan for all four addresses below.
Only `DegenBoost` is verified. Everything about the three core trading
events was reverse engineered from raw logs and cross-checked against real
transactions (wallet balance deltas, ERC20 mint/burn amounts, `name()`
calls, `msg.value`). Where a claim below has no hard evidence, it's marked
UNRESOLVED rather than guessed.

Contracts (Base, chainId 8453):
- BeliefMarket proxy: `0xd4f4619bb4590598C778178690b77C589b93A3eB` — verified
  (generic ERC1967 proxy ABI only, no business events). Deployed at block
  **48142231**, tx `0xf3b801d51af9063f2fd7d49914bf00bd914dae6b6f8c0fe03705e1729f1fafd7`.
- BeliefMarket impl: `0xeEc43FF91502d7715F02C55f1Ab3dEb02b6A488a` — unverified.
- LinearCurve: `0x79e7C938C90CF20bB6E8830773B1e48664CAF85a` — unverified.
- CPCurve: `0x06A6a243b2202397180295963Fde3163b4F85228` — unverified.
- DegenBoost: `0xFB9a8A5f1ec4f505a9000E8998E009266E286Dd4` — **verified**, full ABI.

## Confirmed: the three core trading events (topic0 hashes)

All three are emitted by the proxy. `topics[1]` = marketId (uint256),
`topics[2]` = actor address, in all three.

| Event (inferred name) | topic0 |
|---|---|
| MarketCreated | `0x3763381a96c90abffc097e48cddec39f4c2d156fbdf0505509ba2b71f8e2061e` |
| TokensBought | `0xcae03a4e04b999ff7f42e7303a8573cdd0a983dfeb874f33cf93610321f66a18` |
| TokensSold | `0xa7796618d9cf132535c50e8284b93c935eef8ca99f5db7412d708026a1f05931` |

### MarketCreated — tx `0x61ff1c99294bcc77d07b68b07a9b225f81c2a2defca148bd9cf85042a5e17db6`

- `data` words 0–2: offsets into 3 dynamic strings, all UUIDs (e.g.
  `0f40a3db-46ea-4021-9c69-fbb98a59d34a`) — **not belief text**, confirmed
  by decoding the tail bytes directly.
- word3 = yesToken address, word4 = noToken address — confirmed: calling
  `name()` on word3/word4 returns `"Belief YES #246"` / `"Belief NO #246"`.
- word5 = curve address — confirmed equals `CPCurve`.
- word6 = `1000000000000000` (0.001 ETH). **This tx's `msg.value` is 0** — so
  this is a fixed protocol constant (e.g. curve seed parameter), not ETH the
  creator actually paid. Not real trade volume; do not surface as "$ raised."
- **Belief text is not emitted on-chain anywhere.** Neither this event nor
  the token's `name()` carries it (name() is a placeholder, see below). It
  must come from pov.co's own backend, keyed by one of the 3 UUIDs. We do
  not have that API — UNRESOLVED, needs iorad to provide the endpoint.

### TokensBought — tx `0x13ffcb18200bf2978f28f13d4ed8dfe5c0aa93ce32dc6d1649422db5236174d4`
(second example: tx `0x31488b8c414acc1b0cb7d5830d22522248d7e28a1da27b7b59136784cc08159d`, a multi-event tx that also emits `ReferralFeePaid`)

- `topics[1]` = marketId (133 / 282 in the two examples).
- `topics[2]` = buyer address — confirmed matches the ERC20 mint's `to`.
- word1 = side flag. **Confirmed 1=YES, 0=NO**: cross-referenced the ERC20
  Transfer (mint) in the same tx against `name()` of the minted token
  (`"Belief YES #133"` when word1=1).
- word2 = **belief-token amount minted (18 decimals), NOT ETH.** Confirmed
  by exact match against the mint Transfer's `value` in both sample txs
  (e.g. `12718520868200651` matches exactly). **This was previously shipped
  as `valueWei` (labeled ETH) — that was wrong; fixed in this pass.**
- words3–8: six more uint256 fields, consistently ~1e-6–1e-4 ETH scale,
  showing clean integer-ratio relationships to the `ReferralFeePaid` amount
  in the same tx (10x, 90x, 4x, 4.5x, 0.5x) — clearly fee/state-related, but
  **exact semantics UNRESOLVED**. Ruled out as "gross + fee breakdown"
  because their sum exceeds `msg.value` in one sample (fees can't exceed
  the payment).
- **Gross ETH spent is not in the event data at all.** Confirmed via wallet
  balance delta: buyer's balance dropped by exactly `msg.value` (net of
  gas), matching `msg.value` to 6 significant figures
  (`28659196856666` measured vs `28658550565146` in the tx — residual is
  block-level noise from other activity in the same block, not a
  discrepancy in this trade). **The only reliable source for gross ETH on
  a buy is the transaction's `value` field — not the event.**
- No explicit fee amount is safely attributable given the above. Per the
  spec's fallback: until words3–8 are resolved (ideally by getting the
  real ABI from the team), fee is not computed at all rather than guessed.

### TokensSold — tx `0xbfbdd75969e18a27ae86472dd0423c27815e30bbbcf966bdeb0bea1df5904fa2`

- `topics[1]` = marketId (157), `topics[2]` = seller — confirmed matches
  the ERC20 burn's `from`.
- word1 = side flag (0=NO), confirmed via `name()` on the burned token
  (`"Belief NO #157"`).
- word2 = token amount burned (18 dec) — confirmed exact match to the
  ERC20 burn Transfer amount (`18000000000000000000`).
- **word3 = gross ETH proceeds — confirmed** via seller wallet balance
  delta: balance increased by `25756933656061002` wei net of gas; word3 is
  `25757453115532167`. Agrees to 6 significant figures (small residual is
  other same-block activity, not this trade). Unlike buy, sell's gross ETH
  *is* reliably present in the event data.
- word4 = fee (`1048692793630393`, ~4.1% of word3). Not independently
  balance-verified, but plausible and consistent — no red flags.

## Auxiliary events (resolved via OpenChain public hash registry, all on the proxy)

- `ReferralCreated(address,address,uint256)` — `0x59401499203519cc0aa58c644591c8538c041ff58fa97c7d2f767b945e5dd3fd`
- `FeesClaimed(address,uint256)` — `0x9493e5bbe4e8e0ac67284469a2d677403d0378a85a59e341d3abc433d0d9a209`
- `ReferralFeePaid(address,address,uint256,uint256)` — `0x2d86eaa89c1bf59c51148f13caf015070dfcb55b273a8bfca944b38b2cf60809`
  (indexed: referrer, trader, marketId; data: amount — confirmed layout
  from the multi-event tx above)
- `ReferralFeesClaimed(address,uint256)` — `0x48da114cbb70df50064204591b1e4de39bbf228aed4dd83eb18c1957dc4c5119`

## Boost — DegenBoost is fully verified; no reverse engineering needed

`BoostPurchased(string marketId, uint256 boostId, address buyer, uint256 amount, uint256 timestamp)`
— tx `0x12f9f1d403909a48770fabb05e6b8d981c6c061a17ecb906a7875e761811d903`.

- **`marketId` here is a UUID string**, not the BeliefMarket's uint256 id —
  confirmed by decoding it directly (`2158b459-9b70-4d6c-983e-1bff94aed617`).
  This is a *different* id scheme than trades/creates use; joining boosts
  to beliefs requires this UUID, not the numeric marketId.
- **`amount` is DEGEN, not ETH.** Confirmed exactly: a `Transfer` of
  `5000000000000000000000` (5000 DEGEN) from buyer to DegenBoost appears in
  the same tx, exactly matching the event's `amount` field.
- This was the root cause of the "ETH transacted: 15000" bug reported
  after the previous fix — `BoostPurchased` contains the substring
  "purchase" and was matching the buy-classification check before the
  boost check, so its DEGEN amount was being summed as ETH. Fixed by
  reordering the classifier (shipped separately, commit `7b52908`).

## Answers to the Phase 0 questions

1. **Belief text as string arg / name()?** Neither. UUIDs only on-chain.
   Source is pov.co's backend — endpoint unknown, needs iorad to provide.
2. **Exact buy/sell events, gross ETH arg?** Buy: gross ETH is **not in the
   event** — only in `tx.value`. Sell: gross ETH **is** word3, confirmed.
3. **YES/NO side emitted?** Yes, confirmed both directions (word1, 1=YES).
4. **Explicit fee amount on buys?** Ambiguous/unresolved (see above) — do
   not estimate at 10% per spec's own rule against guessing; leave fee
   unset for buys until resolved. Sell's fee (word4) is present, unverified
   independently but no contradicting evidence.
5. **ETH only, or also DEGEN?** Core trades (buy/sell) are ETH-only,
   confirmed via balance deltas. **Boosts are paid in DEGEN** — this is a
   second token and needs its own handling, not "delete all multi-token
   logic" as the spec's fallback assumed.
6. **Acting wallet arg?** `topics[2]` on all three core events.
7. **Deployment block?** `48142231`.

## Open items before schema/edge-function work

- Gross ETH on buys requires fetching `tx.value` per buy transaction
  (`eth_getTransactionByHash`), not just logs — this changes the sync
  function's RPC budget (batchable, but not free like `eth_getLogs`).
- words3–8 on TokensBought are unresolved. Recommend getting the real
  Solidity source from the team rather than continuing to reverse engineer
  — we've already shipped one wrong interpretation (word2) from
  plausibility-only checks, and don't want to repeat that for the fee
  breakdown.
- Belief text source (pov.co API) is unknown and blocks the "belief text
  visible in feed" acceptance criterion.
