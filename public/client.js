const VISITOR_ID_KEY = "cairn-visitor-id";

function getVisitorId() {
  let id = localStorage.getItem(VISITOR_ID_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VISITOR_ID_KEY, id);
  }
  return id;
}

const visitorId = getVisitorId();
const cairn = document.getElementById("cairn");
const countEl = document.getElementById("count");
const carryStone = document.getElementById("carry-stone");

let stoneCount = 0;

function updateCount() {
  countEl.textContent =
    stoneCount === 1 ? "1 stone placed so far" : `${stoneCount} stones placed so far`;
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
  const size = 22 + (stone.id % 5) * 3;
  const restTransform = `translateY(0) scale(1) rotate(${stone.rotation}deg)`;

  el.style.width = `${size}px`;
  el.style.height = `${size}px`;
  el.style.left = `calc(${stone.x * 100}% - ${size / 2}px)`;
  el.style.top = `${restingTop(stone, size)}px`;
  el.style.background = stone.color;
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

  stoneCount += 1;
  updateCount();
}

function connect() {
  const protocol = location.protocol === "https:" ? "wss:" : "ws:";
  const ws = new WebSocket(`${protocol}//${location.host}/ws`);

  ws.addEventListener("message", (event) => {
    const message = JSON.parse(event.data);
    if (message.type === "state") {
      for (const stone of message.stones) landStone(stone);
    } else if (message.type === "stone") {
      landStone(message.stone);
    }
  });

  ws.addEventListener("close", () => {
    setTimeout(connect, 1000);
  });

  return ws;
}

let socket = connect();

function drop(clientX) {
  const rect = cairn.getBoundingClientRect();
  const x = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
  if (socket.readyState === WebSocket.OPEN) {
    socket.send(JSON.stringify({ type: "drop", visitorId, x }));
  }
}

// Pointer Events cover mouse and touch alike: carry (pointerdown + move),
// drop (pointerup inside the cairn), watch it land (the server's broadcast
// triggers landStone() for every open session, this one included).
let dragging = false;

carryStone.addEventListener("pointerdown", (event) => {
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
