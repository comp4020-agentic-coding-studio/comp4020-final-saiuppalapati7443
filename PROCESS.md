# Process overview

This describes Cairn as it stands at final submission — rewritten, not
appended to, same as every earlier week; the `/ship` tags keep each version.

## Where it stands

Cairn is one shared pile of stones, deployed at
[comp4020-final-saiuppalapati7443.fly.dev](https://comp4020-final-saiuppalapati7443.fly.dev).
You drag a stone onto the pile, or press Enter, and it lands for everyone
with the page open within about a second. Each visitor is an anonymous
cookie with a colour, gets one stone per Canberra day, and nobody can ever
move or delete a stone. The three things the brief asks for are all checked
by tests against the running app: real-time (a drop reaches other sessions
in under a second), multi-user (the server tells people apart by a cookie
it sets, never by anything the browser sends), and persistent (stones
survive a restart and a redeploy). The pile now actually stacks, looks the
same on a phone and a desktop, and still loads quickly with a thousand
stones.

## The stack, and why it paid off

Node 24 runs my TypeScript files directly, so there's no build step:
`node src/server.ts` is the whole run command, locally and in the Docker
image, so what I test is exactly what deploys
([`71f6f21`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/71f6f21e4bc1cb5a4fbdc7be1db4f880bc05ad8d)).
`node:sqlite` is built in, so there's no database server to run, just one
file on the Fly volume. `ws` is my only dependency, chosen over server-sent
events or polling because stones go both ways: the browser sends a drop,
the server sends it to everyone.

This paid off when I had to change things late: adding cookie identity in
crit 10 meant a new module and a schema migration, not a framework swap or
a new service
([`3ab01fa`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/3ab01fa5084f3139191db0dafaafc7669ddd1ea6)),
and the final performance fix only touched client-side code, never the
server
([`90752cb`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/90752cbfc8f2ef9c79e7fb79c9f50a9a3888d5f7)).
The cost was writing things a framework would give me, like my own markdown
renderer for `/readme/`, which had a real bug — it re-rendered markdown
inside code spans — that ended up in CLAUDE.md. And it only works on one
machine.

On the workflow: I ran the agent through a fixed list of prompts, one per
session, each ending the same way — `pnpm check` and `pnpm check:evidence`,
commit, push, watch CI deploy. I asked for a failing check first, then the
fix, then a deliberate break to prove the check catches it. I checked the
agent's reports myself, and stopped it when it called a failure a "flake,"
twice, both times a real bug — and checked what it wrote about my own
process too: an early reflection draft described events from a different
project, and it once discarded a half-finished change without asking.

## Verifying before trusting green

At the start, a passing test meant done. By the end, I don't trust a check
until I've seen it fail for the right reason — a green suite, or a "flaky"
test, kept turning out to hide a real problem. Each time, the fix went into
`CLAUDE.md` or `spec/` as a rule, so the agent can't repeat it.

The clearest case was `spec/logging.test.ts`. Two attempts both added
timeouts around the problem without finding it: replacing a fixed sleep with
a polling wait still failed in CI
([`fdfef52`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/fdfef521d605a2b3372c795d39f8ee26a9fd580f)),
and guarding every wait in the file still failed in CI after that
([`34a244e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/34a244e2a72be467cf99e4e9adb705acab326fa8)).
Both were retries until it passed — exactly what the "confirm it holds,
don't just make it pass" rule exists to stop. Reading CI's actual error on
the second failure, not just rerunning, found the real cause: a listener
attached after an `await`, the same message-arrives-before-anyone's-
listening race `CLAUDE.md` already warned about elsewhere. The fix used the
existing message-queue pattern instead of a bigger timeout, and the same bug
was found and fixed in `spec/persistence.test.ts` before it ever failed
there too
([`cc0e055`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/cc0e055677494cddf9724a351ab1b4685acddde2)).

The same pattern showed up elsewhere: a carry-stays-local test proved
"nothing arrived" while sharing a server with every other running test,
fixed with its own isolated server
([`b9ee9a5`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/b9ee9a53781592e6c2a8b5088a47070817515a0a));
a slowdown I blamed on my own large local database was really
`recomputeStacking()` running on every stone landed, an `O(n³)` cost on page
load
([`90752cb`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/90752cbfc8f2ef9c79e7fb79c9f50a9a3888d5f7));
and the missing link from `/readme/` back to the app was found only by
testing the live deployment, not by reading the code
([`03954e2`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/03954e2d3c945f8135195e244b32e71fca90254f)).

## The two decisions

**Carry stays local** ([ADR 0003](docs/adr/0003-carry-stays-local.md),
[`67668c6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/67668c630de8c862577a406d41185c5da945cab0)):
while you're dragging your stone, nobody else sees it; they only see it once
you drop it. Cairn is about the stone you choose to leave, not watching
people hesitate — at the cost of some live co-presence, which my pod argued
for at crit 9.

**Who may see and change what**
([ADR 0004](docs/adr/0004-who-may-see-and-change-what.md),
[`420ac2c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/420ac2cdf09a97083bedb210e608c0e87a2db4f6)):
the server decides who you are from a cookie it sets, never from anything
the browser sends. Everyone sees every stone, but only you are told which
ones are yours, you get one stone per Canberra day, and nobody, not even
you, can move or delete a stone — a rule only counts if the server enforces
it, otherwise anyone could pretend to be someone else or remove someone's
stone.

## What I read, and where I departed

I agree with Sloan that software can be made for a small group you know —
Cairn is for one room, on the smallest stack that works. I agree with
Dourish and Bellotti that people should notice each other through the
shared thing, not a list of who's online. Where I depart: I read Ink &
Switch's local-first argument and chose not to follow it — Cairn only ever
adds stones, so there's nothing to merge, and one server is simpler. And
the home-cooked idea suggests you can skip testing because it's just for
friends; I went the other way, because the agent writes the code, so the
checks are how I know it does what I meant.

## What's still rough

The test suite takes over a minute and needs Chrome installed for the
browser tests. Several tests now need their own isolated server to be
trustworthy — slower, but honest. Colour is the only way to tell people
apart, which isn't great for colourblind visitors, and keyboard users still
can't choose where their stone lands.

## Looking back

The agent wrote almost all of the code. My part was deciding what Cairn
should and shouldn't do, writing that into the README, CLAUDE.md, and the
tests, and refusing to accept "it passed" or "it's a flake" without knowing
why. The biggest change: I now treat every green check as a claim that
needs evidence.
