# Backend Auction Challenge — Minimal MVP (Telegram Gift Auctions–style)

This repo is a **minimal, working** implementation of a **multi-round auction** for digital goods inspired by Telegram Gift Auctions.

Goal: simple, robust core logic:
- rounds
- bidding + ranking
- winners per round
- balances with escrow (available/locked)
- refunds
- anti-sniping extension
- concurrency safety using MongoDB transactions + atomic settle lock

> **MVP simplification:** `singleWinPerUser = true` (a user can win at most one item in an auction).  
> If you need multi-win later, you'll need “participation slots” or quantity bidding (out of scope here).

---

## Product Spec (short)

See **`spec.md`** for rules and assumptions.

---

## Tech
- Node.js + TypeScript
- MongoDB (single-node replica set in Docker for transactions)
- Express + Mongoose
- Minimal HTML UI (vanilla JS)

---

## Quick start (Docker)

```bash
docker compose up --build
```

Open:
- UI: http://localhost:3000
- API base: http://localhost:3000/api

Mongo is started as a replica set and initiated automatically.

---

## Local dev (without Docker)
You need a MongoDB replica set (or Atlas) because we use transactions.

```bash
npm i
cp .env.example .env
npm run dev
```

---

## Minimal UI
- `/` — auctions list + create
- `/auction.html?id=<auctionId>` — view + bid
- `/balance.html?id=<userId>` — user balance

---

## Load / concurrency test

This script creates users, creates an auction, starts it, and runs bot bidders.

```bash
npm run load
```

Options:
- `BOTS` (default 50)
- `INITIAL_BALANCE` (default 100000) in cents
- `MAX_BID` (default 20000) in cents
- `AUCTION_ITEMS` (default 20)
- `ITEMS_PER_ROUND` (default 5)

Example:
```bash
BOTS=200 AUCTION_ITEMS=50 ITEMS_PER_ROUND=10 npm run load
```

---

## Notes on correctness & concurrency

- **Balances are integers** (cents).
- Each bid runs in a **Mongo transaction**:
  - increases locked balance by delta
  - updates/creates bid
  - may extend the round end time (anti-sniping)
- Round settlement uses an **atomic lock** on the auction doc (`settling=true`) to prevent double settlement.

---

## API (minimal)

### Users
- `POST /api/users` `{ balanceAvailable }`
- `GET /api/users/:id`

### Auctions
- `POST /api/auctions` create (draft)
- `POST /api/auctions/:id/start`
- `GET /api/auctions` list
- `GET /api/auctions/:id` details
- `GET /api/auctions/:id/bids?limit=50` top bids (active + won)
- `POST /api/auctions/:id/bid` `{ userId, amount }`

---

## What to submit
- This repo + your demo video.
- Explain spec assumptions in `spec.md` and any deviations you make.
