import { Router } from "express";
import { UserModel } from "../models/user.js";

export const usersRouter = Router();

usersRouter.post("/", async (req, res) => {
  try {
    const balanceAvailable = Number(req.body?.balanceAvailable ?? 0);
    if (!Number.isInteger(balanceAvailable) || balanceAvailable < 0) {
      return res.status(400).json({ error: "balanceAvailable must be non-negative integer (cents)" });
    }
    const u = await UserModel.create({ balanceAvailable, balanceLocked: 0 });
    return res.json(u.toObject());
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? String(e) });
  }
});

usersRouter.get("/:id", async (req, res) => {
  try {
    const u = await UserModel.findById(req.params.id).lean();
    if (!u) return res.status(404).json({ error: "User not found" });
    return res.json(u);
  } catch (e: any) {
    return res.status(500).json({ error: e?.message ?? String(e) });
  }
});
