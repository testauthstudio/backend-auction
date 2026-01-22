import express from "express";
import path from "path";
import dotenv from "dotenv";
import mongoose from "mongoose";

import { usersRouter } from "./routes/users.js";
import { auctionsRouter } from "./routes/auctions.js";

dotenv.config();

const PORT = Number(process.env.PORT || 3000);
const MONGO_URI = process.env.MONGO_URI!;

// ⬇️ КЛЮЧЕВОЕ ИЗМЕНЕНИЕ
const publicDir = path.join(process.cwd(), "public");

async function connectMongo() {
  try {
    await mongoose.connect(MONGO_URI);
    console.log("[db] connected");
  } catch (e) {
    console.error("[db] failed, retrying...");
    setTimeout(connectMongo, 3000);
  }
}

async function main() {
  const app = express();

  app.use(express.json());

  app.get("/api/health", (_req, res) => res.json({ ok: true }));

  app.use("/api/users", usersRouter);
  app.use("/api/auctions", auctionsRouter);

  // ✅ СТАТИКА
  app.use(express.static(publicDir));

  app.get("/", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.listen(PORT, () => {
    console.log(`[app] listening on http://localhost:${PORT}`);
  });

  connectMongo();
}

process.on("SIGTERM", () => {
  console.log("[process] SIGTERM");
});

process.on("SIGINT", () => {
  console.log("[process] SIGINT");
});

main();
