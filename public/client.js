// Identity comes from a server-set cookie (docs/adr/0004), sent
// automatically with every request — the client never generates or reports
// an id of its own.
const cairn = document.getElementById("cairn");
const pile = document.getElementById("pile");
const countEl = document.getElementById("count");
const carryStone = document.getElementById("carry-stone");
const carryHint = document.getElementById("carry-hint");
const dropMarker = document.getElementById("drop-marker");
const dropAnnouncer = document.getElementById("drop-position-announcer");

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
// input recomputeStacking() needs to redo the full stack from scratch (the
// rare fallback path below; the common path never reads this map at all).
const stoneX = new Map();

// worldX/worldTop/sizeWorld per id, in ascending id order — what relayout()
// reads to redraw pixel positions. stackStone() below relies on this Map's
// own iteration order always being ascending id order (every insertion,
// fast-path or fallback, only ever appends in that order), so the highest
// id currently stacked is always its own last key — tracked in
// `maxStackedId` instead of re-reading the Map, which is why the fast path
// is O(1) to check, not O(stones).
const stoneWorld = new Map();
let maxStackedId = -Infinity;

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

// Full rebuild, O(stones²): walks every known id in ascending order,
// restacking everything from an empty pile. Only stackStone()'s rare
// out-of-order fallback below still calls this — the common path (every
// page load, every live drop) never does, see that function's comment for
// why. Kept as its own function because it's still the thing that defines
// "correct": stackStone()'s fast path is only valid because its result is
// provably identical to what a full id-ordered rebuild would produce.
function recomputeStacking() {
  const ids = [...stoneX.keys()].sort((a, b) => a - b);
  stoneWorld.clear();
  for (const id of ids) {
    const worldX = stoneX.get(id) * WORLD_WIDTH;
    const sizeWorld = sizeWorldFor(id);
    const worldTop = stackWorldTop(worldX, sizeWorld, stoneWorld);
    stoneWorld.set(id, { worldX, worldTop, sizeWorld });
  }
  maxStackedId = ids.length > 0 ? ids[ids.length - 1] : -Infinity;
}

