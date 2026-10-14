
## This project (JewelryX)

- `control-jewelryx …` runs this worktree's copy from anywhere inside it (wf puts a shim on PATH). If a shell still says not found, run `node docs/agents/verify-jewelryx/control-jewelryx.mjs …` from the worktree root.

- Files are repo-relative from the root: `packages/backend/…`, `packages/frontend/<app>/…`, `verification/…`.
- A verification case's `check` cell: a pytest file (`packages/backend/tests/test_x.py`), a vitest file
  (`vitest run packages/frontend/b2b/src/tests/x.test.ts`), or a spec under `verification/`.
- The T2 walk a class A round records in `TICKET.md` (generic build prompt), in the shape
  `process/AGREEMENT-TEMPLATE.md` defines:
  ```
  - **T2 walk.** open: <b2b|admin> /<path> [as <buyer|seller|admin>] [mobile]
    setup: api <control-jewelryx api function> <its JSON options on one line> as <buyer|seller|admin>
  ```
  One `setup:` per piece of data the scenario needs but the seed lacks (JX-1068: the build reset the
  database and T2 saw none of the round's necklaces). `wf show` replays a completed setup recipe once. If
  the round shows nothing, `none — <why no walk is needed>` instead.
- Keep live proof captures in `{{folder}}/proof/` as `after-<label>.png`, or `before-<label>.png`
  for a baseline. Rename a timestamped capture when keeping it: `wf step assess` refuses unnamed
  pictures, and T2/posting use those same names, including on class A rounds.
- For value/reset behavior, assert the input values and resulting range. An `aria-invalid`
  assertion measures the accessibility attribute, not whether valid input or empty-input reset works;
  keep it separate when that attribute is newly introduced.
- Visual promises need their visible state: focus/error rings need rendered evidence of clipping
  at the container edge, not only a class assertion. Capture the relevant certificate row for a
  certificate claim; for a range-filter claim, show the configured filter bounds and the outcome.
  Follow the feature recipe and `docs/agents/testing.md` for how to drive and measure that state.
- What a JewelryX test needs to know (login and OTP, Hebrew, visual symptoms in pixels, specs outside
  `verification/`): `docs/agents/testing.md`. Seed users and fixed ids: `docs/agents/seed.md`. Specs to
  copy from: `verification/`. Pytest: `packages/backend/tests/`.
- A repro or spec red for a reason you cannot see, a 500, a blank screen: run `control-jewelryx errors`
  before guessing. It prints what the stack logged since it last looked: failed requests, a 500's
  traceback, SvelteKit server errors, the browser's console errors. On a base without it, the same lines
  are in `.wf/logs/dev.log`.
- On a `fix/*` or `feat/*` branch add nothing under `verification/` or `JewelryX-Tools/`: the repo's
  lefthook `oracle-guard` fails the push, and `wf check` refuses it.
- When verification exposes reusable setup knowledge or a harness defect, update the existing
  project verification asset within the round's scope and rerun the affected check. Preserve only
  what you verified, not every exploratory step. If the update is out of scope or protected, record
  the exact path, needed change and rerun command in the round's existing notes instead.
- Earlier rounds are in `bug-reports/<slug>/`; decision records in `verification/decisions/`. Tell
  `codebase-locator` to read `docs/agents/layout.md` first.
