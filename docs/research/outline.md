# Outline for research-note.md

Outline only — no prose written for the note itself. Built from the interview
in this session; all quotes verified against primary sources before use.

## Position

Good agentic practice is the developer keeping the "theory" of the program
(Naur) by watching each check fail for the right reason before trusting it,
because an agent can make a check pass without understanding why it exists.

## Claim 1 — the theory lives in the developer, not in the code or the checks

**Source doing the work:** Naur, *Programming as Theory Building* (1985).

- Thesis: "programming properly should be regarded as an activity by which
  the programmers form or achieve a certain kind of insight, a theory, of
  the matters at hand."
- Mechanism (what this claim actually leans on): "the continued adaption,
  modification, and correction of errors in [certain kinds of large
  programs], is essentially dependent on a certain kind of knowledge
  possessed by a group of programmers who are closely and continuously
  connected with them."
- Limit: "reestablishing the theory of a program merely from the
  documentation, is strictly impossible." Tests are a kind of documentation
  on this reading — they can't carry the theory by themselves.

**Use as evidence, not summary:** quote "strictly impossible" directly
against a concrete scenario — an agent inherits a codebase with a green
suite and no held theory — to show the gap a passing check can't close on
its own.

**Flag:** none — this source is used as evidence (a specific mechanism and a
specific limit), not just summarised.

## Claim 2 — watching a check fail is the practice that keeps the theory once an agent writes the code

**Source doing the work:** Beck, *Augmented Coding: Beyond the Vibes* (2025).

- Definition: "In vibe coding you don't care about the code, just the
  behavior of the system." / "In augmented coding you care about the code,
  its complexity, the tests, & their coverage."
- Tests steer, not just evaluate afterward: "find the next unmarked test in
  plan.md, implement the test, then implement only enough code to make that
  test pass." — this is the quote to lead with, not the "care about... the
  tests" line, which only shows he values tests, not that he uses them to
  direct the agent.
- Failure mode this claim is built to catch: "Any indication that the genie
  was cheating, for example by disabling or deleting tests."

**Use as evidence, not summary:** cite the test-first instruction as a
first-person operational account of "watching a check" as an active
practice during generation, not a post-hoc gate — then connect it to Naur's
mechanism (below).

**Flag:** none — specific passages, used to do argumentative work (steering
mechanism), not just reported.

## Claim 1 + 2 together — my synthesis, explicitly marked as mine

Naur and Beck address different parts of the same problem, not the same
question: Naur explains **where** a program's theory lives and why text
alone can't hold it; Beck describes **how** to work with a tool that writes
the text so the developer still ends up holding that theory. Neither author
makes this connection — stating it plainly in the note as "my argument,
connecting two sources that don't address each other" is the HD-level move,
not a disagreement being resolved.

- I side with Naur on *where* the theory lives (in the developer).
- I take Beck's practice (test-first, watching for cheating) as *how* the
  developer keeps that theory once an agent is doing the typing.
- Tests don't hold the theory; the act of watching one fail, and knowing
  why, is what keeps the theory in the developer's head.

## Claim 3 — a check nobody has watched fail can't be trusted (not: checks are useless)

**Source doing the work:** the course's own Goodhart's-law example (Week 5
lecture, "a spec a machine can satisfy"), attributed as Goodhart's law in
Marilyn Strathern's phrasing (Strathern 1997, "'Improving ratings': audit in
the British University system," *European Review* 5(3): 305–321, quoting
Hoskin's 1996 paraphrase of Goodhart 1975).

- Exact course passage: "when a measure becomes a target, it ceases to be a
  good measure" — illustrated with a spec line "every page links home"
  satisfied by a hidden same-page `<a href="/">`.

**Use as evidence, not summary:** the course's own example *is* the "check
nobody watched fail" case — the check was never tested against a real
violation, so nobody learned what it actually verified, and the agent found
the cheapest path to green. Use it to demonstrate the failure mode, then
state explicitly that the course slide stops at the example and doesn't
generalise to "therefore checks are untrustworthy" — that generalisation
(checks are trustworthy only once watched fail; not trustworthy by default)
is mine, built on top of the example.

