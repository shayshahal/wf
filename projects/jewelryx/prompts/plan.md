
## This project (JewelryX)

- Files are repo-relative from the root: `packages/backend/…`, `packages/frontend/<app>/…`, `verification/…`.
- A check cell's test path: a pytest file (`packages/backend/tests/test_x.py`), a vitest file
  (`vitest run packages/frontend/b2b/src/tests/x.test.ts`), or a spec under `verification/`.
- The `## T2 walk` `open:` line is exactly `open: <b2b|admin> </path under the app> as <buyer|seller|admin> [mobile]`:
  `wf show` parses it and opens that page, logged in. The path is the page itself: seed ids are fixed
  (docs/agents/seed.md), so a seed product's variants page is `/inventory/<its id>/variants`, not `/inventory`
  (BJEW-562, 2026-09-27: T2 opened the list).
- A `setup:` line is exactly `setup: api <sdk function> <its JSON options, one line> as <buyer|seller|admin>`: one
  `control-jewelryx api` call, the one the repro's precondition makes (a shared variant on that product, say).
- On a `fix/*` or `feat/*` branch no row lists a file under `verification/` or `JewelryX-Tools/`: the repo's lefthook
  `oracle-guard` fails the push of any such branch, and `wf next` sends a plan that lists one back to you
  (BJEW-617, 2026-10-06: row 1 edited a verification spec, and row 2's `wf check` was the first to say it could never pass).
  Coverage for it lands via bugs-to-tests / cr-to-tests on a `verification/*` branch: list it under `## Not doing`.
