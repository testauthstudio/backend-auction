import express from "express";
import path from "path";
import dotenv from "dotenv";
import { connectDb } from "./db.js";
import { usersRouter, ensureDefaultUsers } from "./routes/users.js";
import { auctionsRouter } from "./routes/auctions.js";
import { startRoundWorker } from "./worker/rounds.js";
dotenv.config();
const PORT = Number(process.env.PORT ?? 3000);
// For local Docker usage we provide a safe default.
// Compose sets MONGO_URI explicitly, but this makes the app runnable without env files.
const MONGO_URI = String(process.env.MONGO_URI ?? "mongodb://mongo:27017/auction?replicaSet=rs0");
// IMPORTANT:
// We run compiled JS from /app/dist/..., but static files are copied as /app/server/public.
// Using process.cwd() makes this path stable in both dev and Docker.
const publicDir = path.join(process.cwd(), "server", "public");
async function bootstrap() {
    await connectDb(MONGO_URI);
    console.log("[db] connected");
    // Seed 5 demo users (id + nickname) once.
    await ensureDefaultUsers();
    const app = express();
    app.use(express.json());
    app.get("/api/health", (_req, res) => res.json({ ok: true }));
    app.use("/api/users", usersRouter);
    app.use("/api/auctions", auctionsRouter);
    // UI
    app.use(express.static(publicDir));
    app.get("/", (_req, res) => res.sendFile(path.join(publicDir, "index.html")));
    // Background worker: settles rounds and advances auction state.
    startRoundWorker();
    const server = app.listen(PORT, () => {
        console.log(`[app] listening on http://localhost:${PORT}`);
    });
    const shutdown = (signal) => {
        console.log(`[process] ${signal}`);
        server.close(() => process.exit(0));
    };
    process.on("SIGTERM", () => shutdown("SIGTERM"));
    process.on("SIGINT", () => shutdown("SIGINT"));
}
bootstrap().catch((err) => {
    console.error("[fatal]", err);
    process.exit(1);
});
