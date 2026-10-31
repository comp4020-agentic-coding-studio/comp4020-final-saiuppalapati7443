# Final marker pass — testing the live deployment as a marker would

Run against `https://comp4020-final-saiuppalapati7443.fly.dev` on
2026-10-31/2026-11-01 (Canberra). Tool: Playwright, separate `BrowserContext`
per "session" (no shared cookies or storage between contexts, same as
separate Chrome profiles).

**Marking viewports**, from the course assessment page
(`https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/topics/assessment/`,
under "Marking environment"): **Desktop 1920×1080**, **Phone 390×844** (the
iPhone preset in Chrome DevTools' device toolbar). "Those are viewports, not
monitor sizes." Both are full marking environments.

**Live drops added by this pass: 34 total** (pile went from 123 stones,
baseline before testing, to 157 after). Every drop on the live site is
permanent — stones can't be deleted — so each step below used the fewest
drops its check actually needed, reusing sessions/cookies across steps
wherever the check allowed it. Breakdown:

| Step | Drops added |
| --- | --- |
| 2+3 (combined: two viewports, simultaneous drop) | 2 |
| 4 (slow/offline recovery — one fresh visitor drops while the viewer is offline) | 1 |
| 5 (resize) | 0 (reused existing stones) |
| 6 (keyboard-only placement) | 1 |
| 7 (cold start) | 0 (reused step 2's cookies/stones) |
| 8 (tab left open through a second restart) | 0 (reused step 7's open tab) |
| 9 (`pnpm test` against live) | 20 |
| 10 (25 sessions, 10 drop) | 10 |
| **Total** | **34** |

## Results

### 1. Start at `/readme/`: everything a newcomer needs, obvious link to the app?

**FAIL → fixed, re-verified PASS.** `/readme/`'s rendered page had no link
back to `/` — the only links were the two essays README cites (Robin Sloan,
Ink & Switch). Confirmed with both a mouse-visible link scan and a
keyboard-only Tab walk from the top of `/readme/`: Tab reached exactly those
two external links, then left the document — no way back to the app, by
mouse or keyboard, short of editing the URL by hand.

Everything else a newcomer needs *is* there: the README's own content
(what Cairn is, why no accounts, the three checked properties, what wasn't
built) renders in full at `/readme/`.

Fixed in `readmePage()`'s wrapper HTML in `src/server.ts` (a "← Back to
Cairn" link above `<main class="readme">`) — not in README.md's content,
since README.md has no reason to link to the site it's hosted on. A failing
test was added first (`spec/invariants.test.ts`), confirmed red, then the
fix, confirmed green, then redeployed and re-verified live:

```
Links on /readme/ (after fix): ["← Back to Cairn" → /, "An App Can Be a
Home-Cooked Meal" → robinsloan.com, "Local-first software" → inkandswitch.com]
Tab order from /readme/ (after fix): "← Back to Cairn" is the first stop.
```

Screenshot: `docs/screenshots/marker-run/step1-readme-after-fix-1920.png`.

Commit: `03954e2`.

### 2. Two people, one at each viewport — drop, other sees it within 1s, same relative spot

**PASS.** Two fresh contexts (desktop 1920×1080, phone 390×844), both drop
near-simultaneously. Both sessions saw *both* new stones within **87–95ms**
of the drops firing — well under the 1-second promise. Both sessions ended
with the identical set of 125 stone ids (123 baseline + 2 new).

```json
{
  "desktopSawBothDelayMs": 87,
  "phoneSawBothDelayMs": 95,
  "desktopCountAfter": 125,
  "phoneCountAfter": 125,
  "desktopIdsEqualPhoneIds": true
}
```

Screenshots: `docs/screenshots/marker-run/step2-desktop-1920.png`,
`step2-phone-390.png` — both show the identical pile shape at each viewport.

### 3. Both drop within the same second — both stored, screens end up identical

**PASS.** Same run as step 2 (the two drops were fired via `Promise.all`
with no sequential delay between them — genuinely within the same second).
Both stones landed, both persisted, both sessions converged on the same 125-
stone pile with matching stone ids (see step 2's data above).

### 4. Slow connection: Slow 3G throttle, then 15s fully offline, then recover

**PASS.** One phone-viewport session throttled to Slow 3G (Chrome DevTools'
own numbers: 400kbps up/down, 400ms RTT) — page stayed usable
(`aria-disabled: null` on the carry stone). Then taken fully offline (CDP
`Network.emulateNetworkConditions({offline: true})` + forcing the existing
socket closed, matching what a real dropped connection looks like from
`client.js`'s perspective) for **15 seconds**. While offline, a different,
fresh visitor dropped a stone elsewhere. On reconnect:

```json
{
  "beforeCount": 125,
  "countAfterDropWhileOffline": 126,
  "viewerFinalCount": 126,
  "duplicates": [],
  "viewerSawDroppedStone": true
}
```

- Showed "Reconnecting…" and disabled the carry stone the instant it went
  offline.
- Caught up automatically on reconnect (no reload) — the stone dropped by
  the other visitor while offline appeared.
- Zero duplicate `.stone` elements.
- No lost or phantom drops: count went from 125 → 126, matching exactly one
  real drop.
- Hint text and carry-stone state both returned to normal once back online.

Screenshots: `docs/screenshots/marker-run/step4-offline-390.png` (showing
"Reconnecting…" at 125 stones), `step4-recovered-390.png` (showing recovery
at 126 stones, carry stone active again).

### 5. Resize mid-use at each viewport: pile keeps its shape

**PASS.** Loaded at 390×844, recorded every stone's fractional position,
resized live to 1920×1080, recorded again: max deviation 0.0005 (x) / 0.0018
(y) — effectively zero, well within the tolerance of a true "same shape."
Repeated in the other direction (1920×1080 → 390×844): identical result. No
stone's id went missing after either resize.

```json
[
  { "label": "phone-to-desktop", "stoneCount": 126, "missing": 0, "maxDiffX": 0.00053, "maxDiffY": 0.00181 },
  { "label": "desktop-to-phone", "stoneCount": 126, "missing": 0, "maxDiffX": 0.00053, "maxDiffY": 0.00181 }
]
```

Screenshot: `docs/screenshots/marker-run/step5-phone-to-desktop-after-resize.png`.

### 6. Keyboard only, from `/readme/` through placing a stone

**PASS for the on-app flow; reconfirms step 1's finding for the `/readme/` → app hop.**
Tab-walking from `/readme/` (before the step 1 fix) reached only the two
external essay links, then nothing — no keyboard path to the app from
`/readme/` existed until the step 1 fix landed. From `/` itself, Tab order
was clean and fully keyboard-operable: "About this app" → `#cairn` (a
scrollable region, natively tab-focusable as a side effect of the stacking
work's `overflow-y: auto` — benign, lets a keyboard user scroll a tall pile)
→ `#carry-stone`. Pressing Enter on the focused carry stone dropped a stone
successfully:

```json
{
  "beforeCount": 126,
  "afterCount": 127,
  "hint": "You've placed your stone for today — come back tomorrow.",
  "disabled": "true",
  "reachedCarryStone": true
}
```

Screenshot: `docs/screenshots/marker-run/step6-keyboard-drop-1920.png` (shows
the focus ring on the carry stone and the correct "placed today" state).

### 7. Next day: `flyctl machine stop`, wait, reopen with each person's cookies

**PASS.** Ran `mise exec -- flyctl machine stop 8111d56c9430d8 -a
comp4020-final-saiuppalapati7443`, confirmed `state: stopped` via `flyctl
status`, waited ~70 seconds, then reopened step 2's two saved cookie jars
(`storageState` from Playwright, one per viewport).

**Cold-start time recorded:** page load (navigation → DOM content loaded)
**3935ms**; stones fully rendered **4121ms** after the request was sent — the
machine's `auto_start_machines` boot cost, visible as the one-time delay on
the first request after a stop.

```json
{
  "coldStartDesktopLoadMs": 3935,
  "coldStartDesktopStonesRenderedMs": 4121,
  "desktopCount": 127,
  "phoneCount": 127,
  "desktopHint": "You've placed your stone for today — come back tomorrow.",
  "phoneHint": "You've placed your stone for today — come back tomorrow.",
  "desktopMineCount": 1,
  "phoneMineCount": 1
}
```

Both sessions' stones were still there (127 total, sqlite survived the
stop/start), each still marked `mine` (the white outline ring) for its own
cookie, and both correctly told they'd already placed today's stone — the
Canberra day hadn't changed between the drop and the restart, so this
exercised the "already placed" branch rather than the "day changed, can
place again" branch (both are already covered by
`spec/canberra-date.test.ts` and `spec/cairn.test.ts`'s day-boundary tests;
this step additionally confirms it holds true across a real stop/start on
the actual deployed machine, not just in an isolated spec server).

Screenshots: `docs/screenshots/marker-run/step7-coldstart-desktop-1920.png`,
`step7-coldstart-phone-390.png`.

### 8. A tab left open while the machine restarts: recovers on its own, no duplicates

**PASS.** Reused step 7's still-open desktop tab. Stopped the machine again,
waited 20s, started it again, forced the existing socket closed (same
technique as step 4, simulating what losing the backing machine looks like
from the client's perspective). The open tab:

```json
{
  "beforeRestartCount": 127,
  "afterRestartCount": 127,
  "duplicates": [],
  "noDuplicates": true,
  "noLostOrPhantomDrops": true
}
```

Recovered on its own — no `page.reload()` anywhere in this script — with the
exact same stone count before and after (127 = 127) and zero duplicate
`.stone` elements.

Screenshot: `docs/screenshots/marker-run/step8-recovered-after-open-tab-restart-1920.png`.

### 9. `APP_URL=https://comp4020-final-saiuppalapati7443.fly.dev pnpm test`

**PASS.** All 9 spec files, 27 tests passed against the live deployment
(real TLS handshakes to `syd`, ~38s total — compare to ~45s locally, so no
meaningful latency penalty despite being a real network round trip).

```
Test Files  9 passed (9)
     Tests  27 passed (27)
  Duration  37.78s
```

This added 20 real drops (verified by checking the stone count before/after:
127 → 147) — every real (non-malformed) drop `cairn.test.ts`,
`connection-status.browser.test.ts`, and `reconnect.browser.test.ts` make
against the shared `APP_URL`. The other 6 spec files (`persistence.test.ts`,
`logging.test.ts`, `canberra-date.test.ts`, `pile-size.test.ts`,
`pile-layout.browser.test.ts`) each spawn their own isolated server and
never touch `APP_URL`, so they added zero drops to the live pile.

### 10. Room test: 25 sessions, 10 drop within the same few seconds

**PASS.** 25 separate `BrowserContext`s (alternating 1920×1080/390×844
viewports), opened and fully rendered in **4944ms**. 10 of them dropped,
fired via `Promise.all` — all 10 `mouse.up()` calls landed within **461ms**
of each other. All 25 sessions converged on the identical 157-stone pile
(147 baseline + 10 new) within **534ms** of the drops firing — no slow or
missing broadcasts, no divergence between any of the 25 sessions.

```json
{
  "sessionCount": 25,
  "dropperCount": 10,
  "beforeCount": 147,
  "afterCountPerSession": [157, 157, "...all 25 identical..."],
  "allSessionsIdenticalPile": true,
  "totalOpenAndRenderMs": 4944,
  "dropsFiredWithinMs": 461,
  "convergenceMs": 534
}
```

**Memory** (`mise exec -- flyctl ssh console ... "cat /proc/603/status"`,
immediately after the 25-session/10-drop load):

```
VmRSS: 97380 kB   (~97.4 MB)
```

Machine's own `/proc/meminfo` before vs. after the load (`MemAvailable`):
~128.2MB before, ~127.6MB after — no meaningful change, no memory pressure.
The machine is a `shared-cpu-1x`, 256MB (`flyctl status` / `fly.toml`); the
Node process's actual RSS (97.4MB) leaves well over half the machine's
budget free even under this load. No OOM events in `flyctl machine status`'s
event log (`oom_killed=false` on every stop/start recorded during this pass).

Screenshot: `docs/screenshots/marker-run/step10-room-test-session0-1920.png`
(shows the live pile at 157 stones from one of the 25 sessions — a visually
tall, narrow column, since the room test's drops clustered at similar `x`
positions; still a single correctly-stacked pile, not a bug).

## Summary

| Step | Result |
| --- | --- |
| 1. `/readme/` has everything + obvious app link | FAIL → fixed (`03954e2`) → PASS |
| 2. Two viewports, drop seen within 1s, same spot | PASS (87–95ms) |
| 3. Simultaneous drops, identical final state | PASS |
| 4. Slow 3G → 15s offline → recover | PASS |
| 5. Resize mid-use, pile keeps shape | PASS |
| 6. Keyboard-only placement | PASS (on `/`; `/readme/` part covered by #1's fix) |
| 7. Cold start after `flyctl machine stop` | PASS (cold start: load 3935ms, stones rendered 4121ms) |
| 8. Open tab survives a second restart | PASS |
| 9. `pnpm test` against live | PASS (9 files, 27 tests) |
| 10. 25 sessions, 10 concurrent drops | PASS (534ms convergence, 97.4MB RSS) |

One FAIL found and fixed this pass: `/readme/` had no link back to the app.
Fixed in commit `03954e2`, with a new regression test
(`spec/invariants.test.ts`) and a dated `CLAUDE.md` correction, redeployed,
and re-verified live.
