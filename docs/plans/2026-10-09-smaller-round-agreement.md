# Smaller round: working agreement (#110)

**Status: proposal, nothing agreed yet.** Every choice below is a recommendation for Shay to accept,
change or reject. Approval is recorded in #110, not inferred from this file. No runtime code, prompts,
state shape, hook or worktree is changed until #110 decides.

This is the design discussion #111–#114 implement, bounded by `../../AGENTS.md` and
`C:/Users/Shay/work/wf/DIRECTION.md`. It is deliberately short: one human-facing agreement, one final
assessment, and the deletion of the mandatory planning/review pipeline — not a spec of helper
functions.

## What you are being asked to decide

The target route (understand+agree → build ↔ verify/steer → one final assessment → T2 → safe
delivery), the single human-facing agreement that carries it, what counts as a material change,
migration/release of the rounds that exist today, and the stacked PR boundaries. Section
"Decisions needed" lists the exact choices; everything above it is the proposal they are about.

## Where we are now (grounded, read-only)

Source facts (verified in this branch; not proposals):

- `src/run.ts` is the dispatcher; `wf` today exposes `new|serve|next|brief|notes|handoff|step|prompt|check|standards|models|deliver|ask|decide|status|reap|classify|design|review` plus project/env commands.
- `src/round/step.ts` stores nine steps: `classify research plan design implement review pr merged held`.
- `src/round/prompt.ts` composes eight phase prompts (`PHASES`): `research plan implement as-built validate critique standards fix-review`, from `prompts/*.md`.
- `src/round/next.ts` is a phase action table: research → plan → design/T1 → mandatory replan (plan --revise on an overruled Ask, a revised Ask, or a plan written before the approved SPEC) → implement rows 1..N → as-built → suites → validate → critique/validate --answer → per-rule standards → T2. Effects are `{step} | {ask} | {revise}`.
- `src/round/handoff.ts` carries per-phase tokens (`briefKey`, `tokenLine`, `tokenOf`, `handoffGap`) plus `rowSubject`/`rowDone` row-completion inference; `src/round/brief.ts` records a token/count/head per phase; `src/round/ask.ts` holds questions, `revisions`, `researchRequests`; `next.ts` does the fix-review/T2 accounting.
- `src/gates/` holds `check`, `design`, `review` (+`review-format`), `content-identity`, `deliver`, `standards`, `critique`; `src/round/status.ts` is the existing visibility surface.
- Trust fixes #106–#109 are in this branch's base: `content-identity.ts`, `deliver-recovery`, `state.ts` durable read-modify-write + `CorruptStateError`, and `check.ts` executed-case/assertion proof. They must survive every deletion.
- The optional #116 prototype is excluded from this tree (no `pi-durable`/terminal-status code found).

Live round to migrate (read-only): `C:/Users/Shay/.herdr/worktrees/jeweleryx/feat-jx-1222-user-status-options`
is `class A`, `step classify`, `base origin/dev`, one recorded `research` brief (2026-10-08) and **no**
RESEARCH.md or PLAN.md yet. The installed copy is `C:/Users/Shay/.local/share/wf`, `REVISION 0813a35`
(= `origin/main`); real product rounds run there, never in this editing clone.

Baseline command (unchanged runtime, this branch): `node src/selfcheck.ts` →
`47 selfchecks green (tsc and eslint included) in 96.5s`, exit 0
(`C:/Users/Shay/AppData/Local/Temp/wf-consolidation-20261009/baseline-selfcheck.log`).
That is a machine baseline; it says nothing about human attention.

## Target route

```
wf new ──▶ Understand + agree ──▶ Build ↔ Verify + steer ──▶ one final assessment ──▶ T2 ──▶ wf deliver ──▶ wf reap
              T1 when B/C                  cheap, on demand            by default          the boundary
              the ticket is the            project checks, wf check,   independent,        actual diff,
              agreement for A              comments/ask/decide         read-only          evidence, deviations
```

Research, plan, design and the mandatory replan stop being handoffs: research facts and a plan may
still exist as working notes, but they are not gates, not per-commit dispatch tokens, and not a
second approval contract. Internal stages are not human checkpoints. T1 (for complex work) and T2
(delivery) are the only human gates; between them, a correction resumes the same implementation.

## Example 1 — an ordinary round (class A)

Ticket: a small defect (shape taken from BJEW-461 history), e.g. "the cancel-confirm scrolls the
order modal back to the top".

