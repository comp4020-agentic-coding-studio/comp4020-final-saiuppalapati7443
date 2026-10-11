# ADR 0003: Carrying a stone stays local — only the drop is broadcast

## Context

The crit asks for one written decision about how Cairn behaves when several
people use it at once. The one place that decision was still open: everything
a visitor does splits into two actions, carrying (pointerdown/move, dragging
the stone toward the pile) and dropping (pointerup inside the cairn). Dropping
already reaches every other open session live, over `/ws`, and is tested
(`spec/cairn.test.ts`). Carrying has never been sent over the wire — it's pure
local DOM feedback in `public/client.js`. The open question is whether that's
actually the right call, or just what happened to get built first.

README.md's definition of "good" is explicit about where the line between
checked and judged behaviour sits:

> Good means the three things the brief actually asks for are true, and
> checked, not just claimed: a stone someone drops is visible on every other
> open session within about a second, with nobody reloading anything... Whether
> the *interaction* is actually good — whether dropping a stone feels
> satisfying, whether watching someone else's stone land reads as "someone's
> here" rather than as a notification — isn't something a test can decide. I
> judged that by using it myself from two browser windows side by side and
> asking whether I noticed the other one without it announcing itself.

Two things fixed by that: the checkable promise is scoped to drops, not
carries; and "someone's here" is explicitly supposed to come from noticing,
not from an announcement.

## Options considered

- **Only the drop broadcasts (status quo).** Carrying stays 100% local; the
  only message that crosses `/ws` is the final `drop`. Buys: zero extra
  network traffic or message types, nothing new to validate against untrusted
  input, and it keeps presence exactly where
  [ADR 0002](0002-visitor-identity.md) already put it — a passive signal
  picked up from the shared object (a landed stone), not a directed one.
  Costs: co-presence is intermittent. If nobody is dropping a stone *right
  now*, two people with the page open may perceive no one else at all.

- **Broadcast carry position live (a throttled "ghost stone").** Every other
  open session sees a translucent stone follow someone's drag in real time,
  replaced by the real stone on drop. Buys: a continuous sense that someone
  else is present and active, even during a lull between drops — directly
  targets the cost of the status quo. Costs: this is the directed, continuously
  updating presence signal ADR 0002 already argued against (it names the exact
  failure mode: an explicit indicator takes people out of moving fluidly
  between close and loose attention). It also adds a new untrusted-input shape
  to validate and a throttling scheme to get right, and makes a visitor's live
  motion — not just their landed choice — visible to strangers.

- **Broadcast a presence pulse, not position (e.g. a flicker on the carry
  zone).** A cheaper middle ground: others see *that* someone is carrying, not
  *where*. Buys: some lull-filling signal without full motion tracking. Costs:
  still a directed presence signal rather than a passive one, so it pays most
  of the same conceptual cost as the option above for a vaguer payoff — it's
  neither as informative as position nor as meaningful as an actual stone
  landing, and it's still a new message type and client behaviour to build and
  maintain for that ambiguous middle.

## Decision

Keep the status quo: carrying a stone is never sent over `/ws`. The only
action that changes shared state, and the only thing broadcast to other
sessions, is a completed drop.

## Consequences

- Co-presence is tied entirely to how often stones actually get dropped. On a
  pile that's already large, or in a quiet stretch, two visitors with the page
  open may not perceive each other for a while — the passive signal simply
  doesn't fire if nobody commits to a stone.
- Nothing about this needs revisiting on its own; it would need revisiting if
  real use (not a hypothetical) showed people reliably opening the app and
  watching without ever dropping a stone — i.e. if the lull itself turned out
  to be the common case rather than the exception, the passive signal would
  never fire for those sessions and the cost above would stop being
  theoretical.

## The case for the option we didn't pick

The strongest argument my pod could make: the brief's real-time showcase is
specifically a room full of people using the thing *at once*, and the test
README itself describes — two browser windows open side by side, watching to
see if you notice the other one — can go for a while with nothing to notice if
neither window happens to drop a stone during that window. A pod could argue a
ghost stone doesn't actually violate ADR 0002's spirit, since it's anonymous,
it doesn't persist, and it vanishes the instant the drag ends — it's not the
"X is online" banner that ADR explicitly rejected, just a livelier version of
the same shared object.

My answer: ADR 0002 wasn't objecting to the specific mechanism of a names
list, it was objecting to any signal that announces another person
continuously and independent of whether they've committed to anything — and a
live carry broadcast is exactly that, regardless of anonymity. A landed stone
is a choice someone made; a carried stone is a choice they might still
abandon, broadcasting intent rather than action. And the lull this would fix
is a hypothetical for the audience this app is actually built for — a crit
room full of people adding stones, not a near-empty page waiting for a rare
visitor — which is the same standard [ADR 0001](0001-stack.md) already set:
build for the audience this app has, not the one a hypothetical might have. If
side-by-side testing, the same method README already uses to judge "good,"
ever showed real dead air instead of an imagined one, that's the trigger named
in Consequences above — not a reason to build it now.
