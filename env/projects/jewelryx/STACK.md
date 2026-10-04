# JewelryX: a worktree's stack

What `index.ts`'s `setup`, `serve` and `teardown` do for JewelryX ({{wf}}/process/LIFECYCLE.md
is the part every project shares).

Once per machine, from an **elevated** shell (it binds port 80): `portless service install --no-tls`
keeps the named worktree URLs below alive across reboots. Without it portless auto-starts its own
proxy on the first server launch (plain HTTP: the tether passes `PORTLESS_HTTPS=0`) but it dies with
that session.

Setup (pre-start, in parallel): `env` copies the files `.worktreeinclude` names from this machine's
`~/.config/wf/jewelryx/` (same paths; it stops, naming them, when one is missing), then rewrites
`packages/backend/.env`: production credentials blanked, media storage local, the database
the worktree's own. `node` installs and builds the shared packages, `verify` installs
`verification/`, `tools` runs the project's `scripts/link-tools.mjs`, `db` syncs python, makes
sure the dev stack's mongo is up and seeds the worktree's database in it.

Servers: post-start tethers b2b, backend and admin on the hashed port P: b2b P, backend P+10000,
admin P+20000 (`dev.ts`). Each child runs under `portless --name <slug>.<role>.jewelryx --app-port
<port>`, inside the tether's process tree (killing the tether frees all three hashed ports in
<10 s; `wt remove`'s background teardown lags behind that with or without portless — measured
9 min on 2026-09-22, both arms), giving the browser-facing names `http://<slug>.b2b.jewelryx.localhost`,
`http://<slug>.admin.jewelryx.localhost`, `http://<slug>.api.jewelryx.localhost` on the proxy's
port 80 (plain HTTP, `--no-tls`); the hashed ports stay the actual listeners underneath.
Server-side calls stay off the proxy: `INTERNAL_API_URL` is `http://127.0.0.1:<backend port>`
(uvicorn is IPv4-only). `wf status` probes b2b (the first app) on the hashed port but prints its
`.localhost` name. `PORTLESS=0` skips the proxy and serves the hashed ports directly (fallback when
the proxy is down); stale routes are cleared with `portless prune`.

A database per worktree, in one mongo: `jewelryx_<slug>` in the dev stack's `jewelryx-mongo-dev`
(`mongo.compose.yml`, on 40000+(P−10000) for dev's P; `index.ts` `sharedMongoUrl`). The `db` step
fills it with the project's fixture set (`packages/backend/scripts/seed_fixtures.py`). The env step
points `MONGODB_URL`/`DATABASE_NAME` at it, so no worktree shares dev's Atlas database or another
round's data. `wf seed [--reset]` seeds it again; `--reset` drops only that database. `wf stacks
down` leaves this mongo running. Until 2026-10-04 each worktree had a container of its own (Shay:
"too much"); reap still removes one from a worktree made before.

Teardown: the worktree's database is dropped (and a container of its own, when it has one), then
`portless prune`.
