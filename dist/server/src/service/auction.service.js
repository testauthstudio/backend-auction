import mongoose from "mongoose";
import { startSession } from "../db.js";
import { AuctionModel } from "../models/auction.js";
import { BidModel } from "../models/bid.js";
import { UserModel } from "../models/user.js";
function nowMs() {
    return Date.now();
}
export async function createAuction(params) {
    const doc = await AuctionModel.create({
        ...params,
        status: "draft",
        currentRound: 0,
        roundEndsAt: null,
        itemsAssigned: 0,
        settling: false,
        extensionCount: 0,
    });
    return doc;
}
export async function startAuction(auctionId) {
    const a = await AuctionModel.findById(auctionId);
    if (!a)
        throw new Error("Auction not found");
    if (a.status !== "draft")
        throw new Error("Auction not in draft");
    a.status = "running";
    a.currentRound = 1;
    a.extensionCount = 0;
    a.roundEndsAt = new Date(nowMs() + a.roundDurationSec * 1000);
    await a.save();
    return a;
}
export async function listAuctions() {
    return AuctionModel.find().sort({ createdAt: -1 }).lean();
}
export async function getAuction(auctionId) {
    const a = await AuctionModel.findById(auctionId).lean();
    if (!a)
        throw new Error("Auction not found");
    return a;
}
export async function getTopBids(auctionId, limit) {
    const bids = await BidModel.find({ auctionId })
        .sort({ amount: -1, updatedAt: 1 })
        .limit(limit)
        .populate({ path: "userId", select: { nickname: 1 } })
        .lean();
    return bids;
}
export async function placeOrRaiseBid(params) {
    const { auctionId, userId, amount } = params;
    if (!Number.isInteger(amount) || amount <= 0)
        throw new Error("Invalid amount");
    const session = await startSession();
    try {
        let resultBid = null;
        await session.withTransaction(async () => {
            const a = await AuctionModel.findById(auctionId).session(session);
            if (!a)
                throw new Error("Auction not found");
            if (a.status !== "running")
                throw new Error("Auction not running");
            if (!a.roundEndsAt)
                throw new Error("Round not scheduled");
            const now = new Date();
            if (a.roundEndsAt.getTime() <= now.getTime()) {
                throw new Error("Round is settling, try again");
            }
            // MVP: single win per user — if already won, cannot bid again
            const alreadyWon = await BidModel.findOne({
                auctionId: a._id,
                userId,
                status: "won",
            }).session(session);
            if (alreadyWon)
                throw new Error("User already won in this auction");
            const u = await UserModel.findById(userId).session(session);
            if (!u)
                throw new Error("User not found");
            const existing = await BidModel.findOne({ auctionId: a._id, userId }).session(session);
            const prev = existing ? existing.amount : 0;
            if (amount <= prev)
                throw new Error("Bid must increase");
            const delta = amount - prev;
            if (u.balanceAvailable < delta)
                throw new Error("Insufficient balance");
            // money move
            u.balanceAvailable -= delta;
            u.balanceLocked += delta;
            await u.save({ session });
            // upsert bid
            if (existing) {
                existing.amount = amount;
                existing.status = "active";
                existing.updatedAt = new Date();
                await existing.save({ session });
                resultBid = existing;
            }
            else {
                const created = await BidModel.create([{
                        auctionId: a._id,
                        userId: new mongoose.Types.ObjectId(userId),
                        amount,
                        status: "active",
                    }], { session });
                resultBid = created[0];
            }
            // anti-sniping: extend if within window, limited extensions per round
            const msLeft = a.roundEndsAt.getTime() - now.getTime();
            if (a.antiSnipeWindowSec > 0 &&
                a.antiSnipeExtendSec > 0 &&
                msLeft <= a.antiSnipeWindowSec * 1000 &&
                a.extensionCount < a.maxExtensionsPerRound) {
                a.roundEndsAt = new Date(a.roundEndsAt.getTime() + a.antiSnipeExtendSec * 1000);
                a.extensionCount += 1;
                await a.save({ session });
            }
        });
        if (!resultBid)
            throw new Error("Bid not created");
        return resultBid.toObject();
    }
    finally {
        session.endSession();
    }
}
/**
 * Settle a round if due.
 * Uses an atomic lock on the auction to avoid double settlement.
 */
