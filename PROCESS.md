# Process overview

This describes the project as it stands at the week 9 crit ("It's alive!"). It
gets rewritten, not appended to, at weeks 10 and 11; the `/ship` tags keep each
version.

## Where it stands

Cairn isn't deployed yet — `flyctl deploy` has had no Fly credentials to work
with, so there's no live `*.fly.dev` URL. Locally it does the core thing for a
stranger: arrive, carry a stone, let it go, watch it settle — for you, and for
anyone else with the page open, within about a second. It's real-time over
WebSockets, because the core interaction was hollow without it: a stone
falling only on your own screen is a form submission, not a cairn. Moderation
and a written decision about multi-user behaviour at real scale are next.

## From the brief to Cairn

The brief warns that an agent asked for a multi-user, real-time website builds
the median answer: a chat room with the nouns swapped. So I started from what I
didn't want and from the situation the brief names, the showcase: a room of
people using it at once.

Two shapes came up before Cairn. A shared pixel wall is the obvious co-presence
piece, but unlimited marks make it a feed with colours; nobody's pixel matters.
A shared garden was close, but needed invented reasons to come back. A cairn
kept both things the brief asks for in one metaphor people already know: many
hands, one pile (co-presence), and a stone that stays (persistence). Sloan's
home-cooked-software essay gave permission to design for one studio rather
than for scale, which is also why there are no accounts and no moderation
tools yet.

## The stack, and why

Node 24 with the built-in `node:sqlite` and `node:http`, and one runtime
dependency, `ws`, for the WebSocket upgrade. The full trade-off — including
what a framework-plus-managed-database approach and a CRDT/local-first design
would each have cost — is in [ADR 0001](docs/adr/0001-stack.md). The deciding
reason was fit: Node 24 type-strips and runs the `.ts` source directly, so
there's no build step anywhere, in dev or in the image; `node:sqlite` meant
persistence needed no extra dependency either. The cost is a few TypeScript
constructs the type-stripper can't erase, and no offline/CRDT story if Cairn
ever needed one — but appending a stone to a shared pile never conflicts, so
that complexity wasn't earned. Identity is a client-generated id kept in
`localStorage`, hashed to a colour server-side — deliberately not a cookie or
an account — argued for in [ADR 0002](docs/adr/0002-visitor-identity.md).

The schema is the smallest one that carries the interaction: one `stones`
table (`id`, `visitor_id`, `color`, `x`, `rotation`, `created_at`). There is no
visitors table, because a visitor is only an id attached to the stones they
placed, and there's no accounts table to join it against
([`4ccb591`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/4ccb591)).

## How I worked with the agent

The agent read the course's fixed files first (`fly.toml`, the `Dockerfile`
comments, `spec/README.md`, the evidence script), so the constraints were in
context before any design. The order I held to when reviewing was README claim
→ CLAUDE.md rule → `spec/` test, so every claim README makes that's meant to be
enforced, rather than judged, points at a named test
([`ccf66e6`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/ccf66e6)).

Two practices did most of the grounding. Every check runs against a real,
running instance of the app — over HTTP and over the actual `/ws` protocol —
so a pass means deployed behaviour, not an isolated function. And a check
isn't trusted until it has failed for real: the markdown renderer's code-span
bug and the WebSocket harness's message-ordering race (below) were both
caught this way, as genuine failures, not staged ones. For the interface, done
meant two browser sessions open side by side and watched directly — a stone
placed in one appeared in the other within about a second, the claim README
actually makes.

## Where I directed the work

My direction this week was about scope and order more than code. I decided to
ship the crit before thinking further about the final project, so the first
version aimed at the "proof of life" line and nothing else; real-time came
early only because the cairn made no sense without it. I kept the parts of the
evidence that are about me, this section and the reflection, out of the
agent's hands, and ran my own agent as five prompts in a fixed order:
constraints, staged commits, deploy and verify, process, reflection. The
deploy prompt required any failure to be fixed as a rule in CLAUDE.md or a test
in `spec/`, not just patched. What I'd change: decide the concept before the
session starts. Cairn came out of the session, and I read the ADRs afterwards
to be sure I could defend it.

## Correcting

The corrections that mattered are in CLAUDE.md's corrections log, each as a
rule rather than a retry
([`9e34c45`](https://github.com/comp4020-agentic-coding-studio/comp4020-final-saiuppalapati7443/commit/9e34c45)):

- **The markdown renderer re-rendered markdown found inside its own code
  spans.** A literal `` `![alt](src)` ``, backticked specifically so it would
  display as text, was turned into a nested `<img>` instead, because the
  image/link patterns ran over text that already contained rendered `<code>`
  spans. Fixed by pulling code spans out behind placeholders before any other
  inline rule runs, and restoring them last. The rule: once text is inside a
  code span, nothing else may touch it again.
- **A WebSocket test attached its listener too late.** `ws.once("message",
  ...)` was attached only after `await connect()` had already resolved, and
  Node's `EventEmitter` doesn't queue an event for a listener that isn't
  registered yet — so a message arriving in that gap (often the initial
  `state` push) was lost, and the next wait picked up the wrong message,
  hanging two tests. Fixed by giving every test connection a message queue
  from the moment it opens. The rule: anything that `await`s before it starts
  listening to a socket needs a queue, not a one-shot listener.

## What I'm watching for in week 10

The README's weakest claim is that there's no cap and no rate limit on the
pile — fine for a room-sized showcase, untested against the open internet.
Getting the app actually deployed, and the repo public, comes first; neither
is true yet. The real-time layer also needs its own written decision:
appending a stone never conflicts, so a single authoritative server over
WebSockets was simple enough to get to "it's alive," but multi-user behaviour
at real scale — many simultaneous drops, a pile that keeps growing — hasn't
been argued for in writing the way the stack and identity decisions were.