- **Shay**: `wf new fix/jx-####-cancel-scroll --id JX-####`. Classify measures class A. The ticket is
  the agreement; no RESEARCH.md/PLAN.md/SPEC.md is required.
- **`wf next`** prints one line: `build: read TICKET.md, record the repro command in AGREEMENT.md, make
  the change, wf check`. It does not dispatch one agent per commit row.
- **Agent, autonomously**: writes the one sourced fact (`Observed: <path:line> — repro: <command> →
  red`), makes the smallest change, runs `wf check` (silent = green), commits with an ordinary message.
  A new helper or file, a local refactor, or an added test does not go back to planning.
- **`wf next`** → `assess`. One fresh, read-only final assessment: intent met (before/after), no
  consequential design issue, checks bound to the implementation content it read.
- **`wf next`** → `T2`. **Shay** runs `wf review <round>`: the branch-vs-base diff, the ticket as the
  agreement, the project's checks and any preview the project offers, the assessment. Approves.
- **`wf deliver`** pushes, opens the PR, merges, posts the tracker note; `wf step merged`;
  `wf reap`.
- **What Shay saw**: the diff once. **What is recorded**: green `.wf/checks.log` lines bound to the
  reviewed content; the approval bound to the same content. **What T2 authorizes**: that exact
  implementation, nothing later. Human touchpoints: start and T2.

## Example 2 — a consequential/large change (class B/C)

Ticket: a contract change (a new persisted value surfaced on a screen). Class B/C because the
project's contract paths or the requirement itself are open.

- **One working session (T1)** writes `AGREEMENT.md`:
  - `## Observed` — facts only, each with a source (`path:line`, a command, a screenshot). Research
    may feed this; a proposal never appears here.
  - `## Agreed` — intended behavior, `## Not doing` exclusions, the consequential choice **with two
    structurally different candidate shapes** (e.g. *derive on read* vs *persist a status column*),
    the recommended one, the runner-up and why, a verification plan, and any open question.
  - A contract/code-shape view or a mockup is included where it resolves the task's expensive
    uncertainty — not as a completeness ritual.
- **T1**: Shay reads `wf review --agreement <round>` (or annotations on the rendered AGREEMENT.md) and
  approves a frozen AGREEMENT sha. Approval is stored against that sha.
- **Build in bounded units** (`## Units`), each ending green. Commit boundaries are git, not workflow
  transitions. A context refresh at a unit boundary is allowed and loses nothing: the agreement,
  progress and evidence live in files/state, not in the session.
- **Prototype**: if expensive product/UX uncertainty remains, a throwaway scratch worktree branch
  resolves it. Its decision is recorded in `## Agreed`; the prototype is not delivery-ready and not
  merged.
- **One final assessment** returns an intent table (`met` with before/after, `NOT MEASURED`, `left out`
  with reason), consequential design/maintainability findings, and applicable standards — each with a
  `path:line` or measurement. One routine finding goes back to implementation without asking Shay.
  An unmet intent or a still-reproducing symptom becomes one recorded `fix or accept` question before
  T2. A change that alters `## Agreed` (behavior, contract, exclusions, verification) is a **material
  change**: a renewed agreement on a new sha before building on.
- **T2** shows the actual diff, the assessment and the consequential deviations; `wf deliver`.

## Two structurally different candidates, and the recommendation

**Candidate A — one route inside the current state machine (recommended).** Keep `wf step`/`wf next`
as one thin coordinator over three working phases (`agree`, `build`, `assess`) plus `review`/`pr`/
`merged`. `AGREEMENT.md` for B/C, the ticket for A. Delete the nine steps, eight phase prompts, brief
tokens, row bookkeeping and the exchange accounting. Keep the deterministic gates (`new`, `check`,
`status`, `review`, `deliver`, `reap`, `ask`/`decide`) and the #106–#109 guarantees.

**Candidate B — wf only at the boundaries.** Delete `wf next`/`brief`/`step`; wf exposes
`new/serve/check/status/review/deliver/reap/ask/decide` and validates `AGREEMENT.md` at the edges; the
session/harness owns the loop. Fewer wf internals, but "what is next" and "resume" move into the
harness's own memory and the human's head — exactly the intervention DIRECTION sets out to reduce —
and each harness can drift.

**Candidate C — configurable stages (rejected).** Make the phase list configurable. It reproduces the
same complexity behind configuration and grows the general workflow engine DIRECTION rejects.

