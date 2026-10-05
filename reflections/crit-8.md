# Crit 8 reflection

1. What was the breakthrough that moved the work forward?

    The breakthrough was the WebSocket test race. A test started hanging and
    I didn't know why — I just saw it stuck and asked the agent to find out.
    It turned out the app was fine; the test was wrong. The harness attached
    its message listener only after the connection had already opened, and
    Node's `EventEmitter` doesn't queue an event for a listener that isn't
    registered yet — so the first message, often the initial state push,
    arrived and was dropped before anything was listening, and the test hung
    waiting for a message that had already come and gone. Instead of
    retrying until it passed, we gave every test connection a message queue
    from the moment it opens, and wrote the rule into CLAUDE.md: anything
    that awaits before it starts listening to a socket needs a queue, not a
    one-shot listener. That changed how I read a green check — it only means
    something once I understand why it would have gone red.

2. What did this work change about who I want to be as a software developer?

    Honestly, the agent wrote most of the code this week. What was mine was
    directing it, reading what it produced, and checking that against the
    brief — deciding what the app is actually for, and noticing when
    something didn't match. I learned I also have to check what the agent
    writes about my own process, not just the code: a draft of this
    reflection described a UTC day boundary and a stone preview bug, events
    from some other project, and it had to be caught and rewritten using
    this repo's real history instead. Next time I want to understand a
    failure myself before I hand it to the agent.
