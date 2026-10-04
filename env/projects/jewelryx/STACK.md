# JewelryX: a worktree's stack

What `index.ts`'s `setup`, `serve` and `teardown` do for JewelryX ({{wf}}/process/LIFECYCLE.md
is the part every project shares).

Once per machine, from an **elevated** shell (it binds port 80): `portless service install --no-tls`
keeps the named worktree URLs below alive across reboots. Without it portless auto-starts its own
proxy on the first server launch (plain HTTP: each server runs with `PORTLESS_HTTPS=0`) but it dies with
that session.

Setup (pre-start, in parallel): `env` copies the files `.worktreeinclude` names from this machine's
`~/.config/wf/jewelryx/` (same paths; it stops, naming them, when one is missing), then rewrites
`packages/backend/.env`: production credentials blanked, media storage local, the database
the worktree's own. `node` installs and builds the shared packages, `verify` installs
`verification/`, `tools` runs the project's `scripts/link-tools.mjs`, `db` syncs python, makes
sure the shared mongo is up and seeds the worktree's database in it.

Servers, when a phase starts them (`wf serve`; nothing serves a worktree from its creation since
2026-10-04): b2b, backend and admin on the hashed port P: b2b P, backend P+10000, admin P+20000
(the kit's `projects/jewelryx/dev.ts`). Each child runs under `portless --name <slug>.<role>.jewelryx
--app-port <port>`, inside `wf serve`'s process tree (reap stops that tree), giving the browser-facing names `http://<slug>.b2b.jewelryx.localhost`,
`http://<slug>.admin.jewelryx.localhost`, `http://<slug>.api.jewelryx.localhost` on the proxy's
port 80 (plain HTTP, `--no-tls`); the hashed ports stay the actual listeners underneath.
Server-side calls stay off the proxy: `INTERNAL_API_URL` is `http://127.0.0.1:<backend port>`
(uvicorn is IPv4-only). `wf status` probes b2b (the first app) on the hashed port but prints its
`.localhost` name. `PORTLESS=0` skips the proxy and serves the hashed ports directly (fallback when
the proxy is down); stale routes are cleared with `portless prune`.

A database per worktree, in one mongo: `jewelryx_<slug>` in `jewelryx-mongo-dev` (`mongo.compose.yml`,
on 40000+(P−10000) for dev's P; `index.ts` `sharedMongoUrl`), the permanent dev stack's until that
went (2026-10-04). The `db` step fills it with the project's fixture set
(`packages/backend/scripts/seed_fixtures.py`). The env step points `MONGODB_URL`/`DATABASE_NAME` at
it, so no worktree shares dev's Atlas database or another round's data. `wf seed [--reset]` seeds it
again; `--reset` drops only that database. Until 2026-10-04 each worktree had a container of its own
(Shay: "too much"); reap still removes one from a worktree made before.

Teardown: the worktree's database is dropped (and a container of its own, when it has one), then
`portless prune`.
