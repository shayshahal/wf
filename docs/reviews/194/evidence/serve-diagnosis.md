# Serve compatibility: observation failure and fixture correction

## Observed red, not erased

- `final-serve-isolated.log`: original copied-PID compound assertion failed. Exact failed conjunct was not recorded.
- Its first diagnostic replay instead failed CI-wait HTTP with ECONNRESET in 1 ms. No native PID death was recorded.
- `serve-baseline-control.md`: exact base fixture passed twice. A failing baseline was **not established**. These passes do not explain either original failure.

## Sharper current-tree reproduction

Command, before the fixture correction:

```text
node docs/reviews/194/evidence/serve-observe.mjs
```

Full output: `serve-observe-current.log`, exit 1. This controller is preserved. It wraps fetch, CLI status and PID reads in memory, synchronizes builtin exports, then imports the unchanged real fixture. It does not rewrite source or change the failed fetch result. After a failed request it makes a separate fresh HTTP control and queries only the PID recorded by this fixture. The extra observation can change later timing.

At the **same copied/recycled-PID assertion**:

```text
CLI serve --stop: status 1
wf serve: PID 73796 is not a verified foreground server in this worktree; ownership retained
pooled root fetch :49298: ECONNRESET, 1.34 ms
recorded root PID 73796: process.kill(pid, 0) succeeded
other listener :49299: HTTP 200
separate fresh root request :49298: HTTP 200, body "fixture stack"
recorded root PID after control: still present
root authority: serve.pid 73796; running token receipt retained
FAIL a copied/recycled PID cannot stop another worktree or erase its authority
```

The failing HTTP conjunct is established in this reproduction. The listener was reachable through a fresh connection while the recorded PID existed. No native process-birth snapshot was collected at that instant. This is not proof that every historical failure had the same cause. Later shutdown probes in this log intentionally show absent processes and refused connections; they are not preservation failures.

Two smaller HTTP-plus-synchronous-child probes passed (`serve-http-minimal-red.log`, despite its preselected filename, and `serve-http-minimized-replay.log`). Therefore the low-level reset trigger was **not minimized or proven**. In particular, elapsed time is not evidence of a timeout. Do not claim an established Undici defect, idle-expiration race or historical baseline flake.

## Narrow correction

Only `src/worktrees/serve.selfcheck.ts:answers` changes: send `Connection: close` for each fixture health request. The fixture tests whether listeners survive/stop across synchronous CLI actions, not whether a pooled HTTP connection survives those actions.

- No production code change.
- No retry added; failed fresh requests still return false.
- HTTP timeout remains 2,000 ms. CLI/start/stop deadlines remain unchanged.
- All CLI exit, native process, ownership-byte and listener assertions remain unchanged.
- Fresh requests also avoid using a pooled connection to observe shutdown.

## Final evidence

1. `node src/selfcheck.ts src/worktrees/serve.selfcheck.ts` → **3/3 green**, including tsc/ESLint, in **101.4 s**; fixture **99.0 s**. `serve-fresh-connection-focused.log`.
2. `node src/worktrees/serve.selfcheck.ts` → exit **0**, all **15 Windows arms green**. `serve-fresh-connection-replay.log`.

These are passes of the corrected observation fixture on the current runtime, not retroactive green results for the old pooled fixture or a full-suite result. Source runtime is unchanged from the post-F4 real JewelryX and relocated lint-kit proofs. Independent acceptance review of this test correction remains required.
