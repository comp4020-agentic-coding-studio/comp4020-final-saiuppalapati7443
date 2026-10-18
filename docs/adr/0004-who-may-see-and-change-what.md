# ADR 0004: Who may see and change what — a server-set cookie, one stone a day, nothing ever editable

## Context

[ADR 0002](0002-visitor-identity.md) chose a client-generated `localStorage`
UUID, sent in the WebSocket message body, as the whole of Cairn's identity
mechanism — explicitly rejecting a server-issued cookie as giving "the server
nothing a client-generated id doesn't." That was true for a single-machine,
single-pile app where the only question was "what color is this stone,"
and where ADR 0002 itself named the consequence plainly: "nothing stops...
spoofing another visitor's id to match their color," accepted because the
stakes were a hue, not a permission.

The stakes changed. Cairn now needs real authorization decisions — *may this
request place a stone, and may it ever touch an existing one* — and those
decisions have to be made on the server, not inferred from a value the
client typed into a JSON body. A `visitorId` field in a message is exactly
the kind of untrusted input `CLAUDE.md` already says must never be trusted
for identity: anyone can put any UUID in that field, including a stranger's,
and the server has no way today to tell the difference between "this is
genuinely visitor X" and "this client is claiming to be visitor X." That gap
was fine when the worst case was a wrong-colored stone. It is not fine once
identity gates whether a write is allowed at all.

This ADR answers three questions the brief and the crit now require written
down: what each visitor may see, what each visitor may change, and where the
server gets an identity it can actually trust to enforce both.

## Options considered

- **Status quo: client-reported `visitorId` in the message body, trusted as
  sent.** Rejected. It satisfies "tell visitors apart" (ADR 0002's original
  problem) but not "enforce who may act" — the server would be enforcing a
  one-stone-per-day limit, or stone immutability, against a value the
  requester fully controls. A visitor hitting the limit could simply send a
  fresh UUID and bypass it; the limit would protect nothing. Any
  server-side authorization check is only as trustworthy as the identity it's
  keyed on, and a body field isn't.

- **Full accounts (login, password or OAuth).** Rejected outright, same as in
  ADR 0002 and for the same reason: the brief doesn't ask for it, README
  promises "no accounts, no rooms, no score," and it adds signup friction
  directly opposed to the co-presence goal a crit-room audience needs. It
  would also solve a problem Cairn doesn't have — durable identity across
  browsers — at the cost of a problem Cairn does have avoiding: collecting
  anything that identifies a person.

- **Server-set anonymous cookie, still just a UUID, still mapping to a
  derived hue — no account, no form, no password.** Chosen. On first
  connection the server sets an `HttpOnly` cookie (a UUID it generates, not
  one the client supplies) if the request doesn't already carry one. Every
  later request's identity comes from that cookie, read server-side, never
  from anything in a message body. The visitor never sees or types an id;
  the pseudonym (derived hue) still works exactly as ADR 0002 described, just
  anchored to a value the client can't forge. This keeps ADR 0002's spirit —
  anonymous, derived, no PII, no login — while fixing the one part of it that
  can't hold up under real authorization: *where the server gets the id it
  enforces against.*

- **Keep client-generated ids, but have the server remember "first `visitorId`
  seen from this TCP/WS connection" as canonical for that connection's
  lifetime.** Considered as a half-measure that avoids adding a cookie.
  Rejected: it only binds identity to a connection, not a visitor, so a
  reconnect (a dropped wifi, a reload) would still require trusting a
  client-supplied id again at the next handshake — the forgery window just
  moves to "every reconnect" instead of "every message." It solves nothing a
  cookie doesn't solve better and more simply.

## Decision

- **Identity transport:** the server sets an `HttpOnly`, `Secure` cookie
  (a UUID) on first contact if none is present, and treats that cookie — read
  server-side on the HTTP upgrade request, never a value from the WebSocket
  message body — as the only source of truth for who is making a request.
  This **amends** ADR 0002's transport mechanism (client-generated id in the
  message body → server-set cookie) while keeping everything else about it:
  still just a UUID, still hashed to a hue, still no account, still no PII.
  A `visitorId` field arriving in a message body is no longer trusted for
  identity at all, even if present; it's ignored or rejected, and `/ws`
  validation still applies to everything else in the message shape.
- **What everyone may see:** every stone, by everyone — the pile stays fully
  public, as README already promises. The only per-visitor distinction is
  whether *this* viewer is shown "this is yours" on a given stone, computed
  by comparing the stone's stored visitor id against the requester's cookie
  — never sent to, or trusted from, the client.
  - "this is yours" is read-only UI sugar — it changes what a response
    reveals to one caller, never what another caller receives, so a client
    confirming a stone isn't theirs learns nothing beyond what was already
    public.
- **What each visitor may change:** exactly one thing — placing one new
  stone per Canberra calendar day (`Australia/Canberra`, computed
  server-side off the cookie's id and the stones already recorded against
  it, not off any client-reported count or timestamp). A second drop attempt
  the same Canberra day is rejected the same way a malformed message is:
  dropped, no crash, no broadcast, connection stays open.
- **What nobody may ever do:** move, edit, or delete a placed stone — not
  the owner, not anyone else. There is no message type for it, server-side
  or client-side, and none should be added. A stone once dropped is as
  permanent as a real one.
- **Where the server trusts the client about identity:** nowhere, after this
  decision. The cookie is the only identity signal the server acts on;
  anything else arriving from a client (a claimed `visitorId`, a claimed
  "this is my stone") is just data to validate or ignore, same as any other
  untrusted `/ws` input.

## Costs

- A cookie is one more thing to set, parse, and reason about on every
  connection — the exact overhead ADR 0002 avoided by not having one. That
  cost is now worth paying because the thing being protected (a per-day
  limit, stone immutability) didn't exist yet when ADR 0002 was written.
- Identity is still bound to one browser/profile, same limitation ADR 0002
  already accepted: clearing cookies or switching browsers gets a visitor a
  new identity and a fresh daily allowance. That's consistent with "Cairn
  doesn't claim to recognize a *person*," not a new gap this ADR introduces.
- "One stone per Canberra day" requires picking and fixing a timezone for a
  day boundary that has no other natural anchor (the brief doesn't name one);
  `Australia/Canberra` is chosen because the course and its crits are run on
  that clock, not because the app has any other reason to care what day it
  is anywhere.
- Logging who-did-what (required elsewhere by the crit) now has a trustworthy
  key to log against — the cookie id — rather than a client-reported value
  that would have made the log only as honest as whoever sent the message.

## Links

- Amends the identity transport chosen in
  [ADR 0002](0002-visitor-identity.md); the anonymity and no-PII decision
  there is unchanged, only how the server learns an id is.
- Builds on [ADR 0003](0003-carry-stays-local.md): nothing here changes what
  crosses `/ws` during a carry — this ADR only tightens what a *drop* is
  checked against before the server accepts it.
