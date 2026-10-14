# {{round}} — build

Implement the agreement at `{{folder}}/{{file}}`, within the scope below. A commit is not a workflow
transition and there is no per-commit worker: build in inspectable steps and resume in place. The
phase ends when every verification case in scope passes and you run `wf step assess`.

## Scope

{{scope}}

## The agreed material

{{agreement}}

{{review}}

{{verificationRepairs}}

## The verification cases in scope

{{cases}}

## How to work

- The scope says what you own. A normal unit build owns that unit: make its cases green and return,
  leaving later units' cases and intent to their own builds. After checkpoint criticism, the scope
  includes the whole reviewed chunk: fix its corrections and rerun every case in that chunk. A final
  integration build owns the whole agreement and repairs the failures between units, within it.
- Implement within the agreement. New helpers, new files, local corrections, added tests and naming
  are yours: ordinary implementation freedom, never a renewed agreement.
- Repair review corrections (a unit checkpoint's or T2's) against the existing agreed behavior,
  using the review's screenshots and references. A layout regression or missing agreed item returns
  to this build, not a new T1. Genuinely new scope or behavior (a new surface, contract or
  persistence choice, or dropping an agreed item) needs `{{folder}}/BLOCKED.md` with a `Question:`
  line.
- When a reviewed correction is likely to recur or protects a consequential project boundary,
  prefer preserving it as a test/check. For remaining judgment, update an existing scoped project
  note with the reason, scope, exceptions and durable source. Keep this within the agreement and
  fence; otherwise record the affected note/check and needed change in the handoff. Review these
  updates with the implementation, using the existing review.
- When accepted behavior changes a maintained explanation or operating instruction, update the
  affected existing document with the implementation. Keep completed-round agreements as history.
  Keep edits within the agreement and fence; otherwise record the affected document and needed
  change in the handoff. Leave unrelated documentation alone.
- Keep preservation checks green on both sides, using `refactor: path::<test id>` even within a
  defect fix. Assert the unchanged outcome; put a newly introduced representation in its own case.
  Include the changed implementation the case checks in its `files` cell. Test-only coverage with
  an unchanged product tree uses `refactor:` and still records a baseline pass; it is not defect proof.
  A defect case names the behavioral assertion that fails without the change, not an incidental
  assertion that happens to fail first. If an earlier assertion prevents that measurement, split
  the checks so the intended assertion is reached.
- Run `wf check` (or `wf check --case "<path>::<test id>@<line>"` on a class A round). It refuses
  edits outside the round, protected-test changes, and a verification that does not really execute
  the named assertion. A green run is not proof that a specific assertion line ran.
- `wf step assess` hands off only a `wf check` green of the implementation as it stands now; a
  later product change makes it stale. If `wf check` cannot run at all (stack, git, a missing
  runner), do not retry blind: write `{{folder}}/BLOCKED.md` with a `Question:` line naming what
  could not run.
- For a single-task build or final integration, run `wf check --suites` on the committed HEAD: the
  whole suites the round's diff reaches, so a test no case touched cannot break unseen. A unit checks
  its cases and affected integration; the final assessment requires the whole-suite result.
- Before you hand off, record how T2 sees this work: in the agreement's `- **T2 walk.**` bullet, the
  `open:` line `wf show` follows and any `setup:` lines that create the scenario the fix needs (a
  replayable setup lets the reviewer recreate the scenario after the build's reset), or
  `none — <why nothing is visible to walk>`. On a class A round the bullet is in `TICKET.md`,
  outside `## Intent` (use the notes); this project's build notes give the exact `open:`/`setup:` grammar. `wf next` refuses T2 without one, so
  a round that forgot it returns here.
- When writing proof, record every scenario-changing setup step, the run that uses that state,
  and the reset afterwards. Each result must be traceable to the setup that produced its scenario.
- When every case in scope passes, the tree is committed, and `wf check` is green on it, run
  `wf step assess`.

{{assessment}}
