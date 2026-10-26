## This project (JewelryX)

The round's direct stack origins are B2B `{{b2b}}`, API `{{api}}`, Admin `{{admin}}`.
Read `docs/agents/testing.md`, `docs/agents/seed.md` and the worktree's verification skill
(`docs/agents/verify-jewelryx/SKILL.md`). Use its doctor and relevant feature recipe before choosing
setup or claiming a state is unreachable. Search existing project tests and relevant earlier
`bug-reports/*/repro/` for checks that measure the requested behavior.

A repro lives under `{{folder}}/repro/`. Use the config supported by this checkout: the project's
verification skill config when present, otherwise the per-round Playwright config. The project's
testing notes govern imports and runtime support; a config file's presence alone proves neither.
Run the actual command and record its outcome and setup/reset in `## Repro`.
Use `wf seed` to restore disposable round fixtures between attempts when they were consumed.

The T2 recipe is `open: <b2b|admin> /<path> as <buyer|seller|admin> [mobile]`, with any
`setup: api <SDK function> <one-line JSON options> as <role>` lines. Read the project notes for
available actions. Product branches cannot edit `verification/` or `JewelryX-Tools/`; protected
coverage changes use an authorized verification branch.

For UI work the design is the worktree's `design/JewelryX.fig`, read with figlens (its MCP tools or
`npx -y @runkids/figlens`; `docs/agents/design.md`), never the Figma MCP, API or browser. When the
ticket links a Figma frame, pass that URL or node ID to figlens and inspect that frame's
dimensions/order rather than choosing an unlinked design; without a link, `find` the screen by name
or visible text. Cite the file and node ID under Observed; distinguish a measured value (figlens
`inspect`/`nodes`) from a render or screenshot impression.
