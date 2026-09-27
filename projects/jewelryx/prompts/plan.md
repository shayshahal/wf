
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
