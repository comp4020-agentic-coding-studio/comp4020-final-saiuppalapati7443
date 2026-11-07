# Rules for working on Cairn

Derived from README.md's claims and the two decisions in `docs/adr/`. These are
the standards a change must meet, not a description of how the app happens to
work today.

## What every change must hold to

- `/` answers 200 and `/readme/` publishes README.md's actual content, rendered
  at request time — not a cached or stale copy. `spec/invariants.test.ts` is
  the floor this guarantees, not the whole claim.
- Anything arriving over `/ws` is untrusted input: validate it (`x` must be a
  finite number in `[0, 1]`) before it reaches `node:sqlite` or gets broadcast
  to anyone else. A value failing validation is dropped silently — it never
  crashes the connection and never gets a second chance at being "mostly
  valid." A `visitorId` field in a message body is not validated at all —
  it's simply never read (`docs/adr/0004-who-may-see-and-change-what.md`):
  identity resolves only from the server-set cookie on the HTTP/upgrade
  request (`src/identity.ts`), so there's nothing to check a client-claimed
  id against.
- No accounts, logins, names, or anything else that identifies a person beyond
  the hue derived from a server-set cookie id
  (`docs/adr/0002-visitor-identity.md`, transport amended by
  `docs/adr/0004-who-may-see-and-change-what.md`). Don't add a field that
  makes that untrue without updating those ADRs and README.md together — it's
  a claim visitors are relying on, not an implementation detail.
- The sqlite file at `${DATA_DIR}/cairn.db` is the single source of truth.
  Nothing a client depends on across a reconnect may live only in server
  memory.
- Carrying a stone (the drag before it lands) never reaches `/ws` and is never
  broadcast — only a completed drop is (`docs/adr/0003-carry-stays-local.md`).
  If you're tempted to relay an in-progress drag, a cursor position, or any
  other "someone is doing something" signal live to other clients: don't —
  that reopens a decision already made against it. Changing this means
  rewriting ADR 0003 and README.md together, not adding a new message type
  quietly.
- No build step. `node src/server.ts` is the entire run command, in `pnpm dev`
  and in the image (`docs/adr/0001-stack.md`). If a TypeScript construct needs
  a build step to work (enums, namespaces, constructor parameter-property
  shorthand), don't use that construct — don't add the build step.
- A new `spec/*.test.ts` file tests a claim actually written in README.md, not
  an implementation detail nobody promised.
- A dropped stone must reach every other open session within about a second —
  `spec/cairn.test.ts`'s "delivers a dropped stone to another open session
  within 1000ms" is the floor this guarantees. No change may add a delay,
  batching, or polling to the broadcast path (`wss.on("connection", ...)`'s
  `ws.on("message", ...)` handler in `src/server.ts`, which sends a `"stone"`
  message to every open client synchronously, in the same tick as the insert)
  to make it cheaper, smoother, or more efficient — a queued or debounced
  broadcast would still be "eventually consistent," but README promises "the
  same moment," not eventually.

## What a change must never break

- `pnpm check` (typecheck + every spec file) stays green against a freshly
  started app.
- A malformed or hostile WebSocket message never crashes the server or reaches
  another client.
- `docker build` + `docker run` still serves `/` and `/readme/` the same way
  `node src/server.ts` does locally — the Dockerfile has no build stage to
  diverge from the source.

## What must never happen (`docs/adr/0004-who-may-see-and-change-what.md`)

- Identity must never be read from a WebSocket message body. `visitorId`,
  `name`, `mine`, `id`, or any other identity-shaped field a client sends in
  a `drop` message is data to ignore, not trust — the cookie resolved
  server-side on the HTTP/upgrade request (`src/identity.ts`) is the only
  source of truth for who is making a request. Don't add a code path that
  reads identity from anywhere else, even "just to check it matches."
- A tampered or forged cookie (not a UUID the server itself could have
  minted) must never be repaired, reused, or treated as an existing
  identity — it gets a brand-new one, the same as no cookie at all. There
  must be no path from "the client sent this string" to "the server treats
  it as an existing visitor" other than that string being a cookie the
  server itself previously set.
