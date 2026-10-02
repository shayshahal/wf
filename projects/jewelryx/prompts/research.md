
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
- A Figma frame the ticket links (`figma.com/design/<file key>/...?node-id=<a>-<b>`): read it with the
  Figma tool, `get_figma_data` with that `fileKey` and `nodeId` `<a>:<b>` (under pi, from a `codemode`
  script), and write the sizes, spacing and order it gives the element the ticket names under
  `## Diverges at`, as the expected values, citing the node. A Figma screenshot is not a measure:
  BJEW-602 had one, and T2 corrected the spacing twice (2026-09-28). The storefront's frames are not
  named by screen: a ticket that refers to the Figma without a link gets one line under
  `## Could not find`, never a frame you picked.
- A screenshot of each screen the ticket is about, as it is on this checkout (the base: nothing is
  fixed yet): `control-jewelryx screenshot --name before-<n>` on the view that shows it, `n` from 1,
  then move the file to `{{folder}}/proof/before-<n>.png`. Validate takes `after-<n>` of the same view
  once the fix is in, and T2 shows them side by side. Add to `RESEARCH.md`, after `## Repro`:
  `## Before`, one line per picture: `` `proof/before-<n>.png` — <role> on <page path>: <the clicks
  from there, and what the picture shows> ``. Validate follows that line, so name what it needs.
- A blank screen, a 500, a repro red for a reason you cannot see: run `control-jewelryx errors`
  before guessing. It prints what the stack logged since it last looked: failed requests, a 500's
  traceback, SvelteKit server errors, the browser's console errors (`open`, `login` and `api` print
  them by themselves). On a base without it, the same lines are in `.wf/logs/dev.log`.
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
