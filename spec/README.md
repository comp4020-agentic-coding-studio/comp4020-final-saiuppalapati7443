# The spec

The [final project brief](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/assessments/final-project/)
and its spec are on the course website, along with the specs for crits 8, 9 and
10, which run in this repo. The brief poses the problem; the spec is the fixed
contract.

## What ships

`invariants.test.ts` checks the two things the course relies on:

- `/` answers with a 200, which is what the deploy and the crit capture read
- `/readme/` publishes `README.md`. Markdown renderers all differ slightly, so
  it checks the README's headings rather than every word: each one has to
  appear, in order, in the HTML the server sends, since no script runs. Render
  it however you like, as long as it's there in full; the marker reads it there.

Both run against the **running** app over HTTP, so they hold whatever it's built
with. In CI that app is the image your `Dockerfile` builds, started with a
throwaway `/data`, and a red run blocks the deploy. Locally, start the app
however you run it and `pnpm check` finds it at `APP_URL` (default
`http://localhost:8080`). Keep them; don't delete them.

## Your checks

Everything else in `spec/` is yours to write. Any `spec/*.test.ts` runs with
`pnpm check`, against the same running app. Some lines of a spec only a person
can judge; those are left to the crit and the marker.

At a crit, a green `check` job is half the shipped mark, but it's never the
judgement of the work: your tutor checks what you deployed against the published
spec.

## What each README promise is actually enforced by

README's "What 'good' means here" section lists the checkable claims this app
makes. Each row below is one of those claims and the test (or tests) in this
directory that would fail if the claim stopped being true.

| README promise | Enforced by |
| --- | --- |
| `/` answers 200 | `invariants.test.ts` — "answers at /" |
| `/readme/` publishes README.md's actual content, rendered at request time | `invariants.test.ts` — "publishes README.md at /readme/" |
| A dropped stone is visible on every other open session within about a second, with no delay, batching, or polling added to the broadcast path | `cairn.test.ts` — "broadcasts a dropped stone to every other open session within about a second", "delivers a dropped stone to another open session within 1000ms", "keeps five simultaneous sessions consistent, including two dropping at once" |
| A session that was closed catches up on everything it missed when it reconnects, with no reload | `cairn.test.ts` — "catches up on reconnect after a dropped connection, without a reload", "shows a freshly opened session every stone dropped before it connected" |
| No cap on how large the pile can grow | `pile-size.test.ts` — "accepts, stores, and broadcasts 150 drops from 150 different visitors, with no cap" |
| Carrying a stone (the drag) never reaches `/ws` or gets broadcast — only a completed drop does (ADR 0003) | `cairn.test.ts` — "never broadcasts a carry/in-progress drag, only a completed drop (ADR 0003)" |
| What gets dropped survives a restart or redeploy (sqlite is the only place state lives) | `persistence.test.ts` — "keeps a dropped stone, still attributed to its owner, after the server restarts on the same DATA_DIR" |
| Two visitors can tell their stones apart (a server-set cookie, not anything client-claimed) | `cairn.test.ts` — "tells two visitors apart by a server-set cookie, not by anything they send", "gives the same visitor the same color across a reconnect" |
| Malformed or hostile input is dropped silently, never crashes the connection, never reaches another client | `cairn.test.ts` — "ignores a malformed drop instead of broadcasting it or dropping the connection" |
| Only a stone's real owner is told "this is yours"; no one else ever sees it as theirs | `cairn.test.ts` — "each visitor sees the other's stone live, but only their own is marked mine" |
| A tampered or forged cookie never becomes someone else's identity | `cairn.test.ts` — "gives a tampered cookie a brand-new identity, never someone else's" |
| A forged `visitorId`, `name`, `mine`, or `id` in a message body is ignored, never trusted | `cairn.test.ts` — "ignores a forged visitorId, name, mine, or id in the drop body" |
| No stone is ever movable, editable, or deletable by anyone, including its own owner | `cairn.test.ts` — "B cannot move, edit, or delete A's stone — there is no such message to send" |
| A response never contains a visitor's cookie id, in any field, for any stone | `cairn.test.ts` — "never includes a cookie id anywhere in a response" |
| Each visitor may place one stone per Canberra calendar day, enforced against the cookie-resolved identity | `cairn.test.ts` — "refuses a second drop from the same cookie on the same day, but allows a different cookie"; `canberra-date.test.ts` — "counts 1:30am Canberra time as the Canberra day, even though it's still the previous day in UTC" (the day boundary itself, as a pure unit test of `canberraDate()`, independent of the WS protocol) |
| A placement's log line names the visitor by pseudonym, never by cookie id | `logging.test.ts` — "logs a placement with the pseudonym and handle, and never the cookie id" |
| A rejected mutation attempt is logged naming the stone's real owner, never a cookie id | `logging.test.ts` — "logs a refused mutation attempt naming the stone's real owner, never the cookie id" |