export async function trySettleRound(auctionId) {
    const now = new Date();
    // Acquire lock
    const locked = await AuctionModel.findOneAndUpdate({
        _id: auctionId,
        status: "running",
        roundEndsAt: { $lte: now },
        settling: false,
    }, { $set: { settling: true } }, { new: true });
    if (!locked)
        return { settled: false };
    const session = await startSession();
    try {
        let outcome = { settled: true, winners: 0, finished: false };
        await session.withTransaction(async () => {
            const a = await AuctionModel.findById(auctionId).session(session);
            if (!a)
                throw new Error("Auction not found (during settle)");
            const itemsLeft = a.totalItems - a.itemsAssigned;
            if (itemsLeft <= 0) {
                a.status = "finished";
                a.settling = false;
                await a.save({ session });
                outcome.finished = true;
                return;
            }
            const take = Math.min(a.itemsPerRound, itemsLeft);
            // Candidates: active bids only (MVP: single-win, so 'won' excluded anyway)
            const candidates = await BidModel.find({ auctionId: a._id, status: "active" })
                .sort({ amount: -1, updatedAt: 1 })
                .session(session);
            const winners = candidates.slice(0, take);
            const losers = candidates.slice(take);
            // Mark winners as won and charge escrow
            for (let i = 0; i < winners.length; i++) {
                const bid = winners[i];
                const serial = a.itemsAssigned + i + 1;
                // charge from locked
                const u = await UserModel.findById(bid.userId).session(session);
                if (!u)
                    throw new Error("Winner user not found");
                if (u.balanceLocked < bid.amount)
                    throw new Error("Locked balance invariant broken");
                u.balanceLocked -= bid.amount;
                await u.save({ session });
                bid.status = "won";
                bid.wonSerial = serial;
                bid.updatedAt = new Date();
                await bid.save({ session });
            }
            a.itemsAssigned += winners.length;
            // Finish auction if no items left: refund remaining active bids
            const now2 = new Date();
            const itemsLeft2 = a.totalItems - a.itemsAssigned;
            if (itemsLeft2 <= 0) {
                // refund everyone still active
                const remaining = await BidModel.find({ auctionId: a._id, status: "active" }).session(session);
                for (const bid of remaining) {
                    const u = await UserModel.findById(bid.userId).session(session);
                    if (!u)
                        continue;
                    if (u.balanceLocked < bid.amount)
                        throw new Error("Locked balance invariant broken (refund)");
                    u.balanceLocked -= bid.amount;
                    u.balanceAvailable += bid.amount;
                    await u.save({ session });
                    bid.status = "refunded";
                    bid.updatedAt = now2;
                    await bid.save({ session });
                }
                a.status = "finished";
                a.currentRound += 1;
                a.roundEndsAt = null;
                a.extensionCount = 0;
                a.settling = false;
                await a.save({ session });
                outcome.winners = winners.length;
                outcome.finished = true;
                return;
            }
            // Otherwise schedule next round
            a.currentRound += 1;
            a.roundEndsAt = new Date(now2.getTime() + a.roundDurationSec * 1000);
            a.extensionCount = 0;
            a.settling = false;
            await a.save({ session });
            outcome.winners = winners.length;
            outcome.finished = false;
        });
        return outcome;
    }
    catch (e) {
        // If txn failed, unlock settling to allow retry
        await AuctionModel.updateOne({ _id: auctionId }, { $set: { settling: false } }).catch(() => { });
        throw e;
    }
    finally {
        session.endSession();
    }
}
export async function settleDueAuctionsOnce() {
    const now = new Date();
    const due = await AuctionModel.find({
        status: "running",
        roundEndsAt: { $lte: now },
        settling: false,
    }).select({ _id: 1 }).lean();
    const results = [];
    for (const a of due) {
        try {
            const r = await trySettleRound(String(a._id));
            results.push({ auctionId: String(a._id), ...r });
        }
        catch (e) {
            results.push({ auctionId: String(a._id), error: e?.message ?? String(e) });
        }
    }
    return results;
}
