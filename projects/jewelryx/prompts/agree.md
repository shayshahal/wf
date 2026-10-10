
## This project (JewelryX)

- This round's stack, direct ports: use these in specs and configs. B2B `{{b2b}}` (app under `/b2b`),
  API `{{api}}`, Admin `{{admin}}` (under `/admin`). `wf status` prints the named URLs, for a browser.
- Drive the app through the verification skill, `docs/agents/verify-jewelryx/SKILL.md`, when this
  worktree has it: read its `features/README.md` and the feature file that matches the ticket, run
  `control-jewelryx doctor` first, and log in and open pages with `control-jewelryx`.
- Files are repo-relative from the root: `packages/backend/…`, `packages/frontend/<app>/…`, `verification/…`.
- A verification case's `check` cell: a pytest file (`packages/backend/tests/test_x.py`), a vitest file
  (`vitest run packages/frontend/b2b/src/tests/x.test.ts`), or a spec under `verification/`.
- The `## T2 walk` `open:` line is exactly `open: <b2b|admin> </path under the app> as <buyer|seller|admin> [mobile]`:
  `wf show` parses it and opens that page, logged in. The path is the page itself: seed ids are fixed
  (docs/agents/seed.md), so a seed product's variants page is `/inventory/<its id>/variants`, not `/inventory`.
- A `setup:` line is exactly `setup: api <sdk function> <its JSON options, one line> as <buyer|seller|admin>`.
- The repro is spec files in `{{folder}}/repro/`, nothing else. Its command: the verification skill's
  `docs/agents/verify-jewelryx/repro.config.ts`, else `{{folder}}/repro/playwright.config.ts`.
  `## Repro` carries `command: pnpm --dir verification exec playwright test -c ../<that config> ../{{folder}}/repro`.
- On a `fix/*` or `feat/*` branch no case lists a file under `verification/` or `JewelryX-Tools/`: the
  repo's lefthook `oracle-guard` fails the push of any such branch, and `wf check` refuses it
  (BJEW-617, 2026-10-06). Coverage for it lands via bugs-to-tests / cr-to-tests on a `verification/*`
  branch: list it under `## Agreed`'s exclusions.
- A Figma frame the ticket links (`figma.com/design/<file key>/...?node-id=<a>-<b>`): read it with the
  Figma tool, `get_figma_data` with that `fileKey` and `nodeId` `<a>:<b>`, and write the sizes, spacing
  and order it gives the element the ticket names under `## Observed` as the expected values, citing the
  node. A Figma screenshot is not a measure (BJEW-602). A ticket that refers to the Figma without a link
  gets one line under `## Observed`, never a frame you picked.
