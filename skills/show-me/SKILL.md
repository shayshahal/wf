---
name: show-me
description: Draw the current topic as a view — a call stack, a file tree, a shape or contract diff, a mermaid flow, or one HTML artifact — instead of describing it. Use when a design, a plan or an answer needs the shape shown, or when the user says "show me" or "draw this".
---

# Show me

Read `${CLAUDE_PLUGIN_ROOT}/process/SHOW-ME.md` — it is the whole rule set, and it wins over this
file.

Draw the smallest view that makes the point; keep prose to the one line that says why the next view
matters. In a design session or a plan the views go into `SPEC.md` / `PLAN.md` — they are not a
second document. When no static view carries it (a layout, a screen, a state comparison), write one
focused HTML file in the round's folder; `wf design` and `wf review` render it beside the plan.