- A stone, once placed, must never be moved, edited, or deleted — by anyone,
  including its own owner. Don't add a message type, an HTTP route, or a
  server-side function that could mutate or remove an existing `stones` row.
  If a feature seems to need one, that's a reason to revisit this ADR in
  writing, not to add the capability quietly.
- A response must never contain a visitor's cookie id, in any field, for any
  stone, including the viewer's own. The only identity-shaped thing a wire
  message may carry is the boolean `mine`, computed server-side by comparing
  a stone's stored id against the viewer's own cookie — never the id itself.
- A visitor must never be able to place more than one stone per Canberra
  calendar day by changing what they send — the limit is checked against the
  cookie-resolved identity, so sending a different claimed id, a different
  connection, or a different message shape must not bypass it. (Clearing
  cookies or using a different browser legitimately resets the count, same
  as ADR 0002 already accepted for color — that's a known limit of anonymous
  identity, not a bypass to close.)
- Every action that changes shared state (a placed stone, or an attempt
  rejected at the server) must log who did it, one line to stdout, in the
  form `<type>  <pseudonym>#<handle> <detail>` (`src/log.ts`). A cookie id
  must never be logged, anywhere, for any reason — not in a detail string,
  not in an error message, not even truncated. Only `src/pseudonym.ts`'s
  one-way `publicId()` may stand in for a visitor in a log line.

## Corrections (things actually caught and fixed this session)

- **The markdown renderer re-rendered markdown inside code spans.** The first
  version of `src/readme.ts` ran the image/link patterns over text that
  already contained rendered `<code>` spans, so a literal `` `![alt](src)` ``
  — backticked specifically so it would display as text — got turned into a
  nested `<img>` instead. Fixed by pulling code spans out behind placeholder
  tokens before any other inline pattern runs, and restoring them last. Rule:
  once text is inside a code span, no other inline rule may touch it again.
- **A WebSocket test harness race dropped messages.** The first version of
  `spec/cairn.test.ts` attached `ws.once("message", ...)` only after
  `await connect()` had already resolved. Node's `EventEmitter` doesn't queue
  an event for a listener that isn't registered yet, so a message arriving in
  that gap (often the initial `state` push, sent the instant the server
  accepts the connection) was lost — and the next `nextMessage()` call would
  then pick up the wrong message, hanging the test. Fixed by giving every test
  connection a message queue from the moment it opens, with `nextMessage()`
  reading from that queue first. Rule: anything that `await`s before it starts
  listening to a socket needs a queue, not a one-shot listener.
- **A spec test timed out against the deployed app, not against localhost.**
  `spec/cairn.test.ts`'s reconnect test opens three WebSocket connections
  sequentially (one, then another, then a reconnect). Run with
  `APP_URL=http://localhost:8080` that's fast enough to finish well inside
  vitest's 5000ms default, but pointed at the live `https://...fly.dev` deploy
  instead, three sequential real TLS handshakes to a machine in `syd` pushed it
  past 5000ms — every assertion inside still passed once given more time.
  Fixed with a longer explicit timeout on that one test, not a retry or a
  rewrite of the behaviour it checks. Rule: a timeout failure that only
  appears against a deployed `APP_URL` is evidence the budget was sized for
  localhost, not evidence the app is broken — confirm the assertions actually
  pass with more time before touching the code under test.
- **`ws`'s `"headers"` event fires before `handleUpgrade`'s own callback
  runs, not after.** The first version of the cookie-setting code for `/ws`
  registered the `wss.once("headers", ...)` listener *inside*
  `wss.handleUpgrade`'s callback, by analogy with how the connection handler
  itself is wired up there. `WebSocketServer.completeUpgrade` actually calls
  `this.emit("headers", ...)` synchronously, several lines *before* it calls
  the callback passed to `handleUpgrade` — so a listener added inside that
  callback is always one tick too late, and the `Set-Cookie` header silently
  never gets sent on a WebSocket upgrade, even though the exact same pattern
  works for `createServer`'s plain HTTP handler (where no such ordering trap
  exists). Caught by writing a standalone script that inspected the real
  upgrade response's headers, not by a spec test — rule: when wiring a
  one-shot listener to a library's own internal emit, check the library's
  source for whether that listener needs to be live *before* the call that
  triggers it, not just before the call's callback resolves.
