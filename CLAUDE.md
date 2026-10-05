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
