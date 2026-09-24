# Worktree lifecycle

Run `pnpm wf …` from a worktree (`wf-runtime`, `dev`), never from the bare root — it has
no `package.json`. The worktree hooks are wf's, not the project's: `wf hook install` writes them
into worktrunk's user config for this project only (`hook.mjs`); run it again after changing
`hook.mjs`. User hooks need no approval. Once per machine, from an **elevated** shell
(it binds port 80): `portless service install --no-tls` keeps the named worktree URLs below alive
across reboots. Without it portless auto-starts its own proxy on the first server launch (plain
HTTP: the tether passes `PORTLESS_HTTPS=0`) but it dies with that session.

Create worktrees only via `wf new <branch> [--base <ref>] [--class B|C] [--id <token>]...`
(default base `origin/dev`) — it runs `wt switch --create --base --no-hooks`, then wf's own
pre/post-start hooks (`wt hook <type> user:`), whichever folder it runs from; raw `git worktree add`
skips the server) then `wf step classify`. `--id BJEW-nnn --id <item id>`
refuses to cut the worktree when a `bug-reports/` folder or a commit already names the id — read
that first. `--class B|C` asserts the class at creation: a design-first round has no code to
measure, and `wf step classify` only ever upgrades (A→B→C), never downgrades.

Servers: post-start tethers b2b, backend and admin on one hashed
port P (`{{ branch | hash_port }}`, 10000–19999): b2b P, backend
P+10000, admin P+20000. Each child runs under
`portless --name <slug>.<role>.jewelryx --app-port <port>`, inside the
tether's process tree (killing the tether frees all three hashed ports in
<10 s; `wt remove`'s background teardown lags behind that with or without
portless — measured 9 min on 2026-09-22, both arms), giving the
browser-facing names `http://<slug>.b2b.jewelryx.localhost`,
`http://<slug>.admin.jewelryx.localhost`, `http://<slug>.api.jewelryx.localhost`
on the proxy's port 80 (plain HTTP, `--no-tls`); the hashed ports stay the
actual listeners underneath. Server-side calls stay off the proxy:
`INTERNAL_API_URL` is `http://127.0.0.1:<backend port>` (uvicorn is
IPv4-only). `wf status` probes b2b on the hashed port but prints the
`.localhost` name (`b2b http://<slug>.b2b.jewelryx.localhost ✓|✗`,
1 s HEAD); `wf review` restarts a dead tether. `PORTLESS=0` skips the
proxy and serves the hashed ports directly (fallback when the proxy is
down); stale routes are cleared with `portless prune`.

DB per worktree: `stack/mongo.compose.yml` starts
`jewelryx-mongo-<slug>` on 40000+(P−10000) (see
`worktree.mjs`); the pre-start `db` step (`stack/db.mjs`) brings it
up and fills it with the project's fixture set
(`packages/backend/scripts/seed_fixtures.py`). The env step points
`MONGODB_URL`/`DATABASE_NAME` (`jewelryx_<slug>`) at it, so no
worktree ever shares dev's Atlas database.

Reap gate: `wt remove` runs a pre-remove hook that refuses
unless `.wf/state.json` says `step: "merged"`. Override with
`WF_FORCE_REAP=1`. Worktrees that never entered the workflow (no
state file) are removable. Post-remove drops the mongo container,
its volume and network, and prunes dead portless routes. `wf archive-round` is the only normal caller of
`wt remove`.

One round is one PR to `dev`: CI runs on it, review approves it,
it merges as a single squash. After the merge `wf archive-round`
(Task 16, not yet) keeps the posted Monday copy and archives the
rest — only then does the reap gate open.
