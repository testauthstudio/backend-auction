async function api(path, opts = {}) {
  const res = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

const $ = (id) => document.getElementById(id);

async function refreshAuctions() {
  const list = await api("/api/auctions");
  const root = $("list");
  root.innerHTML = "";
  for (const a of list) {
    const div = document.createElement("div");
    div.className = "card";
    const ends = a.roundEndsAt ? new Date(a.roundEndsAt).toLocaleString() : "-";
    div.innerHTML = `
      <div><b>${a.title}</b></div>
      <div class="muted">id: ${a._id}</div>
      <div class="muted">status: ${a.status}, round: ${a.currentRound}, ends: ${ends}</div>
      <div class="muted">items: ${a.itemsAssigned}/${a.totalItems}, per round: ${a.itemsPerRound}</div>
      <div class="row" style="margin-top:8px">
        <a href="/auction.html?id=${a._id}">Open auction</a>
        <span class="muted">|</span>
        <a href="/balance.html">Balance page</a>
      </div>
    `;
    root.appendChild(div);
  }
}

$("createUserBtn").onclick = async () => {
  try {
    const balanceAvailable = Number($("userBalance").value);
    const u = await api("/api/users", {
      method: "POST",
      body: JSON.stringify({ balanceAvailable }),
    });
    $("userOut").innerHTML = `Created: <code>${u._id}</code> — <a href="/balance.html?id=${u._id}">open balance</a>`;
  } catch (e) {
    $("userOut").textContent = e.message;
  }
};

$("createAuctionBtn").onclick = async () => {
  try {
    const payload = {
      title: $("title").value,
      totalItems: Number($("totalItems").value),
      itemsPerRound: Number($("itemsPerRound").value),
      roundDurationSec: Number($("roundDurationSec").value),
      antiSnipeWindowSec: Number($("antiWindow").value),
      antiSnipeExtendSec: Number($("antiExtend").value),
      maxExtensionsPerRound: Number($("antiMax").value),
    };
    const a = await api("/api/auctions", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    $("auctionOut").innerHTML = `Created: <code>${a._id}</code> — <a href="/auction.html?id=${a._id}">open</a>`;
    await refreshAuctions();
  } catch (e) {
    $("auctionOut").textContent = e.message;
  }
};

refreshAuctions();
setInterval(refreshAuctions, 3000);
