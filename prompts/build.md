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
- Run `wf check` (or `wf check --case "<path>::<test id>@<line>"` on a class A round). It refuses
  edits outside the round, protected-test changes, and a verification that does not really execute
  the named assertion. A green run is not proof that a specific assertion line ran.
- When every case passes and the tree is committed, run `wf step assess`.

{{assessment}}