**Recommendation: A.** It deletes the most machinery behind the smallest interface, keeps resumable
explicit state (#107) and implementation-bound approval (#106) where they earn their keep, and
Candidate B's useful boundary commands are a subset of it. If #115 shows `wf next` is re-adding
ceremony, B is the documented fallback.

## The working agreement (what it minimally contains)

- Identity: round id, base, class.
- `## Observed`: facts, each with a source. Source research and proposals never share a line.
- `## Agreed`: intended behavior, exclusions, the consequential choice (recommended + runner-up),
  the verification plan, open questions.
- `## Units` (B/C, or a large A task): bounded, each independently checkable.
- **Ticket-as-agreement**: for class A the ticket's `## Intent` plus the recorded repro is the
  agreement; `AGREEMENT.md` is written only when the ticket is insufficient or the class is B/C.
- One human-facing document; machine evidence stays in `.wf/checks.log` and the event log.

## Material change vs ordinary freedom

**Renewed agreement required**: intended behavior beyond `## Agreed`; a new user-visible surface; a
changed contract path (class upgrade); a different data/persistence choice; changing the verification
plan's promises; dropping an `## Agreed` item.

**Ordinary (no interruption)**: a new helper or file; a local refactor; an added test; naming; splitting
an agreed unit; following an idiom the codebase already uses; fixing a bug in the agent's own
just-written change.

## Large work, prototypes and context refresh

- Units stay small enough to review; "fewer stages" must not produce an oversized final diff.
- Refresh context at unit boundaries when useful, not because a commit happened.
- A prototype resolves uncertainty; the decision is recorded and the code is reshaped into units
  before it is presented for delivery. It is never automatically delivery-ready.

## Verification, approval and evidence identity (preserved)

- Keep `src/gates/check.ts`'s executed-case/assertion proof (#109): green requires the intended
  assertion to have run; a missing executable or an import/collection failure is not proof; a
  behavior-preserving refactor may be green on both sides.
- Keep `src/round/state.ts`'s serialized, atomic read-modify-write and `CorruptStateError` (#107).
- Keep `src/gates/deliver.ts`'s remote reconciliation (#108).
- Generalize `src/gates/content-identity.ts` from "row scope" to "the agreement's product/test scope"
  (product/tests outside the round folder). `wf review` records the reviewed content; `wf deliver`
  refuses if product/test content changed (#106). A paperwork-only exception must stay explicit.
- T2 shows what was actually built, not compliance with a predicted plan.

## Inspection and cheap steering

- From a round, `wf status` (and `status --all`) already reports class/step/waiting-on/PR/stack.
  Extend it (or one `wf inspect`) to name the agreement file, a short diff summary, the latest checks
  line, and **references** to the relevant sessions/artifacts — from `state.opened_by` (pane/session)
  and the harness session id. References, not copies.
- No new forge, streaming platform, trace format, dashboard or store. Reuse PI and Claude Code where
  they already do this.
- Steering: comments on `AGREEMENT.md` and `wf ask`/`wf decide`. A local correction resumes the same
  implementation; it does not replan. Owner-directed inspection adds no periodic report/approval
  checkpoint.
- Reusable guidance lives at its authoritative project/workflow source; ticket feedback is not
  promoted to global policy by accident.
- The receiver-less terminal-status prototype has no demonstrated benefit here and can be removed on
  the local review's evidence.

## One final assessment, bounded repair, escalation

- Default: one independent, read-only final assessment — agreed intent, actual behavior/evidence,
  consequential design/maintainability, applicable standards — with findings distinguishable.
- Routine fixable findings return to implementation without Shay arbitrating each one; attempts are
  bounded (default 2, a number to evaluate).
- An unmet intent or a still-reproducing symptom (#75) becomes a recorded `fix or accept` question
  before T2; it cannot silently pass through.
- A material deviation needs renewed agreement; exhausted attempts escalate with the finding and its
  evidence.
- Targeted automated review stays available where useful; it is not a mandatory stage per task, and
  reviewer counts are a wf default to evaluate, not a rule from the HumanLayer sources.

## Migration and release (explicit, decided before code changes)

- **Active round** `feat/jx-1222-user-status-options` (class A, `step classify`, one research brief,
  no RESEARCH.md/PLAN.md): do not silently reinterpret. On release, `wf next` over a legacy state
  refuses and prints two choices: (a) finish on the pinned `0813a35` pipeline, or (b)
  `wf migrate <round>`, which for a round with no SPEC/PLAN writes `AGREEMENT.md` from TICKET.md and
  the recorded facts and resumes at `agree`. A round with an approved SPEC/PLAN finishes under the old
  pipeline; it is not migrated mid-build.
- **One-shot migration, no permanent dual pipeline.** The release that removes a prompt's last
  dispatch deletes that prompt; state gains a `version`; an unknown version refuses and names the
  migration. A push to `main` is live, so cutover is deliberate, not a side effect.
- **#74 decided skip**: represent a decided skip explicitly (`skipped` unit + reason, visible to the
  assessment) so no obsolete work is re-dispatched — or explicitly retire the capability. Either way
  the replacement must not endlessly dispatch a skipped row.
- **#75** is folded into the assessment/escalation policy above.
- **#116** is excluded; its files are not in this tree.

## #115 evaluation stance

- Machine baseline is available (47 selfchecks green). Human-attention and rework baselines must come
  from round records: `src/round/friction.ts` already prints time-in-steps, agents per phase, wf
  refusals, question counts and T2 verdicts per reaped round. Do not invent attention measurements.
- Real product rounds run on the installed copy (`~/.local/share/wf`), never this editing clone.
- Distinguish real supported harness/product runs from simulated CLI fixtures: fixtures prove command
  contracts, not human attention or behavioral defects. No causality from a tiny sample; report task
  differences and limitations; summarize which defaults to keep, change or drop.

## Counts are defaults, not rules

"One implementation session", "one final assessment", "two repair attempts", "units per agreement" are
defaults to evaluate in #115. They are not universal claims or research-established constraints.

## Proposed stacked PR boundaries (each green, no broken intermediate)

Base is the trust-fix tree already here (`fff2aaf` = `3bb4655`, #106–#109).

1. **PR-1 — agreement model + route core (#111).** Add `src/round/agreement.ts` (pure parser/validator
   + material-change classifier) with its selfcheck; add agreement facts to `state.ts`; collapse
   `next.ts`/`step.ts`/`prompt.ts`/`brief.ts`/`handoff.ts` to `agree → build → assess → T2`; delete the
   research/plan/design/replan prompts and dispatch. Because those modules also carry implement-row
   dispatch, PR-1 necessarily removes per-commit dispatch as well (see the boundary note).
2. **PR-2 — #112 remainder.** Represent or retire #74 decided skips; resume from explicit state facts,
   not row numbers/subjects/timestamps; delete the now-dead handoff/row fields, prompts and tests;
   retain the scope fence and evidence identity.
3. **PR-3 — one final assessment (#113).** One assessment prompt + bounded repair + #75 `fix or accept`;
   delete mandatory validate/critique/standards dispatch and exchange bookkeeping.
4. **PR-4 — inspect and steer (#114).** Surface the agreement, diff, checks and session references from
   an existing round; feedback/resume path; remove the terminal-status prototype if present.
5. **PR-5 — migration + release (#110/#115).** `wf migrate`, state `version`, legacy-state refusal, and
   README/round-skill updates; then the #115 evaluation records.

**Boundary note**: #111 and #112 share `next.ts`/`prompt.ts`/`brief.ts`/`handoff.ts`. Safe default is
PR-1 = "route + agreement + no per-commit dispatch" (which covers the deletion both issues name) and
PR-2 = the remaining #112 items; merging PR-1 and PR-2 is equally valid. Every option keeps each PR
green and avoids a permanent old/new pipeline.

## Decisions needed before implementation

1. Approve the target route and the minimal agreement content above.
2. Agreement representation: ticket-as-agreement for class A + `AGREEMENT.md` for B/C (recommended)
   vs always `AGREEMENT.md`.
3. The material-change boundary (the ordinary-freedom list), accept or edit.
4. Final assessment default: one independent assessment; bounded repair attempts; #75 as a recorded
   `fix or accept`; #74 represented vs retired.
5. Migration/release: finish-or-migrate the active JX-1222 round; one-shot `wf migrate` + refusal on
   unknown legacy state; deleting legacy prompts in the same release; the installed-copy cutover.
6. Stacked boundaries: PR-1..PR-5 as above, or merge PR-1 and PR-2.
7. #116 prototype: keep or remove.

## Evidence

- Baseline selfcheck at the unchanged runtime: `47 selfchecks green (tsc and eslint included) in 96.5s`,
  exit 0 — `C:/Users/Shay/AppData/Local/Temp/wf-consolidation-20261009/baseline-selfcheck.log`.
- Source facts above were read read-only from this branch (`src/run.ts`, `src/round/*`, `src/gates/*`,
  `prompts/*`, `process/*`), the active round's `state.json`, and the installed `REVISION`.
- No runtime file, prompt, state shape, hook or worktree was changed; nothing was pushed, merged,
  deployed or closed.
