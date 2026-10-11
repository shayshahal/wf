
## This project (JewelryX)

- Files are repo-relative from the root: `packages/backend/…`, `packages/frontend/<app>/…`, `verification/…`.
- A verification case's `check` cell: a pytest file (`packages/backend/tests/test_x.py`), a vitest file
  (`vitest run packages/frontend/b2b/src/tests/x.test.ts`), or a spec under `verification/`.
- What a JewelryX test needs to know (login and OTP, Hebrew, visual symptoms in pixels, specs outside
  `verification/`): `docs/agents/testing.md`. Seed users and fixed ids: `docs/agents/seed.md`. Specs to
  copy from: `verification/`. Pytest: `packages/backend/tests/`.
- A repro or spec red for a reason you cannot see, a 500, a blank screen: run `control-jewelryx errors`
  before guessing. It prints what the stack logged since it last looked: failed requests, a 500's
  traceback, SvelteKit server errors, the browser's console errors. On a base without it, the same lines
  are in `.wf/logs/dev.log`.
- On a `fix/*` or `feat/*` branch add nothing under `verification/` or `JewelryX-Tools/`: the repo's
  lefthook `oracle-guard` fails the push, and `wf check` refuses it.
- Earlier rounds are in `bug-reports/<slug>/`; decision records in `verification/decisions/`. Tell
  `codebase-locator` to read `docs/agents/layout.md` first.
