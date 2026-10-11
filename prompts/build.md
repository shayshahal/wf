# {{round}} — build

Implement the agreement at `{{folder}}/{{file}}`. A commit is not a workflow transition and there is
no per-commit worker: build in inspectable steps and resume in place. The phase ends when every
verification case passes and you run `wf step assess`.

## The agreed material

{{agreement}}

## The verification cases

{{cases}}

## How to work

- Implement within the agreement. New helpers, new files, local corrections, added tests and naming
  are yours: ordinary implementation freedom, never a renewed agreement.
- A renewed agreement is for genuinely new scope or behavior only — a new user-visible surface, a
  changed contract path, a different persistence choice, or dropping an agreed item. If you find one,
  write `{{folder}}/BLOCKED.md` with a `Question:` line; do not decide it alone.
- When a reviewed correction is likely to recur or protects a consequential project boundary,
  prefer preserving it as a test/check. For remaining judgment, update an existing scoped project
  note with the reason, scope, exceptions and durable source. Keep this within the agreement and
  fence; otherwise record the affected note/check and needed change in the handoff. Review these
  updates with the implementation, using the existing review.
- When accepted behavior changes a maintained explanation or operating instruction, update the
  affected existing document with the implementation. Keep completed-round agreements as history.
  Keep edits within the agreement and fence; otherwise record the affected document and needed
  change in the handoff. Leave unrelated documentation alone.
- Run `wf check` (or `wf check --case "<path>::<test id>@<line>"` on a class A round). It refuses
  edits outside the round, protected-test changes, and a verification that does not really execute
  the named assertion. A green run is not proof that a specific assertion line ran.
- Run `wf check --suites` on the committed HEAD: the whole suites the round's diff reaches, so a test
  no case touched cannot break unseen. The assessment reads its result from `.wf/checks.log`.
- When every case passes and the tree is committed, run `wf step assess`.

{{assessment}}
