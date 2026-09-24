
## This project (JewelryX)

- This round's stack, direct ports: use these in specs and configs. B2B `{{b2b}}` (app under `/b2b`),
  API `{{api}}`, Admin `{{admin}}` (under `/admin`). `wf status` prints the named URLs, for a browser.
- The browser is `playwright-cli`: commands and why in `docs/agents/testing.md`, *Exploring a page
  before writing a spec*.
- What a JewelryX test needs to know (login and OTP, Hebrew, visual symptoms in pixels, specs outside
  `verification/`): `docs/agents/testing.md`. Seed users and fixed ids: `docs/agents/seed.md`. Specs
  to copy from: `verification/`. Pytest: `packages/backend/tests/`.
- The repro starts from `{{folder}}/repro/playwright.config.ts`. It sits outside `verification/`, which
  limits what it may import (`docs/agents/testing.md`). Its command:
  `pnpm --dir verification exec playwright test -c ../{{folder}}/repro/playwright.config.ts`.
- Earlier rounds are in `bug-reports/<slug>/`; decision records in `verification/decisions/`. Tell
  `codebase-locator` to read `docs/agents/layout.md` first.
