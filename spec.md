# Spec — Telegram Gift Auctions–style (MVP assumptions)

Telegram describes Gift Auctions as a **multi-round system**:
- Auction runs in **rounds**
- In each round, **top bids win a portion** of items
- Remaining bids continue to next rounds
- Anti-sniping exists (mechanism not fully public)
- Losing bids get refunded at the end

This MVP reproduces the mechanics with explicit assumptions where Telegram doesn't define exact rules.

---

## Entities

### User
- `balanceAvailable` — money user can spend
- `balanceLocked` — escrowed money tied to active bids

All amounts are stored as **integers** (cents).

### Auction
Fields:
- `totalItems`
- `itemsPerRound`
- `roundDurationSec`
- anti-sniping:
  - `antiSnipeWindowSec`
  - `antiSnipeExtendSec`
  - `maxExtensionsPerRound`
- runtime:
  - `status` = `draft | running | finished`
  - `currentRound` (starts at 1)
  - `roundEndsAt`
  - `itemsAssigned` (how many serials already assigned)
  - `settling` lock boolean
  - `extensionCount` for current round

### Bid
- one bid per (`auctionId`, `userId`) in MVP
- `amount` is the user's maximum price
- `status`:
  - `active` — competing
  - `won` — won, with `wonSerial`
  - `refunded` — auction ended and bid returned

---

## Money / escrow

When user sets or increases a bid to amount **X**:
- Determine current bid amount `prev` (0 if none)
- `delta = X - prev` must be **> 0**
- Move funds:
  - `balanceAvailable -= delta`
  - `balanceLocked += delta`

On **win**:
- user pays from escrow:
  - `balanceLocked -= bid.amount`
- bid becomes `won`
- an item serial number is assigned

On **loss after final round**:
- locked funds are refunded:
  - `balanceLocked -= bid.amount`
  - `balanceAvailable += bid.amount`
- bid becomes `refunded`

Invariant: money is never created or destroyed, only moved between buckets.

---

## Ranking
At end of each round, determine candidates:
- all bids with `status=active`
- exclude users who already won in this auction (MVP: `singleWinPerUser=true`)

Sort:
1) amount DESC
2) updatedAt ASC (tie-break: earlier update wins)

Winners:
- take top `N = min(itemsPerRound, itemsLeft)`
- assign serials in order: `itemsAssigned+1...`
- mark those bids as `won` and charge escrow

Continue rounds until:
- all items assigned (auction finished)

---

## Anti-sniping (assumption)
When a bid is updated within the last `antiSnipeWindowSec` seconds of the round:
- extend `roundEndsAt += antiSnipeExtendSec`
- but only if `extensionCount < maxExtensionsPerRound` for that round

---

## Concurrency & settlement
- Bids run in **Mongo transactions**.
- Settlement uses an **atomic lock**:
  - `findOneAndUpdate({ _id, status: 'running', roundEndsAt: { $lte: now }, settling: false }, { $set: { settling: true } })`
  - only one process can settle a round.