- **Two new ADR 0004 spec tests silently used a stale queued message instead
  of the new broadcast they were supposed to wait for.** Both races were the
  same mistake `spec/cairn.test.ts`'s queueing pattern exists to prevent,
  just one level deeper: "B cannot move, edit, or delete A's stone" read
  `b.queue` right after A's own drop (which also reaches B) without first
  draining that legitimate broadcast out of the queue, so the length
  assertion saw A's real stone and reported a false failure. Separately, "a
  tampered cookie gets a brand-new identity" called `nextMessage(tampered)`
  without first consuming `tampered`'s initial `state` push, so the already-
  queued `state` message satisfied that call instead of the `stone` broadcast
  the assertion actually needed, and the real assertions below it never ran
  against real data. Both were caught by the deliberate-break exercise (one
  test went green when it should have gone red) rather than by reading the
  test first. Rule: every new connection in a test — not just the ones from
  `spec/cairn.test.ts`'s original races — needs its initial `state` message
  explicitly drained before any `nextMessage()` call is trusted to mean "the
  next *new* thing," and any queue-length assertion needs every expected
  prior broadcast drained first.
- **2026-10-30: a reconnect duplicated every already-landed stone.**
  `public/client.js`'s `"state"` handler called `landStone()` for every stone
  the server sent, with nothing tracking what was already in the DOM — so a
  reconnect (laptop sleep, network blip, a server restart) that resent the
  same full snapshot on top of stones the page had already drawn doubled the
  pile and the count. Caught first by a Playwright test
  (`spec/reconnect.browser.test.ts`) that forces the client's real
  `WebSocket` closed and watches `.stone` elements in the actual DOM — the
  WebSocket-level checks in `spec/cairn.test.ts` never render anything, so
  they couldn't have caught this. Fixed by keying landed stones in a `Map`
  by id: `"state"` renders only ids not already in the map, and a `"stone"`
  broadcast is ignored if its id is already there (covers the reconnect
  racing the server's own broadcast either order). Rule: any place a client
  redraws from a full server snapshot needs to dedupe against what's already
  rendered, not assume a snapshot only ever arrives into an empty page.
- **2026-10-30: a drop silently did nothing while disconnected, and a
  refused drop told the visitor nothing.** `drop()` in `public/client.js`
  checked `socket.readyState === OPEN` before sending, which correctly
  stopped a message going nowhere, but gave a visitor no sign their drag
  hadn't landed — the carry stone stayed interactive and the hint text never
  changed, so a drop during a network blip looked identical to a successful
  one. Separately, the server already refused a second same-day drop
  (`hasDroppedToday`) but only logged it — the dropping client got no
  response at all, indistinguishable from the message being lost. Caught by
  two Playwright tests in `spec/connection-status.browser.test.ts`: one
  forces the socket closed under `context.setOffline(true)` and polls the
  real hint text and `aria-disabled`; the other reads actual WebSocket
  frames (not just the hint text) so it can't pass off the unrelated `mine`
  flag a successful drop already sets. Fixed with a `"refused"` message type
  sent only to the dropping client (never broadcast — a refusal isn't shared
  state), plus `markDisconnected()`/`onConnected()` toggling the hint text
  and `aria-disabled` on the socket's own `open`/`close` events. Rule: a
  client-side guard that silently no-ops on bad state (socket not open, a
  request about to be refused) needs a visible signal on the page, not just
  code that correctly declines to do the wrong thing.
- **2026-10-31: three README-checkable claims had no spec coverage at all.**
  README promises "what gets dropped survives a restart or redeploy" and "one
  stone per Canberra day," and `docs/adr/0004` fixes the day boundary to
  `Australia/Canberra`, but nothing in `spec/` had ever actually restarted a
  server against its own data, asserted a second same-day drop gets refused,
  or checked `canberraDate()` at a Canberra/UTC day boundary — `hasDroppedToday`
  and the restart path could have silently broken and every existing check
  would still have gone green. Added `spec/persistence.test.ts` (spawns an
  isolated server on a temp `DATA_DIR`, same pattern as `spec/logging.test.ts`,
  drops a stone, kills the process, starts a fresh one on the same
  `DATA_DIR`, and confirms the stone is still there and still `mine` for that
  cookie), `spec/canberra-date.test.ts` (a pure unit test importing
  `canberraDate()` directly, asserting `2026-10-31T14:30:00Z` — still Oct 31
  in UTC — comes back as `2026-11-01`, the Canberra calendar day), and a
  same-cookie-refused/different-cookie-allowed test in `spec/cairn.test.ts`.
  Each was deliberately broken once (an `:memory:` database, `canberraDate`
  swapped for a plain UTC slice, the `hasDroppedToday` check short-circuited)
  to confirm it actually goes red before trusting it green. Rule: a claim in
  README or an ADR with no corresponding `spec/*.test.ts` is unverified, not
  working — passing `pnpm check` only means what's actually under test holds,
  not that every promise does.
- **2026-10-31: stones never actually stacked — `restingTop()` picked each
  stone's height from `stone.id % 18`, independent of every other stone's
  position, so stones at the same `x` just overlapped at arbitrary heights
  instead of resting on each other.** README calls Cairn "a cairn"; what
  rendered was scattered circles hugging the ground line (see
  `docs/screenshots/before-stacking-390.png` and `-1280.png`). Fixed by
  giving `public/client.js` a real stacking pass: `recomputeStacking()`
  derives every stone's position in a fixed 100×60 "world" coordinate space
  (not pixels) by walking all known stones in ascending id order and resting
  each one's bottom on the highest already-placed stone it overlaps
  horizontally, or the ground if nothing does; `relayout()` then projects
  those world coordinates into the current `#cairn` box's actual pixels.
  Keying the stacking math on id order rather than pixel/arrival order was
  deliberate: ids are permanent and globally ordered (see the `"stone"`
  broadcast/`"state"` race already noted above), so two sessions that have
  seen the same set of stones always compute the identical pile, and a 390px
  phone and a 1920px desktop show the same pile shape at the same *fractional*
  position (`#cairn`'s CSS `aspect-ratio: 5 / 3` keeps the box's own ratio
  matched to the world box's, so the world→pixel conversion is a uniform
  scale with no distortion). A `ResizeObserver` reruns `relayout()` (never
  `recomputeStacking()` — world positions don't change, only their pixel
  projection) on every `#cairn` size change. A tall pile first shrinks via a
  zoom-to-fit scale down to `MIN_SCALE = 0.5` (chosen so even the smallest
  stone, ~4 world units, stays a visible, roughly thumb-sized target on a
  phone rather than a speck); past that floor `#pile` grows taller than
  `#cairn` and `#cairn`'s own `overflow-y: auto` turns it into a scrollbar,
  with `scrollNewestIntoView()` keeping the latest stone on screen as it
  lands. Verified with `spec/pile-layout.browser.test.ts`: two sessions at
  390×844 and 1920×1080 — the course's two marking viewports, see
  `docs/testing/final-marker-pass.md` — against the same isolated server must
  report every stone's position, as a fraction of `#cairn`'s own box, within 2 decimal
  places of each other — both for a seeded pile and for a stone dropped live
  from one session and watched land on the other. Confirmed red first by
  making stone size depend on `window.innerWidth` (a plausible real mistake —
  "slightly bigger stones on a wide screen" — not a contrived one), which
  immediately desynced the two viewports' piles. Rule: any layout value
  derived from one client's own viewport (`cairn.clientWidth`,
  `window.innerWidth`, anything pixel-based) that two different sessions need
  to agree on has to be converted to a shared, resolution-independent unit
  before being used for anything but final painting — pixels are a rendering
  detail, not where shared layout math should live.
