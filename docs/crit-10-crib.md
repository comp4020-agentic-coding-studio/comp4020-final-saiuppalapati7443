# Crit 10 crib sheet

## The log command

```
mise exec -- flyctl logs -a comp4020-final-saiuppalapati7443
```

Tail it before the pod touches the live site, and leave it running —
everything below is read off that output live, not reconstructed after.

## How to read each line type

Every line is `<type>  <pseudonym>#<handle> <detail>`, one event per line, to
stdout (`src/log.ts`). The pseudonym#handle (e.g. `quiet-heron#a1b2c3`) is a
one-way hash of a visitor's server-set cookie (`src/pseudonym.ts`) — never
the cookie itself, never logged anywhere, by rule (`CLAUDE.md`).

- **`visit`** — a brand-new cookie was just minted; a first-time arrival.
  Carries the viewport the client reported right after connecting
  (`visit   quiet-heron#a1b2c3 new visitor, viewport 390x844`).
- **`connect`** — a cookie the server already recognises opened a new
  WebSocket connection (a reload, a reconnect after sleep/network loss).
- **`place`** — an accepted drop: a new stone exists, with its id and
  position (`place   quiet-heron#a1b2c3 stone #42 at x=310`). `x` is scaled
  ×1000 for a readable integer, not the raw `[0,1]` fraction.
- **`refuse`** — the server rejected something a client tried: a second
  drop today, or a message shaped like move/edit/delete (there's no such
  message type that does anything — ADR 0004 — this only exists to name the
  attempt in the log, with the stone's *real* owner named by pseudonym, e.g.
  `refuse  fern-petrel#d4e5f6 tried to edit stone #42 owned by
  quiet-heron#a1b2c3`).
- **`error`** — unparseable JSON or a message shape the server doesn't
  recognise at all.
- **`drop`** — a WebSocket connection closed (any reason: tab closed, sleep,
  network loss).
- **`boot`** — the process started; no actor, so the pseudonym column shows
  `-`.

Narrating live: **"who"** is the pseudonym#handle on the left of each line;
**"what happened"** is the line type; **"to whom"** (for a `refuse` line) is
the owner named at the end. Two different pseudonym#handles on two lines
means two different people — a fixed point, since the handle is stable for
as long as that cookie lives.

## Who may see and change what, and why (`docs/adr/0004`)

- **Identity**: a server-set, `HttpOnly` cookie minted on first `/ws` upgrade
  — never a value the client sends. ADR 0002's original client-generated id
  was fine for "what color is this stone" but can't anchor a real permission
  check (a client could always mint a new id to dodge a limit), so ADR 0004
  moved identity server-side while keeping everything else ADR 0002 decided:
  still anonymous, still just a hue, no accounts, no PII.
- **See**: everyone sees every stone — the pile stays fully public. The only
  per-visitor difference is a `mine` boolean, computed server-side by
  comparing a stone's stored owner against the viewer's own cookie — never
  the owner's id itself, so a response never contains anyone's identity.
- **Change**: one stone per visitor per Canberra calendar day. Checked
  against the cookie-resolved identity on every drop, so sending a different
  claimed id in the message body changes nothing.
- **Never change**: nobody, ever, including the owner, may move, edit, or
  delete a placed stone. There's no message type for it — not a check that
  blocks one, an absence. A stone is as permanent as a real one.
- **Why this split**: the crit asks for a server-enforced answer to "who may
  see and change what," written down with reasoning. The full three-options
  discussion and the costs accepted is in
  [`docs/adr/0004-who-may-see-and-change-what.md`](adr/0004-who-may-see-and-change-what.md).

## The 2 likeliest questions from my pod

**"How do you actually know those are two different people, and not one
person in two tabs?"** — I don't, and the app doesn't claim to: identity here
is "one cookie, one browser profile," the same anonymous-visitor model ADR
0002 chose and ADR 0004 kept (see its Consequences section). Two separate
Chrome profiles get two separate cookies because each profile has its own
cookie jar — that's what "separate profiles" means to a browser. If the same
person opened two profiles, the app would correctly show two visitors,
because from the server's point of view that's indistinguishable from two
people — and nothing in the brief asks it to be anything stronger than that.

**"What stops me from just editing the cookie in devtools to become someone
else?"** — Nothing stops you from *trying*, but it doesn't work: the cookie
value has to be a UUID the server itself minted (`src/identity.ts`'s
`resolveVisitor`), and there's no way to derive or guess another visitor's
UUID from anything the server ever sends you — not their pseudonym, not their
stone's color, nothing. Paste a made-up or guessed value in and the server
treats it exactly like having no cookie at all: it mints you a brand-new
identity and overwrites what you tried to set
(`spec/cairn.test.ts`: "gives a tampered cookie a brand-new identity, never
someone else's"). The only way to "become" another visitor is to literally
steal their actual cookie value off their machine — a browser-security
problem this app doesn't claim to solve, same as any site using cookies for
identity.
