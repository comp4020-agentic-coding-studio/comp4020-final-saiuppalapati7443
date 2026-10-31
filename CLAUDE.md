# Rules for working on Cairn

Derived from README.md's claims and the two decisions in `docs/adr/`. These are
the standards a change must meet, not a description of how the app happens to
work today.

## What every change must hold to

- `/` answers 200 and `/readme/` publishes README.md's actual content, rendered
  at request time — not a cached or stale copy. `spec/invariants.test.ts` is
  the floor this guarantees, not the whole claim.
- Anything arriving over `/ws` is untrusted input: validate it (visitorId must
  parse as a UUID, `x` must be a finite number in `[0, 1]`) before it reaches
  `node:sqlite` or gets broadcast to anyone else. A value failing validation is
  dropped silently — it never crashes the connection and never gets a second
  chance at being "mostly valid."
- No accounts, logins, names, or anything else that identifies a person beyond
  the hue derived from a client-generated id (`docs/adr/0002-visitor-identity.md`).
  Don't add a field that makes that untrue without updating that ADR and
  README.md together — it's a claim visitors are relying on, not an
  implementation detail.
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
  phone and a 1280px laptop show the same pile shape at the same *fractional*
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
  390×844 and 1280×800 against the same isolated server must report every
  stone's position, as a fraction of `#cairn`'s own box, within 2 decimal
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

## Forgotten web (/forgotten-web/)

Crit 1 make-up. Plain HTML/CSS, no JavaScript, GeoCities-era rules (system
fonts, loud background, bright/visited-purple links, table-style centred
layout, under-construction banner, hit-counter look, webring footer,
CSS-only marquee off under prefers-reduced-motion). No invented visitors,
testimonials or quotes; all voices are mine. Must work at 390px with no
horizontal scroll.