## Promised in the next README revision

These four checks protect real behaviour the app actually has, but that
README's "What 'good' means here" section doesn't currently state as one of
its enumerated claims — they were written and verified ahead of the README
update that will name them outright. Until that revision lands, read these
as "already true and already tested," not "aspirational."

| What's checked | Enforced by |
| --- | --- |
| Cairn renders as an actual *pile* — a stone rests on whatever it overlaps, not at an arbitrary independent height — and the same pile looks the same (as a fraction of the page) on a phone and a laptop | `pile-layout.browser.test.ts` — "renders the same pile at the same fractional position on a phone and a laptop viewport", "lands a live drop from one session at the same relative spot on another session at a different viewport" |
| A visitor sees a plain "Reconnecting…" status, and the carry stone is disabled, for as long as the connection is actually down | `connection-status.browser.test.ts` — "shows a plain disconnected status and disables the carry stone while the connection is down, then recovers" |
| A refused drop (the daily limit) is shown to the visitor who tried it, not silently dropped | `connection-status.browser.test.ts` — "sends an explicit refusal message when the server rejects a drop, instead of silently dropping it" |
| A reconnect never duplicates a stone already drawn in the page itself | `reconnect.browser.test.ts` — "shows exactly one .stone element per stone after a reconnect, never a duplicate" (a real browser test: the WS-level reconnect test above only checks what the server *sends*, never what the page *draws*) |

## What's judged by people, and how

README names this directly: "Whether the *interaction* is actually good —
satisfying to drop, or reading as 'someone's here' rather than a
notification — isn't something a test can decide." Nothing in `spec/`
attempts to check these; they're judged the same way README says they were
decided — by a person watching the real app, not by an assertion.

- **Whether dropping a stone feels satisfying** — the landing animation, the
  weight of the drag, the moment it settles. Judged by actually dragging a
  stone in a real browser, not by reading the CSS.
- **Whether the pile reads as "someone's here" rather than a notification** —
  the passive-presence design Dourish & Bellotti (CSCW '92) argues for,
  cited in README. Judged from two browser windows side by side, watching a
  stone land in one while looking at the other — the same way the README
  says it was judged while building it.
- **Whether the "Forgotten web" and `reflections/` process writing meet
  their own separate briefs** (Crit 1 make-up visual style; weekly process
  honesty) — these aren't Cairn claims at all, so no `spec/*.test.ts`
  touches them. A tutor reads them directly, against their own published
  criteria.
- **"No multiple rooms" and "no moderation"** — README's "What I chose not
  to build" section names these as deliberate absences, not partial or
  half-built features. There's no in-progress room-switcher or moderation
  queue to regress, so there's nothing for a test to assert against;
  whether leaving them out was the right call for a crit-room audience is a
  judgement call a tutor makes by reading the ADRs' reasoning, not something
  `spec/*.test.ts` can check either way.
