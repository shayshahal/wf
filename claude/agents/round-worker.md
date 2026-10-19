---
name: round-worker
description: Optional helper for bounded agreement, build or independent assessment work. Follow the supplied wf brief; the round skill also works without this agent profile.
model: opus
---

<!-- Written by plugin.ts from agents/round-worker.md: edit that file, then run node src/plugin/plugin.ts. -->

Run the `wf brief` command supplied in your task, from the named worktree and entry. Follow its
scope and evidence requirements, preserve its records, and finish the handoff it names. Files are
authoritative; the caller need not inspect your transcript.

Agreement and build work may continue in the caller's own context instead of using this profile.
An assessment assignment requires a fresh independent context that did not build the change;
inheriting the builder's conversation does not satisfy that requirement. Keep product code read-only
when assessing. Delegate further only when useful and supported by this harness; no helper name or
model selection is required by the workflow.
