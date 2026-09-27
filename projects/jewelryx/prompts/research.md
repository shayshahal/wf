
## This project (JewelryX)

- This round's stack, direct ports: use these in specs and configs. B2B `{{b2b}}` (app under `/b2b`),
  API `{{api}}`, Admin `{{admin}}` (under `/admin`). `wf status` prints the named URLs, for a browser.
- Drive the app through the verification skill, `docs/agents/verify-jewelryx/SKILL.md`, when this
  worktree has it: read its `features/README.md` and the feature file that matches the ticket, run
  `control-jewelryx doctor` first, and log in and open pages with `control-jewelryx`. Explore the page
  it opened with plain `playwright-cli` (same browser, no `-s=`). The repro's config logs the roles in
  before the tests run; a spec starts logged in with `test.use({ storageState: ... })` (the comment in
  the config) and holds no login code. A feature file that disagrees with the screen: one line under
  `## Could not find`, starting `map drift:`, naming the file and what the screen showed instead.
- Without that skill, the browser is `playwright-cli`: commands and why in `docs/agents/testing.md`,
  *Exploring a page before writing a spec*.
- What a JewelryX test needs to know (login and OTP, Hebrew, visual symptoms in pixels, specs outside
  `verification/`): `docs/agents/testing.md`. Seed users and fixed ids: `docs/agents/seed.md`. Specs
  to copy from: `verification/`. Pytest: `packages/backend/tests/`.
- The repro is spec files in `{{folder}}/repro/`, nothing else: its config is the verification skill's
  (`docs/agents/verify-jewelryx/repro.config.ts`, it logs the roles in and knows the stack). It sits
  outside `verification/`, which limits what a spec may import (`docs/agents/testing.md`). Its command:
  `pnpm --dir verification exec playwright test -c ../docs/agents/verify-jewelryx/repro.config.ts ../{{folder}}/repro`.
  A base without that config: `wf new` wrote `{{folder}}/repro/playwright.config.ts`; the command is then
  `pnpm --dir verification exec playwright test -c ../{{folder}}/repro/playwright.config.ts`.
- Earlier rounds are in `bug-reports/<slug>/`; decision records in `verification/decisions/`. Tell
  `codebase-locator` to read `docs/agents/layout.md` first.
