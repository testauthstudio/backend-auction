async function api(path, opts = {}) {
  const r = await fetch(path, {
    headers: { "Content-Type": "application/json" },
    ...opts,
  });

  if (!r.ok) {
    const t = await r.text();
    throw new Error(t || `${r.status}`);
  }
  return r.json();
}

const $ = (id) => document.getElementById(id);

async function loadUsers() {
  // ensure demo users exist
  await api("/api/users/seed", { method: "POST" }).catch(() => {});
  const users = await api("/api/users");

  const userSelect = $("userSelect");
  const userInfo = $("userInfo");

  userSelect.innerHTML = users
    .map((u) => `<option value="${u._id}">${u.nickname}</option>`)
    .join("");

  const saved = localStorage.getItem("activeUserId");
  if (saved && users.some((u) => u._id === saved)) {
    userSelect.value = saved;
  }

  function renderUserInfo() {
    const u = users.find((x) => x._id === userSelect.value);
    if (!u) {
      userInfo.textContent = "";
      return;
    }
    userInfo.textContent = `Balance: avail=${u.balanceAvailable}, locked=${u.balanceLocked}`;
  }

  userSelect.onchange = () => {
    localStorage.setItem("activeUserId", userSelect.value);
    renderUserInfo();
  };

  renderUserInfo();
}

async function refreshAuctions() {
  const list = await api("/api/auctions");
  const ul = $("auctions");
  ul.innerHTML = list
    .map(
      (a) =>
        `<li>
          <a href="/auction.html?id=${a._id}">${a.title}</a>
          <span class="muted">— ${a.status}, round ${a.currentRound}, assigned ${a.itemsAssigned}/${a.totalItems}</span>
        </li>`
    )
    .join("");
}

$("createAuctionBtn").onclick = async () => {
  try {
    const params = {
      title: $("a_title").value,
      totalItems: Number($("a_totalItems").value),
      itemsPerRound: Number($("a_itemsPerRound").value),
      roundDurationSec: Number($("a_roundDurationSec").value),
      antiSnipeWindowSec: Number($("a_antiSnipeWindowSec").value),
      antiSnipeExtendSec: Number($("a_antiSnipeExtendSec").value),
      maxExtensionsPerRound: Number($("a_maxExtensionsPerRound").value),
    };
    const a = await api("/api/auctions", {
      method: "POST",
      body: JSON.stringify(params),
    });
    $("auctionOut").textContent = `Created draft: ${a._id}`;
    await refreshAuctions();
  } catch (e) {
    $("auctionOut").textContent = String(e?.message ?? e);
  }
};

(async () => {
  await loadUsers();
  await refreshAuctions();
})();
