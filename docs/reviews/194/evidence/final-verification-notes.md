# #194 focused verification notes

## Scope and revision boundary

Validation-only check runner, not the independent assessor. No runtime/test source changes, actual project app stacks, machine hook installation, commits, or pushes were performed. These results are focused evidence, never a full-suite result. No checks were rerun when writing these notes.

The original 25-file matrix and serve runs below are **pre-F4 repair** evidence. The parent subsequently repaired F4 with transient hook suppression on `update-ref`; the original matrix does not validate that later source revision.

## Pre-F4 focused matrix

`final-focused-matrix.log`: exact requested 25 selected files, run through `WF_SELFCHECK_JOBS=2 node src/selfcheck.ts ...`.

- 25 of 106 selfcheck files selected.
- **27/27 checks passed**, including tsc and eslint, in 419.0s.
- Full suite not run.

## Pre-F4 isolated serve run — RED

`final-serve-isolated.log` starts with the requested `node src/selfcheck.ts src/worktrees/serve.selfcheck.ts` run:

- 1 of 106 files selected; tsc and eslint passed.
- Serve selfcheck failed in 87.5s; overall 1 of 3 checks red.
- Exact failed assertion: **“a copied/recycled PID cannot stop another worktree or erase its authority.”**
- Native CLI output: `wf serve: PID 102612 is not a verified foreground server in this worktree; ownership retained`.
- That output is the expected refusal, but the assertion also requires both HTTP listeners to answer and ownership bytes to remain unchanged. The original run did not log individual conjunct values; its exact failing conjunct and cause remain unexplained.

## Isolated diagnostic replay — also RED

A single observation-only replay of the existing serve fixture was appended to the same log. Environment: Windows (`win32`) x64, Node v26.12.1; diagnostic start 2026-10-30T07:35:44.753Z.

Instrumentation method: `node --input-type=module -e` installed an in-memory wrapper around `globalThis.fetch` to log URL, elapsed milliseconds, HTTP status or exception/cause; wrapped `fs.readFileSync` to log reads whose path ends in `serve.pid`; called `syncBuiltinESMExports()`; then dynamically imported the unchanged `./src/worktrees/serve.selfcheck.ts`. No temporary transformed test file was made, no on-disk source was changed, and no timeout defaults were changed. The replay directly imported the fixture rather than invoking the selfcheck runner again; its tracing can affect timing.

Concrete observations:

- The original copied/recycled-PID assertion passed in this replay. The other fixture's native PID was **66780**; the forged idle `serve.pid` read **66780** both before and after refusal. Both independent listeners (`127.0.0.1:58438` and `:58439`) returned HTTP 200 at that assertion. Subsequent stale-PID and native-process-preservation assertions passed. This later pass does **not** explain or erase the original failure.
- Instead, exact failed assertion: **“real CI waiting metadata preserves the stack through step and next.”** State output retained `waiting_on: "ci"` and `step: "held"`. Both listeners initially returned HTTP 200. At the preservation assertion, descendant `http://127.0.0.1:58358` failed with `TypeError: fetch failed`, cause **ECONNRESET**, after **1ms**, while root `:58357` returned HTTP 200 after 2ms.
- The inspected frozen fixture used **2,000ms** HTTP timeouts, not 1,000ms. The concrete replay failure was a connection reset, not an observed timeout. Native PID liveness was not separately traced at the CI-wait failure, so the reset alone does not establish that a process was killed or died.
- The diagnostic replay ended with **1 FAILURE(S), exit code 1**. Expected shutdown probes elsewhere produced ECONNREFUSED/ECONNRESET and are not themselves evidence of incorrect preservation.

Serve remains **red**. The reset's underlying cause and the original copied/recycled-PID failure remain unresolved; no later green is claimed to explain either.

## Later F4-focused evidence (parent's run)

Read existing `disposal-hook-repair-focused.log`, without rerunning it:

- 7 of 107 files selected; **9/9 checks passed**, including tsc and eslint, in 295.8s with concurrency 2.
- Selected: disposable-workspace, disposable-hooks, disposable-recovery, baseline-diagnostic, workspace-allocation, disposable-identity-path, and env/worktrees selfchecks.
- This is focused post-repair evidence, not a replacement full matrix or a green serve result. The real lifecycle and independent assessment belong to the parent/assessor, not this check-runner report.
