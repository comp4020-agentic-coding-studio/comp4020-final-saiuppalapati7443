# Process overview

This describes Cairn as it stands at the week 10 crit ("Fly by instruments").
Like the last two weeks, it's rewritten, not appended to; the `/ship` tags
keep each version.

## Where it stands

Cairn is deployed at
[comp4020-final-saiuppalapati7443.fly.dev](https://comp4020-final-saiuppalapati7443.fly.dev).
A visitor drops a stone, it lands for everyone with the page open, and it
survives a restart or redeploy because the sqlite file at
`${DATA_DIR}/cairn.db` is the only place state lives. What's new this week is
the other half of a multi-user app: not just that people share state, but
that the server — not either client — decides who may see and change it, and
says so out loud in a log a human can read.

## The stack, and the workflow case for it

Unchanged since week 9: Node 24 runs `.ts` source directly, `node:sqlite` is
the only store, `ws` is the one runtime dependency, and there's no build
step anywhere — `node src/server.ts` is the entire run command, locally and
in the image. That shape kept paying off this week in a way worth naming:
adding real identity enforcement meant one new module
(`src/identity.ts`) and one schema migration, not a framework swap or a new
service. A small stack with few moving parts is cheap to extend carefully
instead of rebuilding around a new requirement.

## This week's decision

The crit specified the decision directly, not left it to me to pick between
options: identity comes only from a server-set cookie, never a value a
client sends; everyone sees every stone, but only the owner is ever told
"this is yours"; one stone per visitor per Canberra day; and no stone may
ever be moved, edited, or deleted, by anyone, including its own owner. My
job was to write the reasoning down properly — including the options that
were genuinely considered and rejected, like binding identity to a
connection instead of a cookie — and then make the server actually hold to
it. That's [ADR 0004](docs/adr/0004-who-may-see-and-change-what.md)
([`420ac2c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/420ac2cdf09a97083bedb210e608c0e87a2db4f6)).
It amends ADR 0002's identity transport (client-generated id in the message
body → server-set cookie) while keeping ADR 0002's anonymity decision
untouched: still just a hue, still no accounts, still no PII.

## Where I directed the work

I worked through the crit's six steps in the order given: ground first and
write the decision down, enforce it on the server and prove it with tests,
add logs and fix the page for a newcomer, deploy and rehearse against the
live site, then write up and ship. The calls that were actually mine: asking
before any push to `main`, since that's a shared and visible action, not
something to do by default; choosing to strengthen the "forged visitorId"
test after it passed against a deliberately broken server without catching
the break — the first version of that test only checked what a different
visitor saw, not what the real dropper saw, so it missed the exact bug it
was meant to catch; and deciding that a crib-sheet claim ("the app tells
visitors apart") wasn't ready to write until I'd seen it hold on the live
site, not just in a local test run.

## Grounding

Every claim this week was checked against a running app, not assumed from
reading the code. The identity rules were proven with a deliberate-break
exercise: the server was changed to trust a client-claimed `visitorId`, the
new test went red exactly as expected, the change was reverted, and `git
diff` showed nothing left behind
([`3ab01fa`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/3ab01fa5084f3139191db0dafaafc7669ddd1ea6)).
The logging claims were checked against a server's actual stdout, captured
by spawning an isolated instance, not inferred from the code that writes the
log lines
([`b877baa`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/b877baa8eccdc3ae8bd2fe6ba70f86342c74254c)).
The newcomer-clarity fixes were checked against real screenshots of the
running page at 390×844 and 1280×800, not a description of what the markup
should look like
([`0e7829c`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/0e7829c48ebe2a119656097b41db81aa1c5de8df)).
After deploying, CI's `check` and `deploy` jobs both passed, the full spec
ran again with `APP_URL` pointed at the live `fly.dev` URL (18 of 18 passing),
and the crit's actual rehearsal scenario was run against the live site —
two separate WebSocket sessions, two separate cookies, while `flyctl logs`
was tailed live — confirming two visitors read as distinct pseudonyms, a
second drop in one day was refused, and an attempt to edit another visitor's
stone was refused and correctly named the real owner
([`2f3c05e`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/2f3c05e88326601e0d2eeb1cd0fcd5f6e2ee402f)).

## Correcting

Two real bugs were found and fixed this week, each logged as a rule in
`CLAUDE.md` rather than patched quietly:

- **`ws`'s `"headers"` event fires inside `handleUpgrade`, before its own
  callback runs, not after.** The cookie-setting code for `/ws` first
  registered its listener inside the `handleUpgrade` callback, by analogy
  with how the connection handler itself is wired up. That's one tick too
  late — the library emits `"headers"` synchronously before the callback
  ever runs — so the `Set-Cookie` header silently never went out on a
  WebSocket upgrade. Caught by writing a standalone script that inspected
  the real upgrade response, not by a failing spec test
  ([`3ab01fa`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/3ab01fa5084f3139191db0dafaafc7669ddd1ea6)).
- **Two new identity tests raced a stale queued message**, one level deeper
  than the message-queue race `spec/cairn.test.ts` already guards against:
  one checked a queue length without first draining a legitimate broadcast
  that arrived first, the other called `nextMessage()` without draining a
  connection's initial `state` push, so it read that instead of the
  broadcast it meant to wait for. Both were caught by the deliberate-break
  exercise itself — one test went green when the server was broken and
  should have gone red — not by inspecting the test code first
  ([`3ab01fa`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/3ab01fa5084f3139191db0dafaafc7669ddd1ea6)).

## What I'm watching for in week 11

The keyboard gap flagged last week is closed — the carry stone now has a
real focus ring and an Enter/Space path. What's still open: the one-stone-
a-day limit resets on cleared cookies or a new browser, which is accepted
as a known property of anonymous identity, not a bug, but it's worth
watching whether that becomes a real complaint once more than a handful of
people actually use the app at once.
