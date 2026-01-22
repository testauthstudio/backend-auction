import { settleDueAuctionsOnce } from "../service/auction.service.js";

export function startRoundWorker() {
  // Simple polling worker. For MVP it's enough.
  const intervalMs = 1000;

  const timer = setInterval(async () => {
    try {
      const results = await settleDueAuctionsOnce();
      // Keep logs minimal but useful
      for (const r of results) {
        if ((r as any).error) {
          console.error("[settle]", r);
        } else if ((r as any).settled) {
          console.log("[settle]", r);
        }
      }
    } catch (e: any) {
      console.error("[worker]", e?.message ?? String(e));
    }
  }, intervalMs);

  timer.unref();
  return () => clearInterval(timer);
}