- **2026-10-31: `spec/logging.test.ts` failed once when the full suite ran
  together, then passed every time run alone — and it took three attempts,
  across two real CI failures, to find the actual bug instead of guessing
  at timing.** Both tests sent a WS message that causes a log line, then
  checked `stdout` for it. **Attempt 1:** a fixed `setTimeout` (200ms, 300ms)
  guessed "the server's had long enough to flush the line." Replaced with
  `waitForLogLine()`, polling `stdout` for the specific line instead of
  guessing a duration. Verified locally with three full-suite runs, pushed —
  CI still failed, with vitest's own generic "Test timed out in 15000ms" at
  `spec/logging.test.ts:106`, not `waitForLogLine()`'s own message. **Attempt
  2:** reasoned that must mean an *earlier*, still-unguarded wait (the raw
  WebSocket `"open"` event, draining the initial `"state"` push) was eating
  the budget under CI's heavier contention — gave every wait its own
  `waitForEvent()`/`waitForLogLine()` timeout and diagnostic, verified by
  reproducing contention locally with CPU-pinned busy-loops (which *did*
  reproduce attempt 1's exact failure), three clean full-suite runs under
  that load, pushed — and CI failed again, now with
  `waitForEvent()`'s own message: "timed out after 15000ms waiting for a
  WebSocket 'message' event." That specific message, read carefully instead
  of reached past, was the actual clue: a *fixed* 15000ms timeout on a
  single awaited event isn't what "slow under contention" looks like
  (contention makes things slower, not infinitely stuck) — it's what a
  **lost event** looks like. **The real bug, found by reading that message
  properly:** `await waitForEvent(ws, "open")` then, as a separate
  subsequent `await`, `waitForEvent(ws, "message")` — attaching the
  `"message"` listener only *after* `"open"` had already resolved, the exact
  race `spec/cairn.test.ts`'s own header comment already names: the
  server's initial `"state"` push can arrive the instant the connection
  opens, and Node's `EventEmitter` never queues an event for a listener
  that isn't attached yet. Both earlier "fixes" added timeouts *around* that
  gap without ever closing it, so they could only ever turn a hang into a
  slow, eventual failure — never into a pass. **Attempt 3 (the actual
  fix):** rewrote the file to use `spec/cairn.test.ts`'s own proven
  pattern — a message queue (`conn.queue`/`conn.waiters`) attached the
  moment the `WebSocket` is constructed, before anything can `await`, so no
  message arriving before a caller asks for it is ever lost. Verified with
  15 local runs (10 uncontended, 5 under CPU-pinned contention) and three
  full-suite runs, all green. Rule: a timeout that fires at exactly its
  fixed duration, not sooner and not with partial progress, is evidence of
  a **lost event**, not evidence something was merely slow — read the
  specific error message a fix's own diagnostics produce before reaching
  for a bigger number or a broader guard; and a new spawn-your-own-server
  spec file that talks to a raw `WebSocket` needs the same message-queue
  pattern `spec/cairn.test.ts` already uses, not a fresh `ws.once("message",
  ...)` per wait, which is exactly this race waiting to happen again.
  Checking the rest of `spec/` for the same pattern found it already present
  in `spec/persistence.test.ts` (`connect()` resolved on `"open"` separately
  from a later `nextMessage()`'s `ws.once("message", ...)`) — fixed the same
  way, proactively, before it also happened to fail in CI.
- **2026-10-31: `/readme/` had no link back to the app.** Found testing the
  live deployment the way a final marker actually would, starting at
  `/readme/` (a plausible real entry point: a shared link, or a marker
  reading the brief before the app itself) — the rendered page's only links
  were the two essays README cites (Robin Sloan, Ink & Switch); nothing
  pointed back to `/`, by mouse or by keyboard (Tab from `/readme/` reached
  exactly those two external links, then left the document). A visitor
  arriving there had no way back except manually editing the URL. Caught
  before writing any fix by adding a failing test first:
  `spec/invariants.test.ts`'s new "links back to the app from /readme/"
  asserts an `<a href="/">` (or `/index.html`) is present in the served
  `/readme/` HTML — added there rather than a new file, since it's the same
  concern (`/readme/`'s own structure) as the file's two existing checks.
  Fixed in `readmePage()`'s wrapper HTML in `src/server.ts` (a "&larr; Back
  to Cairn" link above `<main class="readme">`), not in README.md's content
  — README.md has no reason to link to the site it's hosted on, so this
  belongs in the wrapper, not the rendered markdown. Re-verified on the live
  deployment after redeploying. Rule: `/readme/` and `/` are two different
  pages a visitor can land on directly, not just a page and a link-within-
  the-other-page; each needs its own way back to the rest of the app, and
  that has to be checked by actually starting from the page a marker or a
  cold visitor would, not just from `/` outward.
- **2026-11-01: the pile-layout test and screenshots checked 1280×800, a
  size nobody actually marks at.** `spec/pile-layout.browser.test.ts` and
  `docs/screenshots/after-stacking-*.png` compared the phone viewport
  against a 1280×800 "laptop" — a plausible guess at a second real size, but
  not the one that matters: the course's actual marking environment (found
  by reading the assessment page, see `docs/testing/final-marker-pass.md`)
  is **390×844 and 1920×1080**, nothing in between. A desktop pile that
  matched the phone pile at 1280×800 was never guaranteed to still match it
  at 1920×1080 — `relayout()`'s math is a uniform scale either way, so in
  practice it does, but the test was checking a size that isn't the
  contract. Fixed by changing both `newPage({viewport: ...})` calls in
  `spec/pile-layout.browser.test.ts` from 1280×800 to 1920×1080, renaming
  the local variable from `laptop` to `desktop` to match, and retaking
  `after-stacking-1920.png` (replacing `after-stacking-1280.png`) at the
  real marking size. `before-stacking-1280.png` was left alone — it's a
  historical record of the pre-fix bug, not a current test fixture, and the
  bug it documents (stones overlapping at `id % 18`-derived heights) didn't
  depend on which viewport exposed it. Rule: when a test or a fixture picks
  "a phone size and a desktop size" to stand in for "every viewport," check
  whether the actual contract (a course's marking environment, a browser
  support matrix, a design spec) names specific sizes before picking
  plausible-looking ones — two sizes that happen to produce the same result
  as the real ones is not the same guarantee as testing the real ones.
- **2026-11-02: `spec/cairn.test.ts`'s ADR 0003 carry test failed once in a
  full `pnpm check` run, then passed on rerun — and it wasn't a flake,
  despite looking exactly like one.** Two tests in that file —
  `"never broadcasts a carry/in-progress drag, only a completed drop (ADR
  0003)"` and `"B cannot move, edit, or delete A's stone"` — prove a
  negative: they wait a fixed 300ms, then assert a connection's `queue` is
  empty, meaning *nothing at all* arrived. That assertion is only honest
  against a server the test has exclusive use of. Both tests ran against the
  **shared** app `spec/global-setup.ts` finds — the same app every other
  `spec/*.test.ts` file (and every other `it()` in `cairn.test.ts` itself)
  talks to, and the server broadcasts every real drop to *every* open
  connection, system-wide. An unrelated, completely legitimate drop from
  some other concurrently-running test landing in that 300ms window makes
  `queue.length` go from 0 to 1 — identical in every respect to what a real
  ADR 0003 regression would produce. Confirmed by writing a standalone
  script that opens the same two connections this test does, fires a carry
  message, and fires a real drop from a third, unrelated connection partway
  through the wait window: `b.queue.length` came back `1`, reproducing the
  exact failure on demand. This is the same bug class
  `spec/pile-size.test.ts`'s own comment already names and was already fixed
  for (a `toHaveLength`-style assertion against the shared app, vulnerable
  to concurrent cross-test broadcasts) — these two tests had the identical
  exposure and simply hadn't been moved yet. Fixed by extracting both into a
  new `spec/no-stray-broadcasts.test.ts`, run against its own isolated
  server (spawned fresh, own `DATA_DIR`, own port), the same pattern
  `spec/pile-size.test.ts`, `spec/persistence.test.ts`, and
  `spec/logging.test.ts` already use. Verified with 5 consecutive full-suite
  runs on a freshly started app, all green (10 files, 28 tests each — same
  counts as before, since the tests moved rather than changed). Rule: an
  assertion that something *didn't* happen (a queue is empty, nothing was
  received, no side effect occurred) is only trustworthy against a server
  the test doesn't share with anything else — on the shared app, "nothing
  happened" and "something unrelated happened" are indistinguishable from
  the queue's own contents, so the test can't tell a real regression from
  background noise. Before writing an isolated-server test from scratch,
  also check whether an *existing* test already has this exposure and
  should move instead of a new one being added next to it.
- **2026-11-02: the earlier "browser test timed out against 180+ local
  stones" wasn't just a test-environment artifact — a real O(stones³) page
  load and O(stones²) live drop were hiding behind it.** `landStone()` in
  `public/client.js` called a full `recomputeStacking()` (itself
  O(current pile size)²: it restacks every known stone from an empty pile,
  in id order) on *every single stone landed* — including once per stone
  inside `renderState()`'s per-stone loop on initial page load. Measured on
  an isolated local server (seeded to 200, ~500, and ~1000 stones; never the
  live site) at both marking viewports before any fix: page load went
  243ms → 1.8s → 5.3s as the pile grew, and a live drop's wall-clock time to
  reach another session's DOM went from ~130ms to ~320ms at 500 stones —
  already past the ~200ms budget — confirming this was a real, user-facing
  problem the pile will actually hit (the live site already carries ~160
  stones and only grows). Isolated the stacking cost itself with an
  in-page profiling script (copying the exact algorithm, timed with
  `performance.now()`): a single `recomputeStacking()` call cost ~3.8ms at
  1000 stones, but `renderState()`'s loop calls it once per *already-landed*
  stone as the pile builds up to N, making a page load's total stacking
  cost O(1²+2²+...+N²) ≈ O(N³) — confirmed directly by replaying that exact
  loop shape in-page: 155ms of stacking work alone at 500 stones, 1148ms at
  1000, an ~7.4× cost for a 2× stone increase, consistent with cubic growth
  (2³ = 8). Fixed with `stackStone()`: an O(already-stacked stones) append
  that's provably equivalent to a full id-ordered rebuild whenever the new
  id is larger than every id already stacked — true for every page load
  (the server's own `"state"` snapshot is already `ORDER BY id ASC`,
  `db.ts`) and every live drop (ids are globally increasing) — falling back
  to the original full `recomputeStacking()` only for the rare race already
  named in that function's comment (a live broadcast beating its own
  `"state"` catch-up to a freshly connecting client). Also split
  `landStone()`'s single-stone path from `renderState()`'s bulk path so a
  page load calls the O(stones) `relayout()` once at the end, not once per
  landed stone, instead of leaving the pixel-layout cost quadratic even
  after the stacking cost dropped to linear. Re-measured after the fix,
  same isolated server, same three sizes: page load 204–526ms at every
  size up to ~1000 stones (down from up to 5.3s); a live drop's true
  broadcast-to-DOM latency, measured with a raw WebSocket drop rather than
  a simulated Playwright drag (the drag gesture's own mouse-movement time
  was most of what the first end-to-end measurement showed, not real
  client or server cost), came to 12–58ms at every size — comfortably under
  the ~200ms budget even at 1000 stones, not just at 500. Confirmed the
  pile's shape is unchanged by diffing every stone's fractional position
  between the two marking viewports before and after the fix, at 1000
  stones: max deviation ~0.011 either way — a pre-existing sub-pixel
  rounding floor present on the *original* unmodified code too (confirmed
  by measuring it separately, before the fix, at the same pile size), not
  something this change introduced. Locked in with
  `spec/pile-performance.browser.test.ts`: seeds 1000 stones once on its
  own isolated server, then asserts page load and one live drop both beat
  generous budgets (3000ms, 500ms — multiples of the measured numbers
  above, not the numbers themselves, so ordinary machine-to-machine
  variance doesn't make the test flaky over something that was never the
  regression) at both marking viewports, plus a pile-shape-match check at
  the same 1000-stone scale with a widened tolerance to account for the
  pre-existing rounding floor. Rule: a function that's individually fast
  can still make a loop that calls it once per item cubic, not quadratic —
  profile the *loop*, not just the function it calls, and when a stacking
  or layout algorithm is restated as "recompute everything from the
  current state," check whether the new input is always a strict
  append (a global, monotonic order like an id) before accepting O(n²)
  per call as the cost of correctness; an append-only input usually lets
  the common case amortise down to linear, with the full recompute kept
  only as a fallback for whatever case breaks the append assumption.
