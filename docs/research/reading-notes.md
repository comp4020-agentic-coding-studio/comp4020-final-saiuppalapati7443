# Reading notes for research-note.md

Prep material only — no position argued here. Collected by reading the course
website directly (lecture pages, topic pages, the course overview) plus
verifying six user-supplied candidates against their primary sources. All
URLs were fetched and checked on 2026-11-01; "year" is the publication year
of the piece itself, not when the course cites it.

## 1. How the course reads its literature (5 lines)

From `topics/course-overview/#how-the-course-reads-its-literature`, summarised:

1. Two literatures, read differently: settled scholarship (the studio/reflective-practice tradition — Schön, feedback and deliberate-practice research) versus the fast-moving agentic-coding field.
2. The first shapes the crit and assessment models directly; you apply it every week through the crit protocol and the standing reflection prompts — it isn't optional background, it's the mechanism.
3. The second — "the sharpest current thinking about workflows and harnesses" — lives mostly in practitioner writing: posts, talks, framework documentation, and it can date within a semester.
4. The course's instruction for reading that second literature is explicit: "Read it with scholarly habits anyway: situate the claim, weigh its evidence, notice what it's selling."
5. In short: don't expect peer review from the agentic-coding sources, but don't suspend judgement either — treat a practitioner post the way you'd treat a claim at a crit, checked against what it can actually show.

## 2. Readings, talks and posts assigned or discussed in course pages

Grouped roughly by where they came up. "Scholarly" = peer-reviewed, a preprint
server, or an academic report with stated methodology; "practitioner" =
company engineering blog, personal blog/newsletter, conference talk writeup,
or trade press.

