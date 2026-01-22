import { Router } from "express";
import {
  createAuction,
  startAuction,
  listAuctions,
  getAuction,
  getTopBids,
  placeOrRaiseBid,
} from "../service/auction.service.js";

export const auctionsRouter = Router();

auctionsRouter.post("/", async (req, res) => {
  try {
    const body = req.body ?? {};
    const a = await createAuction({
      title: String(body.title ?? "Auction"),
      totalItems: Number(body.totalItems ?? 20),
      itemsPerRound: Number(body.itemsPerRound ?? 5),
      roundDurationSec: Number(body.roundDurationSec ?? 60),
      antiSnipeWindowSec: Number(body.antiSnipeWindowSec ?? 15),
      antiSnipeExtendSec: Number(body.antiSnipeExtendSec ?? 30),
      maxExtensionsPerRound: Number(body.maxExtensionsPerRound ?? 3),
    });
    return res.json(a.toObject());
  } catch (e: any) {
    return res.status(400).json({ error: e?.message ?? String(e) });
  }
});

auctionsRouter.post("/:id/start", async (req, res) => {
  try {
    const a = await startAuction(req.params.id);
    return res.json(a.toObject());
  } catch (e: any) {
    return res.status(400).json({ error: e?.message ?? String(e) });
  }
});

auctionsRouter.get("/", async (_req, res) => {
  try {
    const list = await listAuctions();
    return res.json(list);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? String(e) });
  }
});

auctionsRouter.get("/:id", async (req, res) => {
  try {
    const a = await getAuction(req.params.id);
    return res.json(a);
  } catch (e: any) {
    return res.status(404).json({ error: e?.message ?? String(e) });
  }
});

auctionsRouter.get("/:id/bids", async (req, res) => {
  try {
    const limit = Math.min(200, Math.max(1, Number(req.query.limit ?? 50)));
    const bids = await getTopBids(req.params.id, limit);
    return res.json(bids);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? String(e) });
  }
});

auctionsRouter.post("/:id/bid", async (req, res) => {
  try {
    const { userId, amount } = req.body ?? {};
    const bid = await placeOrRaiseBid({
      auctionId: req.params.id,
      userId: String(userId),
      amount: Number(amount),
    });
    return res.json(bid);
  } catch (e: any) {
    const msg = e?.message ?? String(e);
    const status = /not found/i.test(msg) ? 404 : /insufficient|increase|invalid|running|draft|settling|won/i.test(msg) ? 400 : 500;
    return res.status(status).json({ error: msg });
  }
});
