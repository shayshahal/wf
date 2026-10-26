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

For UI work with a Figma frame, read `design/JewelryX.fig` with figlens (`docs/agents/design.md`),
never the Figma MCP, API or browser. Take numbers from figlens `inspect`/`nodes`, icons from its
`export`, and follow `docs/figma-pixel-parity-playbook.md`; compare the running page with the frame's
figlens render and record the node ID with the proof.

For frontend type checks, run the affected package's `pnpm --filter <package-name> check:fast`,
not a bare `svelte-check`: the package script prepares paraglide and `.svelte-kit` output first.
Missing generated output is an environment failure (`NOT MEASURED`), not evidence of a product
failure. Restore prep and rerun before interpreting the diagnostics.

For T2, record the live recipe in the working document:
```
- **T2 walk.** open: <b2b|admin> /<path> as <buyer|seller|admin> [mobile]
  setup: api <SDK function> <one-line JSON options> as <buyer|seller|admin>
```
Use a setup line for each state the seed lacks. For scenarios beyond SDK calls, record explicit argv:
```
  ready: script ["node","<round>/scenario.mjs","ready"]
  reset: script ["node","<round>/scenario.mjs","reset"]
  setup: script ["node","<round>/scenario.mjs","prepare"]
```
`ready` must read back the actual scenario (including intended values/counts), exit zero only when
it is present, exit one for absent/incorrect state, and exit two or greater for an unavailable
service or failed read. Make no changes in readback; unavailable reads stop without reset.
`wf show` checks it every time, including after setup. A failed readback runs the admitted reset and setup in order; a repeated show of a ready scenario writes
nothing. A `ready:` readback is required for every setup/reset recipe, including existing API recipes;
text-only completion tokens are ignored because they cannot detect external resets. Scripts must
be idempotent and recover from partial execution; reset restores the entire round-owned scenario, not just helper files, and must never touch shared data. Use the same script
commands during build and assessment, including reset after verification. Commands run from the
worktree root without a shell; use `uv` argv for Python if needed. Only record operations authorized
for this round; a recipe does not grant broader database or external-service authority.
For nonvisual work, write `none — <reason>`. Keep useful named before/after captures under `{{folder}}/proof/`.

Product branches (`fix/*`, `feat/*`) cannot edit `verification/` or `JewelryX-Tools/`.
If verification needs a protected-asset change, record the exact path, needed change and rerun
command for the authorized verification-branch work; do not weaken the test or fix it silently.
