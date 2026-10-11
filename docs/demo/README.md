# A rendered demo of the agreement pages

What the newest pieces of wf look like when they run, rendered by wf's own code — not
hand-written HTML:

1. `process/SHOW-ME.md` + `agreementPage` — the HTML surface at T1 and T2 (`wf agree`'s page, `wf review`'s
   agreement page).
2. the `manual:` verification case — a case whose proof only a person can make (`prompts/agree.md`).

It is the fastest check on a `agreementPage` or `renderHeader` change: no round, no worktree, no server.

## Regenerate

```
node docs/demo/make-demo.mjs          # from the repo root
WF_ROOT=~/other/wf node docs/demo/make-demo.mjs
```

It imports the renderer from this clone's root and writes the files below. It is a fixture: the
generated files are committed, and they drift until someone re-runs it.

| file | a round writes it from | what to look at |
|---|---|---|
| `.wf/AGREEMENT-T1.html` | `wf agree` (it annotates this page) | the agreed material — `## Observed` + `## Agreed` only, diff-coloured stacks, the `option-a.html` view embedded, each block's `wf-src-<line>` (the AGREEMENT.md line a comment on it folds onto), and a wrapped bullet's continuation kept inside its list item |
| `.wf/AGREEMENT.html` | `wf review` | the whole agreement T2 reads beside the diff — Observed, Agreed, the Verification table |
| `.wf/REVIEW.md` | `wf review` (the header) | `manual: case 2 — …`, the step only a person can make, beside the diff |

## The round

`bug-reports/DEMO-1/` is a made-up round (not a ticket): the listings badge keeps a stale count after
a delete. `AGREEMENT.md` is a working session's output (Class B), and `option-a.html` is the round
folder's one HTML artifact — the view a static block cannot carry.

## Notes

- Mermaid is drawn by a script from a CDN: offline, the block shows its source instead.
- The artifact is embedded in an `<iframe>`; a browser that refuses `file://` frames shows it blank,
  and its caption is a link.
- Markdown here is LF (`.gitattributes`); the call stacks in it are indented, and the `+ - ~` markers
  lead the hop (`process/CALL-STACK-FORMAT.md`).
