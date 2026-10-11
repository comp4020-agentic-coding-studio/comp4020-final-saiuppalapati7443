# Process overview

This describes Cairn as it stands at the week 10 crit ("All at once"). Like
last week, it's rewritten, not appended to; the `/ship` tags keep each
version.

## Where it stands

Cairn is deployed at
[comp4020-final-saiuppalapati7443.fly.dev](https://comp4020-final-saiuppalapati7443.fly.dev).
Open it, drag the stone onto the pile, and it lands — for you and for anyone
else with the page open, in milliseconds, not the "about a second" the brief
asks for. What lands survives a restart or redeploy, since the sqlite file at
`${DATA_DIR}/cairn.db` is the only place state lives, and a reconnecting
session catches up on exactly what it missed with no reload. The gap last
week's version flagged — "multi-user behaviour at real scale hasn't been
argued for in writing" — is closed this week: there's now a written decision
about the one thing several people can do to the app at once, enforced by a
test that's been proven to catch its own violation.

## From the brief to Cairn

The brief fixes three properties — multi-user, real-time, persistent — and
leaves the concept open. Cairn answers with one shared pile of stones: drag
one onto the pile, watch it land for everyone looking, and it's still there
tomorrow. No accounts, no rooms, no score — the reasoning behind that and the
stack is in last week's version of this file and in `docs/adr/`.

## The stack, and how real-time travels

Unchanged from week 9: Node 24 runs `.ts` source directly (no build step,
anywhere), `node:sqlite` is the only store, and `ws` is the one runtime
dependency. A drop travels as `{type:"drop", visitorId, x}` over `/ws`; the
server validates it (visitorId must parse as a UUID, x must be a finite number
in `[0,1]`) before it reaches `node:sqlite` or anyone else, inserts it, and
broadcasts `{type:"stone", stone}` to every open client, sender included. A
fresh or reconnecting client gets the whole pile back as one `{type:"state"}`
push the instant it connects — that's also how a dropped connection catches
up, since there's no separate reconnect protocol, just the same push run
again. Carrying a stone — the drag before it lands — never crosses `/ws` at
all; that boundary is this week's decision, not an accident.

## This week's decision

The crit asked for one written decision about behaviour with several people
at once. I picked **carry stays local**: carrying a stone toward the pile
stays on the visitor's own screen; only a completed drop is ever sent or
broadcast. The alternative that got real consideration — broadcasting a live
"ghost stone" as people drag, so the room feels populated even between drops —
was rejected because it reopens exactly the directed presence signal
[ADR 0002](docs/adr/0002-visitor-identity.md) already argued against, for a
lull problem that's hypothetical for a crit-room audience, not observed. The
full reasoning, the three options actually weighed, and the strongest case for
the option *not* picked are in
[ADR 0003](docs/adr/0003-carry-stays-local.md)
([`67668c6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/67668c6)).

## Where I directed the work

I ran this week, like last week, as fixed prompts in a set order: ground
first with no changes, make real-time complete, propose candidates for the
one required decision and stop, write the decision down once I'd picked,
build and enforce it, then deploy and verify against the live site before
touching process or reflection. The one call only I could make was the pick
itself — three candidates were proposed (live carry, a rate limit on drops, a
cap on how much history a reconnect replays), each with real options and
costs against README's own definition of "good," and I chose carry-stays-local
over the agent building anything ahead of that answer. I also held a
boundary during live verification: asked for the Fly machine serving the
graded deploy to be force-stopped to measure cold start on demand, and that
was refused as going beyond what I'd actually asked for (measuring, not
touching production) — the right call, so cold start was measured by waiting
for the machine's own idle timeout instead, which is the number a real visitor
would actually hit.

## Grounding

Every claim this week was checked against a running app, not a mock: the new
1000ms broadcast assertion
([`b645dbb`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/b645dbb)),
the five-simultaneous-session and dropped-connection tests
([`11b77ed`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/11b77ed)),
and the carry-never-broadcasts test
([`94a0056`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/94a0056))
all run over the real `/ws` protocol. After deploying, the full spec ran again
with `APP_URL` pointed at the live `fly.dev` URL, not just localhost, and a
two-session timing check against the live site measured an actual 16.9ms
broadcast. Where grounding wasn't possible, that's said plainly rather than
papered over: no headless browser could be launched in this environment to
visually confirm the layout at 390px and 1280px, so that check rests on
reading the served CSS, not a screenshot — and testing the keyboard turned up
a real gap (the carry stone has no `tabindex` and no key handler) that's
reported as a failure, not quietly fixed.

## Correcting

Two corrections landed in `CLAUDE.md` and `spec/` this week, each as a rule
rather than a retry:

- **The carry-never-broadcasts test was proven to fail before it was trusted
  to pass.** I deliberately broke `src/server.ts` to relay any unrecognised
  message live, confirmed the new test went red, then reverted — `git diff`
  showed zero change afterward
  ([`94a0056`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/94a0056)).
  A rule protecting the decision itself is now in `CLAUDE.md`
  ([`7bc290d`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/7bc290d)).
- **A spec test timed out against the live deploy, not against localhost.**
  The reconnect test opens three WebSocket connections in sequence; against
  `localhost` that's fast, but three real TLS handshakes to the deployed
  machine in `syd` pushed it past vitest's 5000ms default. I confirmed every
  assertion inside it actually passed given more time before changing
  anything, then raised that one test's timeout rather than touching the app,
  and logged the rule in `CLAUDE.md`
  ([`5dd6ba2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/5dd6ba2)).

## What I'm watching for in week 11

The keyboard gap found this week is real and still open: the core
carry-and-drop interaction has no keyboard path at all. Fixing it means
deciding what "drop via keyboard" actually does — land at a default position,
or something else — which is a decision, not a one-line patch, so it's named
here rather than guessed at.
