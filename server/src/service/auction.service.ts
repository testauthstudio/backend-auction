import mongoose from "mongoose";
import { AuctionModel } from "../models/auction.js";
import { BidModel, type BidDoc } from "../models/bid.js";
import { UserModel } from "../models/user.js";

function now() {
  return new Date();
}

/* ────────────────────────────
   Auctions
──────────────────────────── */

export async function createAuction(params: {
  title: string;
  totalItems: number;
  itemsPerRound: number;
  roundDurationSec: number;
  antiSnipeWindowSec: number;
  antiSnipeExtendSec: number;
  maxExtensionsPerRound: number;
}) {
  return AuctionModel.create({
    ...params,
    status: "draft",
    currentRound: 0,
    roundEndsAt: null,
    itemsAssigned: 0,
    settling: false,
    extensionCount: 0,
  });
}

export async function startAuction(auctionId: string) {
  const a = await AuctionModel.findOneAndUpdate(
    { _id: auctionId, status: "draft" },
    {
      status: "running",
      currentRound: 1,
      extensionCount: 0,
      roundEndsAt: new Date(Date.now() + 1000),
    },
    { new: true }
  );

  if (!a) throw new Error("Auction not found or not in draft");
  return a;
}

export async function listAuctions() {
  return AuctionModel.find().sort({ createdAt: -1 }).lean();
}

export async function getAuction(auctionId: string) {
  const a = await AuctionModel.findById(auctionId).lean();
  if (!a) throw new Error("Auction not found");
  return a;
}

export async function getTopBids(auctionId: string, limit: number) {
  return BidModel.find({ auctionId })
    .sort({ amount: -1, updatedAt: 1 })
    .limit(limit)
    .lean();
}

/* ────────────────────────────
   Bidding (NO TRANSACTIONS)
──────────────────────────── */

export async function placeOrRaiseBid(params: {
  auctionId: string;
  userId: string;
  amount: number;
}) {
  const { auctionId, userId, amount } = params;

  if (!Number.isInteger(amount) || amount <= 0) {
    throw new Error("Invalid amount");
  }

  const auction = await AuctionModel.findById(auctionId);
  if (!auction || auction.status !== "running" || !auction.roundEndsAt) {
    throw new Error("Auction not running");
  }

  if (auction.roundEndsAt.getTime() <= Date.now()) {
    throw new Error("Round is settling");
  }

  const user = await UserModel.findById(userId);
  if (!user) throw new Error("User not found");

  const existing = await BidModel.findOne({ auctionId, userId });

  const prevAmount = existing?.amount ?? 0;
  if (amount <= prevAmount) throw new Error("Bid must increase");

  const delta = amount - prevAmount;
  if (user.balanceAvailable < delta) {
    throw new Error("Insufficient balance");
  }

  // lock funds
  await UserModel.updateOne(
    { _id: user._id, balanceAvailable: { $gte: delta } },
    {
      $inc: {
        balanceAvailable: -delta,
        balanceLocked: delta,
      },
    }
  );

  let bid: BidDoc;

  if (existing) {
    existing.amount = amount;
    existing.updatedAt = now();
    await existing.save();
    bid = existing;
  } else {
    bid = await BidModel.create({
      auctionId: auction._id,
      userId: new mongoose.Types.ObjectId(userId),
      amount,
      status: "active",
    });
  }

  // anti-sniping
  const msLeft = auction.roundEndsAt.getTime() - Date.now();
  if (
    auction.antiSnipeWindowSec > 0 &&
    auction.antiSnipeExtendSec > 0 &&
    msLeft <= auction.antiSnipeWindowSec * 1000 &&
    auction.extensionCount < auction.maxExtensionsPerRound
  ) {
    auction.roundEndsAt = new Date(
      auction.roundEndsAt.getTime() +
        auction.antiSnipeExtendSec * 1000
    );
    auction.extensionCount += 1;
    await auction.save();
  }

  return bid;
}

/* ────────────────────────────
   Settlement (LOCK VIA FLAG)
──────────────────────────── */

export async function trySettleRound(auctionId: string) {
  const locked = await AuctionModel.findOneAndUpdate(
    {
      _id: auctionId,
      status: "running",
      settling: false,
      roundEndsAt: { $lte: now() },
    },
    { $set: { settling: true } },
    { new: true }
  );

  if (!locked) return { settled: false };

  try {
    const a = locked;

    const itemsLeft = a.totalItems - a.itemsAssigned;
    if (itemsLeft <= 0) {
      a.status = "finished";
      a.settling = false;
      await a.save();
      return { settled: true, finished: true };
    }

    const take = Math.min(a.itemsPerRound, itemsLeft);

    const bids = await BidModel.find({
      auctionId: a._id,
      status: "active",
    })
      .sort({ amount: -1, updatedAt: 1 })
      .limit(take);

    for (let i = 0; i < bids.length; i++) {
      const bid = bids[i];
      const user = await UserModel.findById(bid.userId);
      if (!user) continue;

      user.balanceLocked -= bid.amount;
      await user.save();

      bid.status = "won";
      bid.wonSerial = a.itemsAssigned + i + 1;
      bid.updatedAt = now();
      await bid.save();
    }

    a.itemsAssigned += bids.length;

    if (a.itemsAssigned >= a.totalItems) {
      // refund remaining
      const rest = await BidModel.find({
        auctionId: a._id,
        status: "active",
      });

      for (const bid of rest) {
        const u = await UserModel.findById(bid.userId);
        if (!u) continue;

        u.balanceLocked -= bid.amount;
        u.balanceAvailable += bid.amount;
        await u.save();

        bid.status = "refunded";
        bid.updatedAt = now();
        await bid.save();
      }

      a.status = "finished";
      a.roundEndsAt = null;
    } else {
      a.currentRound += 1;
      a.roundEndsAt = new Date(
        Date.now() + a.roundDurationSec * 1000
      );
      a.extensionCount = 0;
    }

    a.settling = false;
    await a.save();

    return { settled: true, winners: bids.length };
  } catch (e) {
    await AuctionModel.updateOne(
      { _id: auctionId },
      { $set: { settling: false } }
    ).catch(() => {});
    throw e;
  }
}

export async function settleDueAuctionsOnce() {
  const due = await AuctionModel.find({
    status: "running",
    settling: false,
    roundEndsAt: { $lte: now() },
  }).select({ _id: 1 });

  const results = [];
  for (const a of due) {
    try {
      results.push(await trySettleRound(String(a._id)));
    } catch (e: any) {
      results.push({ error: e?.message });
    }
  }
  return results;
}
