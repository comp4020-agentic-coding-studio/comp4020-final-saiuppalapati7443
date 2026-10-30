// Identity comes from a server-set cookie (docs/adr/0004), sent
// automatically with every request — the client never generates or reports
// an id of its own.
const cairn = document.getElementById("cairn");
const countEl = document.getElementById("count");
const carryStone = document.getElementById("carry-stone");
const carryHint = document.getElementById("carry-hint");

// Keyed by id so a reconnect's "state" push (laptop sleep, network blip,
// server restart — client.js's own "close" handler reconnects automatically)
// can render exactly the server's current set without duplicating whatever
// was already landed from before the drop.
const landedStones = new Map();

function updateCount() {
  const stoneCount = landedStones.size;
  countEl.textContent =
    stoneCount === 1 ? "1 stone placed so far" : `${stoneCount} stones placed so far`;
}

// Purely descriptive (the server enforces the real limit on every drop
// regardless of this): once a visitor's placed today, the carry stone stops
// inviting another drag, so "one stone a day" is something a newcomer can
// see, not just something that silently does nothing if they try twice.
function markPlacedToday() {
  carryStone.setAttribute("aria-disabled", "true");
  carryStone.tabIndex = -1;
  carryHint.textContent = "You've placed your stone for today — come back tomorrow.";
}

// While the socket isn't open, a drag landing on the pile would otherwise
// silently do nothing (drop() no-ops when the socket isn't OPEN) — this
// makes that visible instead, and stops the carry stone from inviting a drag
// that can't go anywhere. Cleared by onConnected() the moment a fresh
// connection's "open" fires.
function markDisconnected() {
  carryStone.setAttribute("aria-disabled", "true");
  carryStone.tabIndex = -1;
  carryHint.textContent = "Reconnecting…";
}

function onConnected() {
  carryStone.removeAttribute("aria-disabled");
  carryStone.tabIndex = 0;
  carryHint.textContent = "Drag onto the pile above, or press Enter / Space";
}

// The ground line in style.css sits at 70% of the container's height; stones
// pile up from there, nudged higher as more land near the same spot.
function restingTop(stone, size) {
  const groundY = cairn.clientHeight * 0.7;
  const pileRise = (stone.id % 18) * 3;
  return groundY - pileRise - size;
}

function landStone(stone) {
  const el = document.createElement("div");
  el.className = "stone";
  el.dataset.stoneId = String(stone.id);
  const size = 22 + (stone.id % 5) * 3;
  const restTransform = `translateY(0) scale(1) rotate(${stone.rotation}deg)`;

  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.left = `calc(${stone.x * 100}% - ${size / 2}px)`;
  el.style.top = `${restingTop(stone, size)}px`;
  el.style.background = stone.color;
  if (stone.mine) el.classList.add("mine");
  el.style.opacity = "0.5";
  el.style.transform = `translateY(-60px) scale(0.6) rotate(${stone.rotation}deg)`;
  cairn.appendChild(el);

  // Two frames so the browser paints the "carried" state before the
  // transition to "landed" starts, instead of collapsing both into one.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.transform = restTransform;
      el.style.opacity = "1";
    });
  });

  landedStones.set(stone.id, el);
  updateCount();
}

// A reconnect's "state" push repeats every stone already landed before the
// gap, plus any dropped during it — landing only the ones not already in
// landedStones renders exactly that set instead of duplicating the overlap.
function renderState(stones) {
  for (const stone of stones) {
    if (!landedStones.has(stone.id)) landStone(stone);
  }
}

function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${location.host}/ws`);
  // Exposed only so a browser test can force a reconnect deterministically
  // (closing the real socket) instead of guessing how long a simulated
  // network drop takes to surface as a "close" event.
  window.__cairnSocketForTest = ws;

  // Reported once so a first-time arrival can be logged with the viewport it
  // actually showed up on (server-side, see src/server.ts) — purely
  // descriptive, never used to decide anything.
  ws.addEventListener("open", () => {
    onConnected();
    ws.send(JSON.stringify({ type: "hello", width: window.innerWidth, height: window.innerHeight }));
  });

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "state") {
      renderState(message.stones);
      if (message.placedToday) markPlacedToday();
    } else if (message.type === "stone") {
      // A reconnect can race the server's own broadcast arriving just before
      // the fresh connection's "state" snapshot (or vice versa) — whichever
      // arrives second must not re-land a stone the first already drew.
      if (!landedStones.has(message.stone.id)) landStone(message.stone);
      if (message.stone.mine) markPlacedToday();
    } else if (message.type === "refused") {
      // The server enforces the one-stone-a-day limit; this is purely so a
      // visitor who still tries (the UI should already have disabled the
      // carry stone, but a drop in flight when the limit landed is possible)
      // is told why nothing happened, instead of it just silently not
      // landing.
      if (message.reason === "already-placed-today") markPlacedToday();
    }
  });

  ws.addEventListener("close", () => {
    // Never pretend a drop landed once the socket this function closed over
    // is gone — markDisconnected() both shows that and stops a drag from
    // starting against a closed socket.
    markDisconnected();
    setTimeout(connect, 1000);
  });

  return ws;
}

let socket = connect();

function drop(clientX) {
  const rect = cairn.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "drop", x }));
  }
}

// Pointer Events cover mouse and touch alike: carry (pointerdown + move),
// drop (pointerup inside the cairn), watch it land (the server's broadcast
// triggers landStone() for every open session, this one included).
let dragging = false;

carryStone.addEventListener("pointerdown", (event) => {
  if (carryStone.getAttribute("aria-disabled") === "true") return;
  dragging = true;
  carryStone.setPointerCapture(event.pointerId);
  carryStone.classList.add("dragging");
});

carryStone.addEventListener("pointermove", (event) => {
  if (!dragging) return;
  carryStone.style.left = `${event.clientX}px`;
  carryStone.style.top = `${event.clientY}px`;
});

carryStone.addEventListener("pointerup", (event) => {
  if (!dragging) return;
  dragging = false;
  carryStone.classList.remove("dragging");
  carryStone.style.left = "";
  carryStone.style.top = "";

  const rect = cairn.getBoundingClientRect();
  const inside =
    event.clientX >= rect.left &&
    event.clientX <= rect.right &&
    event.clientY >= rect.top &&
    event.clientY <= rect.bottom;
  if (inside) drop(event.clientX);
});

// Keyboard parity for the drag: there's no cursor position to carry to, so
// Enter/Space drops at the cairn's horizontal centre — a fixed, predictable
// spot rather than guessing at one.
carryStone.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  const rect = cairn.getBoundingClientRect();
  drop(rect.left + rect.width / 2);
});
