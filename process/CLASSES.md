# Round classes

**A — routine.** No contract surface changes. Freeze, fix, prove, PR; T2 only.

**B — contract-touching.** Changes a path listed as `wf-class=B`:
backend models, schemas, API, `openapi.json`; frontend `*.remote.ts`,
`src/lib/server/**`, `shared/**`; auth, permissions, `core/security*`;
manifests (`package.json`, lockfiles, `pyproject.toml`, `requirements.txt`);
data migrations, `core/config.py`, CI (`.github/**`), compose files and `infrastructure/**`.
Requires a design session and SPEC.md before implementing; T1 + T2.

**C — product-undecided.** The requirement itself is open. Set only by the
orchestrator when a question is waiting on the user or the product owner — never by paths.
Post the question and continue on the decided remainder.

**Upgrading a class — the input-coverage test.** Paths are a proxy. Before
building, the agent enumerates every value the change must produce, compute
or display, and asks of each: does a source exist for it — an input, a
stored field, a derivation from a named value, a prior decision record? A
value with no named source is an owed decision: the round is B if the
source is an engineering choice, C if only the product owner can name it. Do not judge
this by feel — "it's just wiring" is how a real decision gets waved
through. A decision the agent makes anyway is recorded as `status: assumed`
(in the project's decision records). (Test from jsmastery-pro/skills.)

**A screen counts.** What a person reads on screen is a value in that
enumeration, and its source is a mockup, a decision record or an existing
screen — an existing screen only when the plan names what it takes from it
("like the product page" is not a source; "its detail-page.css rules, its
sidebar" is). JX-1221 (2026-10-07) answered `Class:` with paths alone and
left the page's shape unsourced: three layout variants were built, and T2
deleted them.

The pathspec lives in the root `.gitattributes`; last match wins, so the
`** wf-class=A` default comes first. `wf:classify` reports the class.
