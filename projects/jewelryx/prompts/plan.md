
## This project (JewelryX)

- Files are repo-relative from the root: `packages/backend/…`, `packages/frontend/<app>/…`, `verification/…`.
- A check cell's test path: a pytest file (`packages/backend/tests/test_x.py`), a vitest file
  (`vitest run packages/frontend/b2b/src/tests/x.test.ts`), or a spec under `verification/`.
- The `## T2 walk` `open:` line is exactly `open: <b2b|admin> </path under the app> as <buyer|seller|admin> [mobile]`:
  `wf show` parses it and opens that page, logged in.