**Flag:** the course slide alone is not evidence the full position can lean
on — it only shows *an* example of gaming, not that watching-fail is the
fix. Claim 3 needs Claim 2 (Beck's practice) to supply the fix; cited alone,
the Goodhart example only supports "checks can be gamed," not "watching
checks fail prevents that." State the two together, not Goodhart in
isolation.

## The counter-case and my reply

**Counter-case 1 — Goodhart's law applied to agentic testing:** once a check
is the target, the agent optimises for passing it, not for what it was
meant to measure; more checks just means more targets to game.

**Counter-case 2 — Naur against checks generally:** "reestablishing the
theory of a program merely from the documentation, is strictly impossible."
Tests are documentation; so by Naur's own argument, no set of tests can hold
the theory either — which seems to cut against centring checks at all.

**My reply:** both counter-cases are right that a check on its own isn't the
theory — that's the position, not a refutation of it. I'm not claiming
checks replace understanding. Watching a check fail for the right reason is
*how* the developer builds and keeps that understanding, because knowing
why it went red requires knowing what it protects. Goodhart's example
describes what happens when nobody does that watching. Beck's warning about
the genie "disabling or deleting tests" is the practitioner-side version of
the same failure. The counter-case argues against trusting an unwatched
check — which is my position, not an objection to it.

**Flag:** this reply depends on Claim 1 and Claim 2 already being
established (theory-in-developer, watching-as-practice) — it doesn't work
as a free-standing response; the outline needs Claims 1–2 to land before
the counter-case section, in that order.

## Scope — what the position is NOT claiming

1. Not that checks are useless or that more checks are bad — a check nobody
   has watched fail can't be trusted; that's narrower than "checks don't
   work."
2. Not that agents shouldn't write code, or that the developer must type it
   themselves — the developer's job moves to keeping the theory, not to
   typing.
3. **Out of scope, stated explicitly, not argued against:** whether agents
   make developers faster. The productivity literature (METR 2025, Peng et
   al. 2023, DORA 2024) asks whether agents make developers faster; this
   position asks what makes a developer's checks trustworthy — a different
   question. These three sources do not belong in the counter-case section;
   a claim not being made can't be opposed. *(Optional, author's call at
   write-up: one sentence on METR — developers in that study *felt* faster
   while measurably being slower, which is itself evidence that a felt
   signal isn't evidence — usable as a small aside on why self-verification
   beats self-report, not as a counter-case.)*
4. Scoped by lifespan, not Naur's literal qualifier: "software someone has
   to keep changing and correcting over time," not throwaway scripts. Note
   explicitly in the note that this takes Naur's *mechanism* ("continued
   adaption, modification, and correction... dependent on... people closely
   and continuously connected with [the program]") rather than his exact
   qualifier ("certain kinds of **large** programs") — the mechanism is
   about continuity of correction, not size, and size was likely his proxy
   for it.
5. Not claiming watching-checks-fail is the *only* way to keep the theory —
   only that it's the practice that matters most once an agent is doing the
   writing.
6. Deliberate narrowing, not an oversight: the position is about checks
   specifically, not code review or diff-reading generally. Checks are what
   the agent is optimising against (Goodhart), and they re-run on every
   change with no person necessarily present, so a bad check keeps lying
   long after anyone last looked at it — that persistence is why checks get
   the argument's full weight and review doesn't. Reading the diff and
   explaining the code back (Willison's broader "confidently verifying"
   standard) still matter but are a separate claim, not this one.

## Illustration (one to two sentences, not the argument)

Real example, verified against `CLAUDE.md`'s own corrections log (not the
Q6 draft, which didn't match the repo's actual history): two new spec tests
for the project's identity rules silently read a stale queued message
instead of the new broadcast they were supposed to wait for — one test
checked `b.queue`'s length right after a broadcast that had already landed
in it unread, the other consumed an already-queued `"state"` push instead
of the `"stone"` broadcast its assertion actually needed — so both tests
went green when the behaviour they were meant to guard was actually
untested. Caught only by the deliberate-break exercise (breaking the code
on purpose and watching a test fail to turn red), not by reading the tests
first.

**Flag:** keep this to the two sentences above in the actual note — it's
illustration, not evidence for a claim; don't let it expand into a project
narrative.

## Sources checked and found to require no change

- Naur 1985 — verified: thesis, mechanism, and "strictly impossible" quotes
  all confirmed against a text-extracted copy of the paper.
- Beck 2025 — verified: vibe/augmented definitions, test-first instruction,
  and "disabling or deleting tests" quote all confirmed against the primary
  post.
- Goodhart's law / Strathern 1997 — verified: exact course wording
  confirmed against `lectures/week-5`; correct scholarly attribution traced
  (Strathern 1997, quoting Hoskin 1996's paraphrase of Goodhart 1975).

## Sources available but not currently assigned a role

From `reading-notes.md`, not used above — available if a claim needs a
fourth source, but not yet slotted in:

- Böckeler, *Harness engineering* — the guides/sensors, computational/
  inferential taxonomy could sharpen what kind of "check" Claim 3 means, if
  the note needs that precision.
- Storey, *Technical/Cognitive/Intent Debt* — could extend Claim 3 (a green
  suite is compatible with rising cognitive debt), not yet needed given
  Naur already supplies that limit.
- Willison, *Not all AI-assisted programming is vibe coding* — relevant to
  scope point 6 (the broader reviewed/not-reviewed standard this position
  deliberately narrows away from) if that line needs a citation of its own.
- Ronacher, Osmani, Cognition (both posts), Yegge/Klabnik — not used; all
  were grouped under "opposes/complicates" in the reading notes but none
  were raised as the counter-case in this interview. Available if the
  counter-case section is expanded, but as the outline stands, Goodhart +
  Naur are the two counter-cases actually met.
