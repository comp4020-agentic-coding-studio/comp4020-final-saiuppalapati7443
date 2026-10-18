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