| Author | Title | Year | URL | Type | One-line claim |
| --- | --- | --- | --- | --- | --- |
| Birgitta Böckeler | Harness engineering for coding agent users | 2026 | <https://martinfowler.com/articles/harness-engineering.html> | Practitioner | Splits agent-harness controls into guides (feedforward) vs. sensors (feedback), and computational (deterministic) vs. inferential (judgement-based) — neither axis reaches the tacit, undocumented part of a codebase. |
| Simon Willison | Agentic Engineering Patterns (ongoing guide) | 2025– | <https://simonwillison.net/guides/agentic-engineering-patterns/> | Practitioner | Catalogues named practices (first run the tests, agentic manual testing, red/green TDD, hoard things you know how to do) under the principle that generating code is now cheap and verifying it is the scarce skill. |
| Simon Willison | "writing code is cheap now" (section of the above) | 2025 | <https://simonwillison.net/guides/agentic-engineering-patterns/code-is-cheap/> | Practitioner | Names the shift directly: code generation stopped being the expensive part of software development, so practices built around scarce generation need revising. |
| Simon Willison | Vibe coding and agentic engineering (reflecting on a year since naming the pair) | 2026 (May) | <https://simonwillison.net/2026/May/6/vibe-coding-and-agentic-engineering/> | Practitioner | A year after distinguishing the two terms, admits he no longer reviews every line his agents write, but remains accountable for all of it — the discipline survives even as the review habit loosens. |
| Margaret-Anne Storey | From Technical Debt to Cognitive and Intent Debt: Rethinking Software Health in the Age of AI | 2026 | <https://arxiv.org/abs/2603.22106> | Scholarly (preprint) | Proposes a "Triple Debt Model" — technical debt in code, cognitive debt in people (eroded shared understanding), intent debt in externalised rationale — arguing AI changes the relative weight of each. |
| Peter Naur | Programming as Theory Building | 1985 | <https://gwern.net/doc/cs/algorithm/1985-naur.pdf> | Scholarly | A program's real content is the theory its builders hold in their heads; rebuilding that theory from documentation alone, after the builders are gone, is "strictly impossible." |
| METR (Joel Becker, Nate Rush, Beth Barnes, David Rein) | Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity | 2025 | <https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/> | Scholarly (RCT, published as a research org blog post, not yet peer-reviewed) | Randomised trial, 16 experienced developers, 246 real issues in large familiar codebases: AI assistance made them 19% *slower*, while they believed afterward they'd been 20% faster. |
| Kieran Klaassen (Every) | Compounding engineering | ~2026 | <https://every.to/c/compounding-engineering> | Practitioner | Coins "compound engineering": plan → work → review → compound, so each cycle writes learnings back into persistent context (CLAUDE.md, skills, checks) that the next cycle starts from. |
| Cognition (makers of Devin) | Don't Build Multi-Agents | 2025 | <https://cognition.com/blog/dont-build-multi-agents> | Practitioner | Thought experiment: two subagents building halves of a Flappy Bird clone independently return mismatched assets (a Mario background, a bird that doesn't match) — split writes lose coherence. |
| Cognition | Multi-agents are working now | 2026 | <https://cognition.com/blog/multi-agents-working> | Practitioner | Ten months after "don't build multi-agents": read-only subagents and review loops now work well; parallel *writers* still don't — walks back the earlier claim selectively. |
| Anthropic | How we built our multi-agent research system | ~2025 | <https://www.anthropic.com/engineering/multi-agent-research-system> | Practitioner | Their own lead-agent-plus-parallel-search-subagents system gets better research results, at roughly 15× the token cost of a single chat. |
| Armin Ronacher | The tower keeps rising | 2026 | <https://lucumr.pocoo.org/2026/7/13/the-tower-keeps-rising/> | Practitioner | Each individual agent-authored change can be reasonable in isolation while the codebase's overall coherence erodes anyway — checks passing per-commit don't add up to a coherent system. |
| Addy Osmani | (untitled blog post on agentic engineering) | 2026 | <https://addyosmani.com/blog/agentic-engineering/> | Practitioner | Agents can implement a design but can't judge whether it's the *right* design — that judgement stays with the human regardless of how good the agent's output is. |
| Steve Yegge | Welcome to Gas Town | 2026 | <https://steve-yegge.medium.com/welcome-to-gas-town-4f25ee16dd04> | Practitioner | Describes an agent orchestrator running dozens of agents at once, thousands of dollars/month in API spend, 75k lines in 17 days — self-described as complicated "not because I wanted it to be." |
| Steve Klabnik | How to think about Gas Town | 2026 | <https://steveklabnik.com/writing/how-to-think-about-gas-town/> | Practitioner | Calls Yegge's approach "aggressively not rigorous," while being glad someone is running the experiment — a sympathetic but unsparing practitioner critique of another practitioner's claims. |
| Marilyn Strathern (phrasing); Goodhart's law | "When a measure becomes a target, it ceases to be a good measure" | concept predates both; Strathern's phrasing widely cited | <https://en.wikipedia.org/wiki/Goodhart%27s_law> | Scholarly (anthropology/economics origin, cited here via a tertiary source) | Applied by the course directly to specs: a spec line like "every page links home" can be satisfied by a hidden same-page link that turns the check green without meeting the actual intent. |
| Andrej Karpathy | Naming "vibe coding" | 2025 (Feb) | not directly linked by the course; widely known as a social-media post | Practitioner | Coined the term for prompt-accept-run-without-reading practice, later proposing "agentic engineering" as its disciplined opposite. |
| Kent Beck | "It's the first derivative of your productivity that we're looking for" | 2026 (May) | <https://newsletter.kentbeck.com/p/hey-n00b-we-didnt-hire-you-to-complete> | Practitioner | A different Kent Beck piece from the one in §3 below — argues the metric that matters for a junior engineer isn't task completion speed but whether their own capability is still increasing. |
| Ankur Sethi | (untitled, on retyping LLM-generated code) | 2026 (Aug) | <https://ankursethi.com/blog/prevent-cognitive-debt-by-manually-retyping-llm-generated-code/> | Practitioner | Manually retypes every change an agent proposes: "I value comprehension over productivity" — a deliberate anti-pattern against pure throughput. |
| Birgitta Böckeler / Learn Harness Engineering (collective) | Learn Harness Engineering | 2026 | <https://walkinglabs.github.io/learn-harness-engineering/en/> | Practitioner | A vocabulary/guide site the course borrows "guides and sensors" terminology from, in parallel with Böckeler's own split. |

Schön's reflective practicum and the deliberate-practice literature are named
directly in the course overview's own prose ("Schön's reflective practicum,
the feedback and deliberate-practice literature") but not given a specific
URL or edition there — they're the scholarly literature's named anchor, cited
by name rather than linked.

## 3. User-supplied candidates — verified

All six checked against their primary source directly; all are real and as
described.

