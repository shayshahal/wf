# A rendered demo of the plan pages

What the two newest pieces of wf look like when they run, rendered by wf's own code — not
hand-written HTML:

1. `process/SHOW-ME.md` + `planPage` — the HTML surface at T1 and T2 (`wf design`'s `page: …`,
   `wf review`'s `plan: …`).
2. the `manual:` check cell — a row whose proof only a person can make (`prompts/plan.md`).

It is the fastest check on a `planPage` or `renderHeader` change: no round, no worktree, no server.

## Regenerate

```
node docs/demo/make-demo.mjs          # from the repo root
WF_ROOT=~/other/wf node docs/demo/make-demo.mjs
```

It imports the renderer from this clone's root and writes the files below. It is a fixture: the
generated files are committed, and they drift until someone re-runs it.

| file | a round writes it from | what to look at |
|---|---|---|
| `.wf/SPEC-T1.html` | `wf design` (prints `page: …`) | the design: diff-coloured stacks, the ASK with a copy button, the mermaid flow drawn, `option-a.html` embedded |
| `.wf/PLAN.html` | `wf review` (prints `plan: …`) | the plan T2 reads: the Build views (call stack, shape diff, contract diff), the Commits table kept as text |
| `.wf/REVIEW.md` | `wf review` (the header) | `manual: row 2 — …`, the step only a person can make, beside the diff |

## The round

`bug-reports/DEMO-1/` is a made-up round (not a ticket): the listings badge keeps a stale count after
a delete. `SPEC.md` is a design session's output (Class B), `PLAN.md` is the plan, and `option-a.html`
is the round folder's one HTML artifact — the view a static block cannot carry.

## Notes

- Mermaid is drawn by a script from a CDN: offline, the block shows its source instead.
- The artifact is embedded in an `<iframe>`; a browser that refuses `file://` frames shows it blank,
  and its caption is a link.
- Markdown here is LF (`.gitattributes`); the call stacks in it are indented, and the `+ - ~` markers
  lead the hop (`process/CALL-STACK-FORMAT.md`).