- **2026-11-07: README.md gained a table and the renderer was never tested
  against it.** `src/readme.ts`'s renderer only ever handled headings,
  paragraphs, bold/italic, links, images, and `-`/`*` lists — it had no table
  support at all. README's "Which claims are enforced and which are judged"
  section is a markdown table, added during the final-submission rewrite
  (`9586c94`), but nothing re-ran `/readme/` against the live site after that
  change, so the table's `|` syntax fell through to the paragraph branch and
  the live page showed one garbled line of literal pipes instead of rows —
  found by a marker-style audit reading the deployed `/readme/` directly, not
  by any existing test, since `spec/invariants.test.ts`'s heading check can't
  tell a real `<table>` from a paragraph that happens to contain the same
  words. Fixed by adding a failing test first
  (`spec/invariants.test.ts`'s "renders README's claims table as a real table
  on /readme/", which counts real `<tr>` elements against the markdown
  source's own row count), confirmed red against the unmodified renderer,
  then adding minimal GitHub-style table support to `renderMarkdown()`: a
  line containing `|` followed by a separator line (`| --- | --- |`) opens a
  `<table>`, cells run through the same `renderInline()` as a paragraph (so
  code spans and links work inside a cell), and the table closes on the first
  line that isn't itself a row. Confirmed green after the fix. Rule: a
  structural element (a table, same as a heading or a list) added to
  README.md needs the renderer checked against it specifically — a renderer
  that silently falls back to treating unknown syntax as plain text will
  still serve a 200 and still contain the right words, so the existing
  content checks can't catch it; re-check `/readme/` on the live site after
  every README structure change, not just after a content change.
- **2026-11-07: `spec/cairn.test.ts`'s tampered-cookie test proved distinct
  identity by comparing `colorFor()`'s output, which hashes into only 360
  hues — a ~1-in-360 chance of coincidentally passing even when the server
  hands a tampered cookie someone else's real identity. Rewrote it to assert
  `mine` from both visitors' own perspective on the same stone id instead,
  confirmed it still fails (not a timeout, a real assertion) when
  `resolveVisitor()` is deliberately made to let a tampered cookie reuse an
  existing identity. Rule: never let a test's pass/fail hinge on two
  independent random values landing in different buckets of a small space —
  assert the actual property (here, `mine`) directly.

## Forgotten web (/forgotten-web/)

Crit 1 make-up. Plain HTML/CSS, no JavaScript, GeoCities-era rules (system
fonts, loud background, bright/visited-purple links, table-style centred
layout, under-construction banner, hit-counter look, webring footer,
CSS-only marquee off under prefers-reduced-motion). No invented visitors,
testimonials or quotes; all voices are mine. Must work at 390px with no
horizontal scroll.