| Author | Title | Year | URL | Type | One-line claim |
| --- | --- | --- | --- | --- | --- |
| Kent Beck | Augmented Coding: Beyond the Vibes | 2025 (25 June) | <https://newsletter.kentbeck.com/p/augmented-coding-beyond-the-vibes> | Practitioner | Distinguishes "augmented coding" (still caring about code quality, still watching for warning signs, letting the AI write most of the code) from vibe coding (caring only about behaviour) — a disciplined middle ground built from one real project (a B+ Tree library). |
| Simon Willison | Not all AI-assisted programming is vibe coding (but vibe coding rocks) | 2025 (19 March) | <https://simonwillison.net/2025/Mar/19/vibe-coding/> | Practitioner | Vibe coding specifically means building software with an LLM *without reviewing the code it writes*; responsible professional practice reviews, tests, and can explain all code before committing — the term's casual overuse erases that line. |
| Anthropic (Erik Schluntz, Barry Zhang) | Building Effective Agents | 2024 (19 December) | <https://www.anthropic.com/engineering/building-effective-agents> | Practitioner | The best agentic systems came from simple, composable patterns rather than elaborate frameworks — start with simple prompts, add agentic complexity only when simpler workflows fall short. |
| METR | Measuring the Impact of Early-2025 AI on Experienced Open-Source Developer Productivity | 2025 | <https://metr.org/blog/2025-07-10-early-2025-ai-experienced-os-dev-study/> | Scholarly (RCT) | Same study as §2 — included here because it's independently one of the named candidates. 16 experienced devs, 246 real issues, AI assistance made them 19% slower while they believed they'd been sped up. |
| Google / DORA | Accelerate State of DevOps Report 2024 | 2024 | <https://dora.dev/research/2024/dora-report/> | Scholarly (industry survey research program) | Large-scale survey finding: AI adoption significantly increases individual productivity, flow, and job satisfaction, but *negatively impacts software delivery stability and throughput* — a split result, not a clean win. |
| Peng, Kalliamvakou, Cihon, Demirer | The Impact of AI on Developer Productivity: Evidence from GitHub Copilot | 2023 | <https://arxiv.org/abs/2302.06590> | Scholarly (preprint, controlled experiment) | Controlled experiment, recruited developers implementing an HTTP server in JS: the Copilot-assisted group finished 55.8% faster than the control group — the headline "AI makes you faster" result the later studies complicate. |

Note: METR's study legitimately belongs in both §2 (it's directly cited by
the course, in `topics/evidence-of-practice`) and §3 (it was also one of the
six candidates to verify) — it isn't double-counted as two different
sources, just listed once per section for completeness against each ask.

## 4. Grouped by position on: "Does good agentic practice depend on the developer building and verifying the checks the agent must pass, rather than on generating code faster?"

**Supports** (practice should centre on checks/verification over raw speed):

