# SPEC template

The skeleton of `<round folder>/SPEC.md`. The section order is fixed — the user reads top-down and
stops when a line is wrong. Why each section exists: `DESIGN-SESSION.md`. The notation in
`## Candidates`: `CALL-STACK-FORMAT.md`.

```markdown
# SPEC — <ID> · «<the ticket title, verbatim>»

<board item · queue · priority · reporter + date> · Round `<branch>`, base `<ref>`.
Bug/CR folder: `<path>`.

**Class: <A|B|C>** — <what set it; if C, the owed value and whose it is>.
<Revision n. What T1 asked and what changed — only on a re-spec.>

## For T1

<≤ 30 lines. This is the only section the user annotates — `wf design` shows them this and nothing
else — so it is the design: the round is built and checked against it. Everything below is the
working notes that reached it; it stays and is hashed, but nothing in it binds unless this
section says it.>

**As-is** — one diff-free call stack per touched path, `file:line`, ≤ 6 lines each, and the lines
where the truth dies, quoted from the code with `:line` and a `⚠`, not described. The one or two measured facts that change what a reader expects.
**Build** — the chosen candidate's build views in diff syntax: the call stack (`CALL-STACK-FORMAT.md`)
and any `SHOW-ME.md` view that carries a shape the stack cannot, and the
one line that says why not the runner-up.
**Asks** — every ASK, verbatim, with addressee. Nothing else: no INFER, no RECOMMEND here.

## As-is

<The current call stack per touched path: file:line, real function names, one hop per line.>
<The code where the truth dies, quoted: its lines with `:line`, a `⚠` on the wrong one. Never a
prose account of what the code does.>
<A table of the types on each hop, and the row where the truth dies.>
<What a live stack does today — the script, when it ran, against which stack, and its output.>
<Every other path that reaches the same code, and the grep that proves the list is complete.>
<Birth check: was it ever right? git log -S on that line.>
<Any constraint that decides the design — state it once here, not inside each candidate.>

## Input coverage

| # | value | source |
|---|---|---|
| 1 | <a value the change produces, computes, decides or displays> | <ticket line · document § · decision record · model field · a measurement> |
| n | <…> | **owed decision — ASK-n** |
| n | <a question you decided NOT to ask> | **not owed — <the ruling that closes it>** |

<One line: which owed rows classify this round B or C, and why the others do not.>

## Candidates

### A — <name: where the guarantee lives>

**Usage.** <what a caller / the user does; "unchanged" is an answer>
**Types / signatures.** <a code block per new or changed signature; bodies may throw>
**Build views.** <the call stack in diff syntax — CALL-STACK-FORMAT.md — plus any SHOW-ME.md view
that carries a shape a stack cannot; "no diff" is legitimate>
**Tests to write.** <named tests, or the operational artifact that stands in for them>
**Tradeoff.** <one line for, one line against. Name any falsifier it carries.>

### B — <structurally different, not a rename of A>
…

## Questions

### INFER — decided here, from a named source
<n. the decision — then the source that decided it, measured where possible>

### ASK — <the user (engineering) | the product owner (⇒ Class C)>
> **ASK-n (<who>) — <the question, verbatim, in the addressee's language>**
> <what is already measured, and what each answer costs>

### RECOMMEND — my pick, with the runner-up
<n. the pick · one line why · the runner-up>

## Recommendation

<One candidate, one paragraph: why it, why not the others, and what still gates the merge.>
```

Rules the skeleton does not show:

- `## For T1` is written **last** and read **first**: it is a rendering of the sections below it,
  not a place for anything new. It is also the only part that binds: whatever the build needs from
  the sections below (a test, a constraint, a landing) is in it, or it is not built. Over 30 lines, cut — BJEW-454's rev 1 was 312 lines and its T1
  came back «information overload, i cannot follow this».
- An ASK offers a choice the ticket, the docx or the code already forces. A feature the round was
  not asked to build is not a question — it is a twin ticket, one line under `## Recommendation`
  (BJEW-454 rev 1's ASK-1, a nightly sweep nobody asked for).
- `## As-is` and `## Input coverage` are written **before** any candidate exists.
- ≥ 2 candidates, structurally different. One candidate is a plan, not a design session.
- Every `✗` arm in a call stack says where it lands. Every new function has a signature block.
- A view is the smallest shape that makes its point, one per point, with a line between them
  (`SHOW-ME.md`); an HTML artifact is one file in the round folder, named in the Build it belongs to.
- Nothing here is a menu: every open item is an ASK with an addressee or an INFER with a source.
- `wf step design` requires this file; the round then freezes on its sha256, and a revision is a
  new sha and a new T1.
