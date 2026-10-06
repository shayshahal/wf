# Show me — the views a design or a plan carries

A `PLAN.md` Build, and a SPEC candidate's build, say what changes as a **view**: the smallest
shape that makes the point. `CALL-STACK-FORMAT.md` is the view when the change travels a call
path. This file is the rest, and the rules all of them follow.

## The views

| view | use it when | form |
|---|---|---|
| call stack | the change runs: handlers, hops, error landings | `CALL-STACK-FORMAT.md` |
| file-tree diff | files are added, removed, moved, or change owner | a tree in a `diff` block, `+ ~ -` on the lines |
| shape diff | a data structure, a SQL table, a config block changes | a `diff` block of the fields, not the whole shape |
| contract diff | an API request or response changes | a `diff` block: method, path, request, response |
| signature block | a function is new or changes | one line per function (`CALL-STACK-FORMAT.md`) |
| mermaid | control flow or data flow with branches a stack flattens | a ` ```mermaid ` block |
| HTML artifact | a layout, a screen, or a state comparison — a static block cannot carry it | one file in the round folder |

## The rules

- **The smallest view that answers the reader's question.** Drop unchanged paths, fields and
  branches; a reader who wanted the rest reads the diff.
- **One view per point**, with a line of prose between views saying why the next shape matters and
  how it connects. The prose is the thread; the views are the beads.
- **Order the views to tell the change's story**, not to fill the table above: files first when
  ownership is the question, a shape first when it explains the rest.
- **Every view is optional.** A plan with no call stack is a plan (`CALL-STACK-FORMAT.md`, "no diff");
  a presentation change has no stack at all.
- **`diff` blocks**: `+` added, `-` removed, `~` changed, a leading space unchanged — the same
  markers as the call stack, so a reader learns one grammar.
- **An HTML artifact is a view, not a second document.** One focused file, in the round folder, for
  the one question text cannot carry. The markdown stays what binds; `wf design` and `wf review`
  render the artifact beside the plan (`.wf/SPEC-T1.html`, `.wf/PLAN.html`), and a reader who never
  opens it loses nothing the plan does not say.
- **`NOT MEASURED — <why>` is always acceptable. Silence is not** (`PRACTICES.md`): a view asserts a
  shape; a shape nobody measured says so.

## Where they go

- A SPEC candidate: `CALL-STACK-FORMAT.md` for the stack, and a view here for every shape the stack
  cannot carry. `SPEC-TEMPLATE.md` § Candidates.
- `PLAN.md ## Build`: the same views, against `RESEARCH.md`'s as-is.
- `## For T1`: the views of the chosen candidate, whole — it is what T1 approves and what the round
  is built against (`DESIGN-SESSION.md` § 5).

*Views from HumanLayer's `show-me` and `create-structure-outline` skills (dexhorthy, 2026-10-06),
kept to wf's sizes: a view replaces prose, it does not add a section.*
