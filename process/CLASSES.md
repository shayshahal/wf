# Round classes

| Class | Name | Rule | Gates |
|---|---|---|---|
| **A** | routine | No contract surface changes. Freeze, fix, prove, PR. | T2 only. |
| **B** | contract-touching | The change touches a path listed as `wf-class=B`. | Working agreement and T1 before the build. T1 and T2. |
| **C** | product-undecided | The requirement itself is open. | Set only by the orchestrator, when a question waits on the user or the product owner. Never set by paths. Post the question. Continue on the decided remainder. |

Paths that make a round class B:
- backend models, schemas, API, `openapi.json`
- frontend `*.remote.ts`, `src/lib/server/**`, `shared/**`
- auth, permissions, `core/security*`
- manifests (`package.json`, lockfiles, `pyproject.toml`, `requirements.txt`)
- data migrations, `core/config.py`, CI (`.github/**`), compose files and `infrastructure/**`

## Upgrading a class: the input-coverage test

Paths are a proxy. Do this before the build:
1. List each value that the change must produce, compute or display.
2. For each value, ask: does a source exist? A source is an input, a stored field, a derivation from
   a named value, or a prior decision record.
3. A value with no named source is an owed decision.
   - If the source is an engineering choice, the round is B.
   - If only the product owner can name the source, the round is C.
4. Do not judge this by feel. "It's just wiring" is how a real decision passes without review.
5. If the agent makes the decision anyway, record it as `status: assumed` in the decision records of
   the project.

(The test comes from jsmastery-pro/skills.)

**A screen counts.** What a person reads on a screen is a value in that list. Its source is one of:
a mockup, a decision record, or an existing screen. An existing screen is a source only when the
plan names what it takes from it.

| Source | Valid? |
|---|---|
| "like the product page" | No. |
| "its detail-page.css rules, its sidebar" | Yes. |

Example: JX-1221 (2026-10-07) answered `Class:` with paths only. The shape of the page had no
source. The builder made three layout variants. T2 deleted them.

## How paths decide the class

- The paths are in the contract-paths file of the project. It has one git pathspec glob in each
  line. `projects/<name>/index.ts` says where it is.
- The last match wins. The default `** wf-class=A` comes first.
- `wf:classify` reports the class for the diff.
- For the implementation paths that you know, write `paths: src/path, another/path` in `## Scope`
  of the ticket. An optional `## Files` list in the ticket or the agreement also works.
- These paths are anticipated repo-relative files. They include new files. A directory ends with `/`.
- Record the paths that you know from intake, and the paths that you find during the build. Ordinary
  work needs no complete file plan.
- `wf next` measures these hints and the actual changed files against the same globs before it
  dispatches a build.
- A match requires B and T1, whatever the `Class:` line says.
- If the build finds new contract scope, `wf next` stops the next build brief for agreement.
- A class never goes down (A→B→C).
