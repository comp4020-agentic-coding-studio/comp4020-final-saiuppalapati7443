# Crit 8 reflection

1. What was the breakthrough that moved the work forward?

    The breakthrough was watching a test fail on purpose. Until this week a
    green check meant "done" to me. When a WebSocket test I'd written started
    timing out — a message had already arrived and been silently dropped
    before anything was listening for it — I saw that a test I'd never seen
    fail was only a claim, not a guarantee. After that I read the spec
    differently: not as a box to tick, but as the README's promises in a form
    a machine can hold me to. The same idea caught the markdown bug: a line
    backticked specifically so it would stay literal text was quietly being
    re-rendered into a nested image, and only reading the actual output, not
    trusting that the code looked right, caught it.

2. What did this work change about who I want to be as a software developer?

    I leaned on the agent heavily this week, under a deadline, and most of
    the code isn't mine. What stayed mine was deciding what "good" means,
    what not to build, and whether each claim actually held up against the
    running app. That turned out to be the harder part, and the part I want
    to get better at. I also noticed the difference between fixing a bug and
    writing a rule. Two things went wrong, and both ended up in CLAUDE.md, so
    the next session can't make the same mistake. I want to be the developer
    who writes the rule, not the one who fixes the same thing twice. Next
    time I'll decide the idea before I open the agent.
