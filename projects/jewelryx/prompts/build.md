## This project (JewelryX)

Read `docs/agents/testing.md` and the worktree's verification skill
(`docs/agents/verify-jewelryx/SKILL.md`) for commands, login, scenario helpers and captures.
Use the matching feature recipe; seed users and fixed IDs live in `docs/agents/seed.md`.
`control-jewelryx …` runs the worktree's copy; fallback:
`node docs/agents/verify-jewelryx/control-jewelryx.mjs …` from its root.

Use project setup/reset tools to reach and restore the scenario. This checkout's stack and its own
`jewelryx_<round>` database are the round's: creating the data a case needs is ordinary work there,
and `wf seed` puts the fixtures back (`--reset` after a run dirties them). On an unexplained failed
request, 500 or blank screen, inspect `control-jewelryx errors` (or `.wf/logs/dev.log`) before
guessing.
Measure the promised behavior, not just a new CSS/accessibility attribute.

For frontend type checks, run the affected package's `pnpm --filter <package-name> check:fast`,
not a bare `svelte-check`: the package script prepares paraglide and `.svelte-kit` output first.
Missing generated output is an environment failure (`NOT MEASURED`), not evidence of a product
failure. Restore prep and rerun before interpreting the diagnostics.

For T2, record the live recipe in the working document:
```
- **T2 walk.** open: <b2b|admin> /<path> as <buyer|seller|admin> [mobile]
  setup: api <SDK function> <one-line JSON options> as <buyer|seller|admin>
```
Use a setup line for each state the seed lacks; `wf show` replays the recipe. For nonvisual work,
write `none — <reason>`. Keep useful named before/after captures under `{{folder}}/proof/`.

Product branches (`fix/*`, `feat/*`) cannot edit `verification/` or `JewelryX-Tools/`.
If verification needs a protected-asset change, record the exact path, needed change and rerun
command for the authorized verification-branch work; do not weaken the test or fix it silently.
