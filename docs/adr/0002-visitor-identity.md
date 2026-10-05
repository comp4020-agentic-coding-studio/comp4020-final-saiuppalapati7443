# ADR 0002: Visitor identity — a derived color, not an account

## Context

The brief leaves "what counts as a person" open: "an account, a pseudonym, or
any anonymous visitor." Cairn needs just enough identity to tell people apart
("whose stone is this") without needing anyone to sign up before they can drop
a stone — signup friction would work directly against the "co-presence" goal:
the point is that a room full of people can join in at once, instantly.

Dourish & Bellotti's *Awareness and Coordination in Shared Workspaces* (CSCW
'92) distinguishes two ways collaborators perceive each other: explicit,
directed notifications (a names list, "X is here," a presence indicator), or
awareness picked up passively through the shared object itself, just by
looking at it. They found the passive route lets people move fluidly between
close and loose collaboration without anyone having to manage who's watching.
Cairn takes the passive route: you don't see a list of visitors, you see
colored stones land. That *is* the presence indicator.

## Options considered

- **Accounts (login/signup).** Rejected outright — the brief explicitly doesn't
  ask for this, and it adds exactly the friction co-presence is supposed to
  remove.
- **Server-issued session id (cookie).** Workable, but gives the server nothing
  a client-generated id doesn't, while adding a cookie to manage.
- **Named/chosen pseudonym.** Rejected for now — a name field is a small
  feature (validation, display, possible abuse) in service of an identity
  signal the stone's color already gives passively; see README for the
  trade-off this leaves on the table.
- **Anonymous, client-generated id → derived color.** Chosen.

## Decision

On first visit, the client generates `crypto.randomUUID()` and keeps it in
`localStorage` — no server round-trip, no cookie. It's sent once per
connection (`{type:"hello", visitorId}`) and with every drop. The server never
stores a visitors table: it hashes the id to an HSL hue and stores that
**color** on the stone row at drop time, not the id's meaning. Two consequences
of storing the color rather than re-deriving it at display time: the pile's
colors stay stable even if the hashing scheme changes later, and the server
holds nothing that identifies a person beyond a hue they chose by showing up.

The server does validate the id's shape (must parse as a UUID) before trusting
it — not for identity assurance (anyone can generate a new one any time, and
that's fine), but because anything arriving over the WebSocket is untrusted
input and malformed values must not reach `node:sqlite` or get broadcast.

## Consequences

- No login, no password, no PII stored, ever — identity is exactly one derived
  color per stone, nothing more.
- Identity is not durable against a cleared `localStorage` or a different
  browser: that's accepted, not a bug — Cairn doesn't claim to recognize a
  *person*, only to let one open session's stones read as distinct from
  another's while they're both watching.
- Nothing stops someone from generating a new id to get a new color, or
  spoofing another visitor's id to match their color. Both are low-stakes here
  (a stone's color, not an account) and are called out in the README as
  deliberately out of scope rather than hidden.
