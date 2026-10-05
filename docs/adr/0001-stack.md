# ADR 0001: Stack — plain Node, `node:sqlite`, `ws`, no framework

## Context

The brief fixes three properties (multi-user, real-time, persistent) and one
deploy shape (one Fly machine, one volume at `/data`, 256MB of memory). It
leaves the stack entirely open. The app itself — Cairn — is small: visitors
drop a stone on a shared pile and watch it land for everyone, live. There is no
offline requirement, no document editing, no large dataset.

Robin Sloan's *An App Can Be a Home-Cooked Meal* argues for software sized to
its actual audience rather than defaulting to "professional, scalable"
infrastructure. Cairn's audience is a crit room, not the public internet at
scale, and the 256MB/one-machine constraint agrees with that framing: the
honest move is to pick the smallest stack that actually satisfies the three
fixed properties, not the most impressive one.

Ink & Switch's *Local-first software* essay was read for the opposite reason.
It argues for CRDT-based, offline-capable, eventually-decentralized apps so a
user's data outlives any one server. That's a real and well-argued position,
and it was considered — a CRDT (e.g. Automerge) would make "many people editing
at once" trivially consistent. It was **not** taken: Cairn has no offline mode,
no per-client replica to reconcile, and a single authoritative server is
simpler to build, test and reason about than a merge algorithm for a feature
this small. A CRDT here would be solving a problem Cairn doesn't have.

## Options considered

- **Framework (Express/Fastify) + a hosted/managed database.** Rejected: adds
  a dependency and an operational surface (connection strings, a second
  service) that the single-machine/single-volume deploy shape doesn't need or
  reward.
- **Local-first (Automerge/CRDT) + sync server.** Rejected per above — real
  complexity for a property (offline editing) Cairn doesn't claim.
- **Plain `node:http` + `node:sqlite` + `ws`.** Chosen.

## Decision

- **Runtime:** Node 24 (already pinned in `mise.toml`), running `.ts` source
  directly — confirmed in this environment that Node 24 type-strips and runs a
  `.ts` file with no loader or build step. So there is no `tsc`/`tsx`/`ts-node`
  dependency anywhere, in dev or in the image; `node src/server.ts` is the
  entire run command. The cost: a few TypeScript constructs Node's stripper
  can't erase (enums, namespaces, constructor parameter-property shorthand)
  are off the table. None of them are needed here.
- **HTTP:** `node:http` directly, with a small hand-written static file map for
  `public/` — no `express`/`serve-static`, because the whole route table is
  four routes.
- **Persistence:** `node:sqlite` (`DatabaseSync`), built into Node 24, no extra
  dependency. The file lives at `${DATA_DIR}/cairn.db`; the Dockerfile sets
  `DATA_DIR=/data` (the mounted volume), so a restart or redeploy reopens the
  same file. Locally `DATA_DIR` is unset and falls back to `./.data`
  (gitignored), so dev never touches a root-owned `/data`.
- **Real-time transport:** WebSockets (the `ws` package — the one dependency
  this app has). Chosen over SSE or polling because drops flow both ways
  (client → server to record, server → every client to broadcast); SSE is
  one-way and would need a second channel for the client→server half, and
  polling "fast enough" to hit sub-second latency is just a worse-fitting
  WebSocket. A single persistent connection per visitor is cheap at crit-room
  scale.
- **Frontend:** vanilla HTML/CSS/JS in `public/`, no framework, no bundler —
  nothing here needs component state management or a build pipeline.

## Consequences

- The image is tiny and the deploy has no build stage: copy `src/`, `public/`,
  `package.json`, `pnpm-lock.yaml`, `README.md`, run `pnpm install --prod`, run
  `node src/server.ts`.
- No horizontal scaling story — one `node:sqlite` file on one volume means one
  writer. That's fine at `shared-cpu-1x`/256MB and is the same one-machine
  shape `fly.toml` already commits to.
- If Cairn ever needed to work offline or merge concurrent edits to the *same*
  record (not just append new ones), this decision would need revisiting
  toward something like Ink & Switch's approach. Appending stones to a shared
  pile never conflicts, so that need hasn't arisen.
