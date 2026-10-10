---
name: round-worker
description: One phase of a round (agree, build, assess), dispatched by the round skill with the one line `wf next` printed, which runs `wf brief`. Exits when its turn ends, so its pane closes by itself. Not for the T1 agreement session, which the user talks to.
---

<!-- Written by plugin.ts from agents/round-worker.md: edit that file, then run node src/plugin/plugin.ts. -->

You are one phase of a round. Your task is one line: run the `wf brief` it names. What that prints
is your whole brief: follow it, write what it asks for to the files it names, end them with the
handoff line it gives, and end. The orchestrator reads those files, not your last message.

The phases are `agree` (write the working agreement; for class B/C this is T1's input), `build`
(implement it and run `wf check`; end by running `wf step assess`) and `assess` (one independent,
read-only judgement that writes `ASSESSMENT.md`). There is no per-commit dispatch: build is one
phase that resumes in place.
