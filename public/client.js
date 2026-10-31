// Identity comes from a server-set cookie (docs/adr/0004), sent
// automatically with every request — the client never generates or reports
// an id of its own.
const cairn = document.getElementById("cairn");
const pile = document.getElementById("pile");
const countEl = document.getElementById("count");
const carryStone = document.getElementById("carry-stone");
const carryHint = document.getElementById("carry-hint");

// Keyed by id so a reconnect's "state" push (laptop sleep, network blip,
// server restart — client.js's own "close" handler reconnects automatically)
// can render exactly the server's current set without duplicating whatever
// was already landed from before the drop.
const landedStones = new Map();

// --- Pile layout ------------------------------------------------------
//
// Every stone's position is first worked out in a fixed "world" coordinate
// space (100 units wide, 60 tall — the same 5:3 ratio #cairn's CSS
// aspect-ratio enforces) and only turned into pixels right before painting.
// A phone and a laptop session therefore compute the exact same world
// positions for the same set of stones — a pixel-space layout keyed off
// cairn.clientWidth would instead give each viewport a differently shaped
// pile. World units never change once a stone lands; only the pixel
// conversion (pxPerUnit, and the zoom-to-fit scale below) depends on the
// viewport, and gets recomputed on every resize.
const WORLD_WIDTH = 100;
const WORLD_HEIGHT = 60;
const GROUND_FRACTION = 0.7; // matches the ground line in style.css's gradient
const GROUND_Y = WORLD_HEIGHT * GROUND_FRACTION;

// Below this, stones stop shrinking to fit a taller pile and #cairn scrolls
// instead — chosen so even the smallest stone (sizeWorld ~4 units) stays a
// visible, roughly thumb-sized mark rather than shrinking to a speck.
const MIN_SCALE = 0.5;

// Every known stone's x (0..1, as sent by the server) keyed by id — the raw
// input recomputeStacking() needs to redo the full stack from scratch.
const stoneX = new Map();

// worldX/worldTop/sizeWorld per id, as of the last recomputeStacking() —
// what relayout() reads to redraw pixel positions.
const stoneWorld = new Map();

function sizeWorldFor(id) {
  return 4 + (id % 5) * 0.6;
}

// Rests one stone's bottom edge on the ground, or on the top of the highest
// stone in `placed` it overlaps horizontally — whichever is higher.
function stackWorldTop(worldX, sizeWorld, placed) {
  let restingBottom = GROUND_Y;
  const halfWidth = sizeWorld / 2;
  for (const other of placed.values()) {
    const overlaps = Math.abs(worldX - other.worldX) < halfWidth + other.sizeWorld / 2;
    if (overlaps) restingBottom = Math.min(restingBottom, other.worldTop);
  }
  return restingBottom - sizeWorld;
}

// Recomputes every stone's world position from scratch, strictly in
// ascending id order — not the order stones happened to arrive in this
// session. A live "stone" broadcast can in principle reach a freshly
// connecting client before its own "state" snapshot does (see the race noted
// where landedStones is checked below), which would make *arrival* order
// differ between two sessions watching the same pile; id order never does,
// since every id is permanent and globally ordered. Re-deriving the whole
// stack by id on every change — rather than only stacking each new stone
// once, on top of whatever arrived earlier — is what actually guarantees two
// sessions converge on the identical pile shape, not just a similar one.
function recomputeStacking() {
  const ids = [...stoneX.keys()].sort((a, b) => a - b);
  stoneWorld.clear();
  for (const id of ids) {
    const worldX = stoneX.get(id) * WORLD_WIDTH;
    const sizeWorld = sizeWorldFor(id);
    const worldTop = stackWorldTop(worldX, sizeWorld, stoneWorld);
    stoneWorld.set(id, { worldX, worldTop, sizeWorld });
  }
}

