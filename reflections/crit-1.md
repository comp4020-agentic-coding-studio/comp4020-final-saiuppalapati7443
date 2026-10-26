# Crit 1 reflection

## What was the breakthrough that moved the work forward?

I wrote the harness before any page. The first commit was CLAUDE.md: the topic, the GeoCities rules written as things that can be checked, and a hard "no JavaScript" line. The real breakthrough came from the checks, not the harness. The agent found two bugs I would not have seen by looking: an aria-label on a paragraph that the validator rejected, and a marquee that made the home page wider than a phone because the table layout was auto. The page looked fine at desktop. So "looks right" and "is right" are different tests, and the era look makes that worse, because broken-looking is the style. My own correction was about grounding: the sightings page read like other people's guestbook posts, so I made every voice on the site mine and added that as a rule in the harness. I built it first as its own site, then moved it into my final project app at /forgotten-web/ for the Week 12 crit.

## What did this work change about who I want to be as a software developer?

I want to be the developer who decides the rules first and then lets the checks argue with me. A nostalgic site is easy to fake. Making it valid, readable on a phone and honest about whose words are on it took decisions only I could make, and checks only the agent would run every time.
