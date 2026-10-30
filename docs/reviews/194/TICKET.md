# TICKET — #194 — Prove existing workspace and resource operations with a non-round consumer

Class: B

## Intent

Shay, chat (selection/start authority):
> work on another issue

Shay, chat (handover authority):
> Plannotator Inbox is on: when you finish long work, or need a decision the person isn't here to give, send it with plannotator_inbox send_message and keep going. Their reply comes back here. Run `plannotator inbox --help` for how it works.

## Source

https://github.com/shayshahal/wf/issues/194

The complete issue body follows verbatim. No comments or attachments are present in the retrieved issue. Raw source: `issue-194.json`.

## Starting point: useful mechanics already exist

Source audit at [`08f43f5`](https://github.com/shayshahal/wf/tree/08f43f593dbb589c9b3d84ed61c68e4ec78d2c00) found:

- `src/worktrees/worktree.ts`: lower-level workspace allocation and project setup.
- `src/worktrees/serve.ts`: owned-vs-borrowed dependency leases, process identity, serialized start/stop and confirmed release.
- `src/gates/baseline-run.ts`: isolated scratch baseline acquisition and teardown, currently called by selfchecks rather than a supported tool-only consumer.
- `src/worktrees/new.ts`: the public round entry also classifies work, creates round documents, scaffolds proof and applies round-specific behavior.
- `src/project.ts`: statically selects JewelryX. Portable harness instructions do not establish arbitrary-project portability.

These are implemented source paths, not freshly runtime-certified capabilities. Do not rebuild them on Pi Durable merely to obtain composability.

## Outcome / bounded first slice

Prove that one non-round workflow can use existing safe workspace/resource operations without adopting wf's round ceremony. Keep the existing round skill as another consumer of the same implementation.

Start with one caller/ownership contract and discover the minimum interface from that proof. This is **not agreement on a three-verb API, a generic plugin system, or a rewrite of all commands**.

## Acceptance

- Identify one demonstrated repeated coordination task and reuse the current operation implementation. Do not add a wrapper that only renames a subprocess and leaves all hard coordination to the caller.
- A tool-only consumer can allocate/setup an isolated workspace, acquire only its required dependencies, inspect actual readiness/outcomes, and safely release/recover what it owns without class A/B/C, `TICKET.md`, `wf next`, or installing/removing the caller's behavioral skills.
- Preserve current ownership, identity, unknown-vs-absent, borrowed-vs-owned, stale-handle, replacement-resource and interrupted-cleanup guarantees. Resolve #192ג€™s reap retry defects before claiming the cleanup surface broadly safe.
- Separate workflow prompts/policy from project facts and machine execution. The round wrapper may keep its round-specific behavior; neutral allocation must not require it. No live migration of existing rounds.
- Demonstrate the existing round consumer plus one non-round consumer. Demonstrate JewelryX and one genuinely narrower project, with **lint-kit a candidate**, not a new required dependency. Read its actual scripts/prerequisites; do not launch a JewelryX stack for a no-stack project.
- Prefer existing project exports/adapters; add only fields required by the two examples. No registry or capability catalog designed in advance.
- Test acquisition, borrowed resources, failed setup, repeated release and interrupted recovery through controlled seams; perform AGENTS.md's isolated real lifecycle/hook-restoration cycle if those paths change. Verify kit/env separation and applicable portable-export behavior.
- Publish what callers supply, what outcomes/receipts they receive, what recovery they own, and which guarantees were actually exercised. Operation completion is not verification of the caller's product claim.

## Boundaries / dependencies

#131/#139 own scenario preparation/readback/reset and real verification-friction evaluation. Do not fold those into a universal verifier. #159 owns optional host continuation; it is not a prerequisite for calling these operations. #158 remains optional existing-worktree discovery/open, not permission to switch resource backends.

No scheduler, workflow DSL, conversation database, blanket extraction of every command, mandatory Pi/Herdr/runtime dependency, fixture catalog or new task approval ceremony. Existing approval/correction/delivery guards must remain intact for protected actions; a lower-level API is not a bypass around them.

Tracker follow-up authorized by Shay on 2026-10-24 after the source/backlog audit. Implementation shape is to be established by this bounded proof; no source, active-round or machine change is authorized by filing alone.


## Scope

One coherent proof: reuse the existing workspace/resource operations for a non-round baseline diagnostic caller, retain the existing round caller, demonstrate JewelryX and lint-kit. Do not replace every command or promise arbitrary-project round support.

paths: src/worktrees/, src/gates/baseline-run.ts, src/gates/baseline-run.selfcheck.ts, src/project.ts, src/seams.ts, projects/jewelryx/index.ts, projects/lint-kit/, env/worktrees.ts, README.md, docs/reviews/194/

These are anticipated ownership paths, not permission to refactor every file in those directories. Narrow from the proof. This changes caller/project/ownership contracts, so Class B applies regardless of the default path classification.

## Workspace

- Manual development worktree: `C:/Users/Shay/work/wf-194`.
- Branch: `feat/194-tool-only-workspaces`.
- Actual creation base: `8622ce7de2a1243f0dc34c806f5bc7682bc508fe` (main advanced after #149 cleanup; this task starts from the newer main).
- This changes wf itself, not an application round. No `.wf/state.json` or project-round setup was created. Use Git for this development workspace, as for #149.
- Do not invoke wf new here as a real task. AGENTS.md requires the editing-clone entry only for isolated lifecycle bench verification; restore installed hooks afterward.
- Dependency #192 is CLOSED (2026-10-25); receipt: `evidence/dependency-192.json`. Closure does not replace fresh recovery checks.

## Initial observations and measurements

| Item | Evidence / limit |
|---|---|
| Existing non-round coordination example | #149 needed a manually allocated clean baseline checkout, dependency installation, isolated diagnostics and cleanup. `src/gates/baseline-run.ts` names the same scratch comparison need from JX-1069. |
| Existing scratch contract | `startBaselineScratch` reserves identity, copies explicit probe inputs and returns memoized removal. It currently has no production caller outside selfchecks. This is not a shipped tool-only entry. |
| Static project selection | `src/project.ts` re-exports JewelryX. `git-worktree.ts` and `serve.ts` import it. Do not run them against lint-kit under the current project binding. |
| Round-specific behavior | `projects/jewelryx/index.ts:newRound` writes repro configuration and changes behavioral skill links. A neutral caller must not call it. |
| Lint-kit | Local checkout `C:/Users/Shay/work/lint-kit`, clean at `be07c4980371743a981379cf34b1f2aa08120d39`; package requests Node >=20, pnpm 11.3.0. README development commands include pnpm install, pnpm test, separate Python uv/pytest. No app stack is declared. |
| Tool availability | Node v26.12.1; pnpm 11.3.0. No lint-kit install/check or JewelryX lifecycle was run for this task. |
| Focused baseline | `WF_SELFCHECK_JOBS=2 node src/selfcheck.ts src/gates/baseline-run.selfcheck.ts src/worktrees/worktree.selfcheck.ts` PASS: 2 files + tsc/eslint, 30.9s. `evidence/baseline-focused.log`. Controlled tests only; not lifecycle proof or complete suite. |

## Additional baseline recovery evidence

`WF_SELFCHECK_JOBS=2 node src/selfcheck.ts src/worktrees/reap-recovery.selfcheck.ts src/worktrees/reap-interruption.selfcheck.ts` PASS: 2 files + tsc/eslint, 10.9s. Controlled interruption/replacement/cleanup tests only. `evidence/baseline-recovery-focused.log`.

## Current status

T1 approved by actual human Inbox reply `msg_01M6495Z4V123MEQ80JYBT3R6P`; exact material and ruling are in `AGREEMENT-REVIEW.md`. Implementation, retained failures, repairs and focused/real evidence are in `BUILD.md`. Final independent `ASSESSMENT-R3.md` is **READY FOR HUMAN T2**, binding the final 41-file source cohort. `HANDOVER.md` shows the current result, proof and limits. Human final T2 remains required before publication. No push, PR or merge yet; no active-round migration or permanent machine-configuration change is authorized.
