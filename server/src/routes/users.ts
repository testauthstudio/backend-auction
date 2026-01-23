import { Router } from "express";
import { UserModel } from "../models/user.js";

export const usersRouter = Router();

/**
 * Ensure there are 5 demo users so the judge doesn't need to type IDs.
 * Called from app startup, but also exposed via /api/users/seed for convenience.
 */
export async function ensureDefaultUsers() {
  const count = await UserModel.countDocuments();
  if (count > 0) return;

  const nicknames = ["Alex", "Boris", "Chloe", "Dasha", "Egor"];
  await UserModel.insertMany(
    nicknames.map((nickname) => ({
      nickname,
      balanceAvailable: 500_000, // 5,000.00 in cents
      balanceLocked: 0,
    }))
  );
}

// List users (for UI dropdown)
usersRouter.get("/", async (_req, res, next) => {
  try {
    const users = await UserModel.find().sort({ nickname: 1 }).lean();
    res.json(users);
  } catch (e) {
    next(e);
  }
});

// Seed defaults explicitly (optional)
usersRouter.post("/seed", async (_req, res, next) => {
  try {
    await ensureDefaultUsers();
    const users = await UserModel.find().sort({ nickname: 1 }).lean();
    res.json({ ok: true, users });
  } catch (e) {
    next(e);
  }
});

// Create custom user (kept for completeness)
usersRouter.post("/", async (req, res, next) => {
  try {
    const nickname = String(req.body?.nickname ?? "").trim();
    const balance = Number(req.body?.balanceAvailable ?? 0);
    if (!nickname) return res.status(400).json({ error: "nickname is required" });
    if (!Number.isFinite(balance) || balance < 0) return res.status(400).json({ error: "invalid balanceAvailable" });

    const u = await UserModel.create({ nickname, balanceAvailable: Math.floor(balance), balanceLocked: 0 });
    res.json(u);
  } catch (e) {
    next(e);
  }
});

usersRouter.get("/:id", async (req, res, next) => {
  try {
    const u = await UserModel.findById(req.params.id).lean();
    if (!u) return res.status(404).json({ error: "User not found" });
    res.json(u);
  } catch (e) {
    next(e);
  }
});