// Adds one stone's world position to stoneWorld in O(already-stacked
// stones), not the O(stones²) a full recomputeStacking() costs — the
// difference that keeps a page load of N stones at O(N²) total instead of
// O(N³), and a single live drop at O(current pile size) instead of O(size²).
//
// Safe whenever `id` is larger than every id already stacked: stackWorldTop()
// only ever looks at *already-placed* stones, so an earlier stone's own
// worldTop never depends on anything landing after it — appending id on top
// of the existing stoneWorld, in the existing order, produces exactly the
// worldTop a full id-ordered rebuild would. That's true for every page load
// (the server's own "state" snapshot is already sorted `ORDER BY id ASC`,
// db.ts) and every live drop (ids are globally increasing, so a session's
// own next drop is always the biggest id it's seen). The one case it can't
// be trusted is the race already named where a live "stone" broadcast
// reaches a freshly connecting client before its own "state" catch-up does
// — that can hand this function an id smaller than one already stacked,
// which the fast path can't correct for (inserting a smaller id underneath
// a stone that already rests on top of it would change which one is "on
// top", not just extend the stack), so that case alone falls back to the
// full O(stones²) rebuild. It's rare enough that the fallback's cost never
// shows up in practice.
function stackStone(id, x) {
  stoneX.set(id, x);
  if (id > maxStackedId) {
    const worldX = x * WORLD_WIDTH;
    const sizeWorld = sizeWorldFor(id);
    const worldTop = stackWorldTop(worldX, sizeWorld, stoneWorld);
    stoneWorld.set(id, { worldX, worldTop, sizeWorld });
    maxStackedId = id;
  } else {
    recomputeStacking();
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
  carryHint.textContent =
    "Drag onto the pile above, or focus and use the arrow keys, then Enter / Space";
}

// Creates and stacks one stone (DOM element + world position), but doesn't
// position it on screen or animate it in — relayout() (the O(stones) part
// that has to run after every stone, including a whole batch of them) and
// the landing animation are split out so a bulk load can do the expensive
// per-stone work (DOM creation, stacking) N times but the O(stones) layout
// pass and the animation kickoff only once each, not N times.
function createStoneElement(stone) {
  const el = document.createElement("div");
  el.className = "stone";
  el.dataset.stoneId = String(stone.id);
  el.style.background = stone.color;
  if (stone.mine) el.classList.add("mine");
  el.style.opacity = "0.5";
  pile.appendChild(el);
  landedStones.set(stone.id, el);
  stackStone(stone.id, stone.x);
  return el;
}

function animateLanding(el, stone) {
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
}

// The single live-drop path: one new stone, so the O(stones) relayout() and
// the animation both happen immediately — there's nothing to batch.
function landStone(stone) {
  const el = createStoneElement(stone);
  relayout();
  animateLanding(el, stone);
  updateCount();
}

// A reconnect's "state" push repeats every stone already landed before the
// gap, plus any dropped during it — landing only the ones not already in
// landedStones renders exactly that set instead of duplicating the overlap.
// Unlike landStone(), this stacks and creates every new stone first and
// calls relayout() only once at the end (not once per stone): stacking is
// already O(1) amortised per stone via stackStone()'s fast path, but
// relayout() is O(stones) every time it runs, so calling it once per
// landed stone during a bulk load — rather than once after all of
// them — is what used to make a page load cost O(stones²) above and
// beyond the stacking cost alone. Scrolling once at the end (same
// reasoning) avoids visible jitter when a snapshot lands a whole pile at
// once.
function renderState(stones) {
  const newlyLanded = [];
  for (const stone of stones) {
    if (!landedStones.has(stone.id)) {
      newlyLanded.push({ stone, el: createStoneElement(stone) });
    }
  }
  if (newlyLanded.length === 0) return;

  relayout();
  for (const { stone, el } of newlyLanded) animateLanding(el, stone);
  updateCount();

  const lastNewId = newlyLanded[newlyLanded.length - 1].stone.id;
  scrollNewestIntoView(lastNewId);
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

// x is already a 0..1 fraction of #cairn's own width — both callers (the
// pointer path below, and the keyboard path further down) convert their own
// coordinate space into that fraction before calling this.
function dropAt(x) {
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "drop", x }));
  }
}

function dropAtClientX(clientX) {
  const rect = cairn.getBoundingClientRect();
  dropAt(Math.min(1, Math.max(0, (clientX - rect.left) / rect.width)));
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
  if (inside) dropAtClientX(event.clientX);
});

// --- Keyboard drop ------------------------------------------------------
//
// There's no cursor position for a keyboard user to carry to, so Left/Right
// moves a visible marker instead — starting centred, in 5% steps (20% with
// Shift), clamped to the pile's edges. Enter/Space drops at the marker's
// current position, giving a keyboard-only visitor the same choice of where
// to land a stone that a mouse or touch drag already has.
const ARROW_STEP = 0.05;
const ARROW_STEP_SHIFT = 0.2;
let markerX = 0.5;

function renderMarker() {
  dropMarker.style.left = `${markerX * 100}%`;
}

function showMarker() {
  markerX = 0.5;
  renderMarker();
  dropMarker.hidden = false;
  dropAnnouncer.textContent = "Drop position: 50% across";
}

function hideMarker() {
  dropMarker.hidden = true;
}

carryStone.addEventListener("focus", showMarker);
carryStone.addEventListener("blur", hideMarker);

carryStone.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    const step = event.shiftKey ? ARROW_STEP_SHIFT : ARROW_STEP;
    const delta = event.key === "ArrowRight" ? step : -step;
    markerX = Math.min(1, Math.max(0, markerX + delta));
    renderMarker();
    dropAnnouncer.textContent = `Drop position: ${Math.round(markerX * 100)}% across`;
    return;
  }
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  dropAt(markerX);
});
