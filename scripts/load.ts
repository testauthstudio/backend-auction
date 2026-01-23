import axios from "axios";

const BASE = process.env.BASE ?? "http://localhost:3000";
const BOTS = Number(process.env.BOTS ?? 50);
const INITIAL_BALANCE = Number(process.env.INITIAL_BALANCE ?? 100000); // cents
const MAX_BID = Number(process.env.MAX_BID ?? 20000); // cents

const AUCTION_ITEMS = Number(process.env.AUCTION_ITEMS ?? 20);
const ITEMS_PER_ROUND = Number(process.env.ITEMS_PER_ROUND ?? 5);
const ROUND_SEC = Number(process.env.ROUND_SEC ?? 30);

const ANTI_WINDOW = Number(process.env.ANTI_WINDOW ?? 10);
const ANTI_EXTEND = Number(process.env.ANTI_EXTEND ?? 15);
const ANTI_MAX = Number(process.env.ANTI_MAX ?? 3);

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

async function main() {
  console.log("[load] base:", BASE);

  // create users
  const users: string[] = [];
  for (let i = 0; i < BOTS; i++) {
    const u = await axios.post(`${BASE}/api/users`, {
      nickname: `bot_${i + 1}`,
      balanceAvailable: INITIAL_BALANCE,
    }).then(r => r.data);
    users.push(u._id);
  }
  console.log("[load] created users:", users.length);

  // create auction
  const auction = await axios.post(`${BASE}/api/auctions`, {
    title: "Load Test Auction",
    totalItems: AUCTION_ITEMS,
    itemsPerRound: ITEMS_PER_ROUND,
    roundDurationSec: ROUND_SEC,
    antiSnipeWindowSec: ANTI_WINDOW,
    antiSnipeExtendSec: ANTI_EXTEND,
    maxExtensionsPerRound: ANTI_MAX,
  }).then(r => r.data);

  console.log("[load] created auction:", auction._id);

  // start
  await axios.post(`${BASE}/api/auctions/${auction._id}/start`);
  console.log("[load] started");

  let running = true;

  async function pollFinish() {
    while (running) {
      const a = await axios.get(`${BASE}/api/auctions/${auction._id}`).then(r => r.data);
      if (a.status === "finished") {
        running = false;
        console.log("[load] finished. assigned:", a.itemsAssigned);
        break;
      }
      await sleep(1000);
    }
  }

  async function botLoop(userId: string, idx: number) {
    let my = 0;
    while (running) {
      try {
        // try to snipe more often near end:
        const a = await axios.get(`${BASE}/api/auctions/${auction._id}`).then(r => r.data);
        const endsAt = a.roundEndsAt ? new Date(a.roundEndsAt).getTime() : 0;
        const msLeft = endsAt - Date.now();

        // pause pattern: if near end, shorter sleep
        const baseWait = msLeft < 5000 ? 50 + Math.random() * 120 : 200 + Math.random() * 600;
        await sleep(baseWait);

        // increase occasionally
        if (Math.random() < 0.6) {
          const inc = 100 + Math.floor(Math.random() * 500);
          const target = Math.min(MAX_BID, my + inc);
          if (target <= my) continue;

          const r = await axios.post(`${BASE}/api/auctions/${auction._id}/bid`, { userId, amount: target });
          my = r.data.amount;
        }
      } catch (e: any) {
        // ignore expected errors (insufficient, already won, settling)
        const msg = e?.response?.data?.error ?? e?.message ?? String(e);
        if (!/already won|insufficient|settling|Round is settling|not running/i.test(msg)) {
          console.log("[bot err]", idx, msg);
        }
        await sleep(150 + Math.random() * 300);
      }
    }
  }

  // run
  await Promise.race([
    pollFinish(),
    Promise.all(users.map((u, i) => botLoop(u, i))).then(() => {})
  ]);

  // show a few results
  const bids = await axios.get(`${BASE}/api/auctions/${auction._id}/bids?limit=50`).then(r => r.data);
  const won = bids.filter((b: any) => b.status === "won").length;
  console.log("[load] top bids (won in list):", won);

  // balances consistency spot check
  const sample = users.slice(0, Math.min(5, users.length));
  for (const id of sample) {
    const u = await axios.get(`${BASE}/api/users/${id}`).then(r => r.data);
    console.log("[user]", id, "avail", u.balanceAvailable, "locked", u.balanceLocked);
  }
}

main().catch((e) => {
  console.error(e?.response?.data ?? e);
  process.exit(1);
});