- Böckeler, *Harness engineering for coding agent users*
- Willison, *Agentic Engineering Patterns* / "writing code is cheap now"
- Learn Harness Engineering
- Naur, *Programming as Theory Building* (indirectly — if the theory lives in the builder's head, no check substitutes for understanding, but understanding is what verification work builds)
- Willison, *Not all AI-assisted programming is vibe coding*
- Beck, *Augmented Coding: Beyond the Vibes*
- Sethi, retyping-code post
- Anthropic, *Building Effective Agents* (indirectly — argues for simple, inspectable systems over elaborate ones, which favours verifiable small steps)

**Opposes or complicates** (checks passing isn't the same as good practice, or speed genuinely is the gain):

- Peng et al. 2023 (Copilot controlled study) — the headline result *is* raw speed, measured and real, with no verification variable isolated
- METR 2025 — directly opposes "verify-first" as a guarantee of speed: these developers were already careful, experienced, verifying as they went, and still measured *slower*, not faster, which cuts against any simple "do more verification, get better outcomes" story
- Storey, *Technical/Cognitive/Intent Debt* — checks passing (technical-debt-clean) can coexist with rising cognitive debt; a green suite doesn't mean the practice is good
- Ronacher, *The tower keeps rising* — each individually-checked change can be reasonable while coherence erodes; checks are necessary but not sufficient
- Osmani — agents implement, can't judge whether it's the *right* thing to implement; checks test correctness against a spec, not whether the spec was worth building
- Goodhart's law / Strathern — a check, once it's the target, stops being a good measure of the thing it was meant to measure
- Cognition, *Don't Build Multi-Agents* / *Multi-agents are working now* — the two posts together show the field's own claims about what works shifting within a year, which complicates treating any single practitioner post as settled practice
- Yegge, *Gas Town* / Klabnik's response — a genuinely productive (75k lines in 17 days), by-the-author's-own-admission *not rigorous* practice, directly testing whether verification-heavy process is actually necessary for output

**DORA 2024** sits across both: supports a "practice matters, not just speed" reading (stability/throughput drop even as individual productivity rises) but complicates a simple "verify more, get better" story, since the report's prescription is about batch size and testing fundamentals broadly, not agent-specific verification habits.

**Google DORA 2024, Anthropic multi-agent research system post** — largely orthogonal to this specific question (DORA is about team/org-level delivery metrics generally; the Anthropic post is about multi-agent architecture cost, not verification practice) — useful for scope-setting or counter-evidence about what "good practice" even measures, not direct evidence either way.

## 5. Per-source: how it could be used as evidence, and its stance

| Source | How to use it as evidence (not summary) | Stance |
| --- | --- | --- |
| Böckeler, *Harness engineering* | Cite the guides/sensors and computational/inferential matrix as the taxonomy for *what kind* of verification work the thesis is actually arguing for — use it to define terms precisely before arguing the position, not as a quote to agree with. | Supports |
| Willison, *Agentic Engineering Patterns* | Use the specific named patterns (first-run-the-tests, agentic manual testing, red/green TDD) as a concrete, checkable operationalisation of "verification work" — point to one pattern and show it in your own project's commits as evidence the practice is real, not aspirational. | Supports |
| Willison, "writing code is cheap now" | Use as the premise that makes the whole question worth asking: if generation were still scarce, the argument would be moot — cite it to establish why verification became the live question at all. | Supports |
| Willison, *Not all AI-assisted programming is vibe coding* | Use the reviewed/not-reviewed line as the exact boundary the thesis needs — contrast a counter-example (a developer who ships unreviewed and is fine) against it to test whether the boundary actually holds. | Supports |
| Naur, *Programming as Theory Building* | Use the "strictly impossible" claim to argue why no amount of passing checks substitutes for a held theory — pair it with a concrete scenario (an agent inherits a codebase with green tests but no theory) to show the gap checks can't close. | Supports (indirectly) |
| METR 2025 | Use the *mismatch* — developers predicted speedup, believed they got it, actually got slower — as a direct empirical counter-example to any claim that more care/verification straightforwardly produces better measured outcomes; it's the strongest single piece of counter-evidence available. | Opposes/complicates |
| Storey, *Technical/Cognitive/Intent Debt* | Use the Triple Debt Model to show a green CI run is compatible with *rising* cognitive debt — cite it to argue "checks" is underspecified unless you also specify *which* debt they address. | Complicates |
| Peng et al. 2023 | Use the 55.8% figure as the "speed alone" baseline the thesis has to argue past — cite it, then immediately show what it doesn't measure (code review burden, defect rate, maintainability) to turn it from a counter-example into a scoping tool. | Opposes/complicates (useful as the position to argue against) |
| Google DORA 2024 | Use the stability/throughput-vs-productivity split as evidence that "faster" and "good practice" are already empirically two different axes at the organisational level, independent of any individual developer's habits — cite it to generalise the argument beyond one's own project. | Complicates (orthogonal metric, useful for scope) |
| Anthropic, *Building Effective Agents* | Use the "simple, composable, inspectable" prescription as evidence that even the company building the frontier models argues for human-legible, checkable systems over opaque, complex ones — cite it to show the position isn't only a practitioner-blog fringe view. | Supports |
| Ronacher, *The tower keeps rising* | Use the "coherence erodes anyway" claim to argue checks have a scope limit — cite a concrete example of a per-commit-green but incoherent codebase (your own project's near-misses, if any) to make the limit concrete rather than asserted. | Opposes/complicates |
| Goodhart's law (Strathern) | Use it as the structural reason checks alone can't be the whole answer — once a spec line becomes the target, gaming it (the "every page links home" example) becomes rational, so the thesis needs a second mechanism (judgement, review) beyond the check itself. | Complicates |
| Beck, *Augmented Coding: Beyond the Vibes* | Use the concrete warning-signs list (loops, unrequested functionality, tests being disabled) as a first-person account of what "verifying the checks" looks like in practice, from someone who writes almost none of the code themselves — cite it as a practitioner existence proof. | Supports |
| Cognition, two posts (2025, 2026) | Use the ten-month reversal itself as evidence for the course's own framing — practitioner literature moves faster than peer review — and argue that this instability is exactly why *self-verified* practice (your own checks, not borrowed claims) matters more, not less. | Complicates (meta-evidence about the literature's reliability) |
| Yegge/Klabnik, Gas Town | Use as the hardest case against the thesis: genuinely high output, admittedly low rigour — cite it, then use Klabnik's own hedge ("glad someone is running the experiment") to argue that even its defenders don't claim it generalises as *good practice*, only as a useful experiment. | Opposes (strongest test case) |