// Recomputes every landed stone's pixel position from its stored world
// coordinates — called after a new stone lands (the zoom-to-fit scale can
// change as the pile grows) and on every #cairn resize (ResizeObserver
// below). Never touches stoneWorld, only the DOM.
function relayout() {
  if (stoneWorld.size === 0) return;
  const cairnWidthPx = cairn.clientWidth;
  const cairnHeightPx = cairnWidthPx * (WORLD_HEIGHT / WORLD_WIDTH);
  const pxPerUnit = cairnWidthPx / WORLD_WIDTH;

  let minTop = GROUND_Y;
  for (const placed of stoneWorld.values()) minTop = Math.min(minTop, placed.worldTop);
  const pileWorldHeight = GROUND_Y - minTop;

  const idealScale = pileWorldHeight > 0 ? Math.min(1, GROUND_Y / pileWorldHeight) : 1;
  const scale = Math.max(idealScale, MIN_SCALE);

  // Once scale has bottomed out at MIN_SCALE, a tall pile no longer fits in
  // #cairn's own height — #pile grows taller than #cairn by that overflow,
  // and #cairn's own `overflow-y: auto` (style.css) turns that into a
  // scrollbar rather than clipping the top of the pile off.
  const scaledPileHeight = pileWorldHeight * scale;
  const overflowPx = Math.max(0, scaledPileHeight - GROUND_Y) * pxPerUnit;
  const groundPxInPile = cairnHeightPx * GROUND_FRACTION + overflowPx;

  pile.style.height = `${cairnHeightPx + overflowPx}px`;
  pile.style.setProperty("--ground-top", `${groundPxInPile}px`);

  for (const [id, placed] of stoneWorld) {
    const el = landedStones.get(id);
    if (!el) continue;
    const worldCenterX = placed.worldX;
    const worldCenterY = placed.worldTop + placed.sizeWorld / 2;
    const pxSize = placed.sizeWorld * pxPerUnit * scale;
    const pxCenterX = cairnWidthPx / 2 + (worldCenterX - WORLD_WIDTH / 2) * pxPerUnit * scale;
    const pxCenterY = groundPxInPile - (GROUND_Y - worldCenterY) * pxPerUnit * scale;
    el.style.width = `${pxSize}px`;
    el.style.height = `${pxSize}px`;
    el.style.left = `${pxCenterX - pxSize / 2}px`;
    el.style.top = `${pxCenterY - pxSize / 2}px`;
  }
}

// Scrolls #cairn so the most recently landed stone stays visible once the
// pile has outgrown MIN_SCALE and started scrolling instead of shrinking
// further — otherwise a visitor watching the pile grow would see it stop
// changing the moment it starts scrolling, with new stones landing off the
// top edge.
function scrollNewestIntoView(id) {
  const el = landedStones.get(id);
  if (!el || cairn.scrollHeight <= cairn.clientHeight) return;
  const target = el.offsetTop + el.offsetHeight / 2 - cairn.clientHeight / 2;
  cairn.scrollTop = Math.max(0, Math.min(target, cairn.scrollHeight - cairn.clientHeight));
}

new ResizeObserver(relayout).observe(cairn);

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

function landStone(stone) {
  const el = document.createElement("div");
  el.className = "stone";
  el.dataset.stoneId = String(stone.id);
  el.style.background = stone.color;
  if (stone.mine) el.classList.add("mine");
  el.style.opacity = "0.5";
  pile.appendChild(el);
  landedStones.set(stone.id, el);

  // World-space stacking (see the block above), always recomputed in id
  // order from every known stone — not just this one stacked on top of
  // whatever happened to already be in the DOM — so the result never
  // depends on the order stones arrived in this particular session.
  stoneX.set(stone.id, stone.x);
  recomputeStacking();
  relayout();

  const restTransform = `translateY(0) scale(1) rotate(${stone.rotation}deg)`;
  el.style.transform = `translateY(-60px) scale(0.6) rotate(${stone.rotation}deg)`;

  // Two frames so the browser paints the "carried" state before the
  // transition to "landed" starts, instead of collapsing both into one.
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      el.style.transform = restTransform;
      el.style.opacity = "1";
    });
  });

  updateCount();
}

// A reconnect's "state" push repeats every stone already landed before the
// gap, plus any dropped during it — landing only the ones not already in
// landedStones renders exactly that set instead of duplicating the overlap.
// Scrolling once at the end (rather than per stone) avoids visible jitter
// when a snapshot lands a whole pile at once.
function renderState(stones) {
  let lastNewId;
  for (const stone of stones) {
    if (!landedStones.has(stone.id)) {
      landStone(stone);
      lastNewId = stone.id;
    }
  }
  if (lastNewId !== undefined) scrollNewestIntoView(lastNewId);
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
      if (!landedStones.has(message.stone.id)) {
        landStone(message.stone);
        scrollNewestIntoView(message.stone.id);
      }
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
