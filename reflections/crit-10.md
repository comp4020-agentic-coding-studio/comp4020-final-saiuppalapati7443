# Crit 10 reflection

1. What was the breakthrough that moved the work forward?

    The breakthrough was watching a test pass when it shouldn't have. I asked
    the agent to deliberately break the server — make it trust a fake
    visitor id instead of the real cookie — and confirm the test for that
    rule actually caught it. The first version of the test went green
    anyway. It only checked what a different visitor saw, not what the
    person who actually dropped the stone saw, so the exact bug it was meant
    to catch slipped right past it. We had to rewrite the test to check
    both sides before it would really fail. That changed how I think about a
    passing test: it only means something once I've watched it fail for the
    right reason first.

2. What did this work change about who I want to be as a software developer?

    The agent wrote almost all of the code this week — the cookie handling,
    the logging, the tests, even the fix for a real bug in a library we were
    using. What was mine was deciding what "who may see and change what"
    actually meant before any code got written, pushing back when a test
    passed for the wrong reason, and insisting on watching the real,
    deployed site with real logs before trusting any of it. I want to be the
    kind of developer who doesn't let a green checkmark stand in for
    actually checking the thing. Next time I want to be faster at spotting a
    weak test myself, instead of only catching it because we happened to
    break something on purpose.
