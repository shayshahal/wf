# Papers and first principles

What two ChatGPT conversations of Shay's, late September 2026, concluded about what wf is for. They
came after wf's design (`docs/plans/2026-09-17-workflow-v2.md`, built from practitioner research:
pstack, HumanLayer). The transcripts stay outside this public repo, beside that research:
`~/work/jeweleryx/chatgpt-wf-pstack-humanlayer.md` and `chatgpt-agentic-workflow-papers.md`.

Nothing here was checked against the papers themselves: titles, ids and findings are ChatGPT's.

## The five papers (June to September 2026)

| Paper | What ChatGPT took from it | In wf |
|---|---|---|
| Khelifi et al., *Specifying and Maintaining Agentic Workflows: An Empirical Study of GitHub Agentic Workflows*, [2609.27263](https://arxiv.org/abs/2609.27263) | 1,248 workflow files from 276 repos: over 93% spell out task, output, constraints and process; they change like code; about 9% delegate to other agents | not cited |
| Park et al., *The Work Behind Delegation: A Framework for Supervising AI Coding Agents*, [2609.24234](https://arxiv.org/abs/2609.24234) | 19 experienced developers on their own tasks: Plan → Monitor → Review → Teach or Fix → Update Assets. A correction given twice becomes a reusable asset | `docs/plans/2026-09-27-verification-skill.md`, one line |
| Kapetanovic et al. (Infobip), *A Phased Workflow for Operating LLM-Based Coding Agents*, [2608.30701](https://arxiv.org/abs/2608.30701) | research → plan → task definition → implement, a fresh session per phase, state in git and artifacts. "Context management is the workflow"; a mistake in research or plan costs more downstream than fixing code after | not cited (wf's phases, arrived at separately) |
| Jarmak, *Engineering Reliable Coding Agents: Evaluating and Operating the System Around the Model*, [2608.13867](https://arxiv.org/abs/2608.13867) | reliability is the system around the model; one agent by default, fan-out only when measured to pay; an independent verifier; a stale repository map misleads with confidence; measure against the cheapest credible baseline | `docs/plans/2026-09-27-verification-skill.md` |
| Mazloomzadeh, Morovati & Khomh, *How Do AI Coding Agents Contribute to Software Development? An Empirical Study of Agentic Pull Requests*, [2607.21832](https://arxiv.org/abs/2607.21832) | agent PRs against human PRs (AIDev dataset): merge rates, task types, quality. A reality check on how agentic work ought to go | not cited |

ChatGPT's reading of the five: small maintained specs, executable verification, a light supervisory
loop and project assets that agents reuse. No paper shows that handoffs between fresh agents beat
one long-lived orchestrator; that part is inference.

## First principles (conversation 1, asked "what first principles are we working with")

1. Human attention is the scarce resource. Automate checking, setup and mechanical work, not judgment.
2. Agents are probabilistic; make the environment deterministic where possible: types, tests,
   reproducible environments, explicit verification, not "remember to do X".
3. The codebase teaches the next change: what is merged is what the next agent copies.
4. Verification is worth more than instruction.
5. Feedback given twice becomes infrastructure: a type, a check, a test, a verification step.
6. Don't automate away the part of programming you value: read meaningful diffs, own the shape of
   the system. Maximum leverage without losing ownership of the code.

Underneath: make the correct path the path of least resistance, for people and agents. As one line:
agents do the repetitive execution, machines give hard feedback, Shay stays responsible for the shape.

## When the harness outgrows the app (conversation 1)

- The support system must remove more uncertainty than it creates. Warning signs: agents must learn
  the harness before the app; one product change touches code, tests, maps, verifier and workflow
  config; the harness has its own flaky state and debugging; the same fact lives in three places.
- Pay as you go: no abstraction until the same friction has shown up two or three times.
- The measure: does a fresh agent need less bespoke explanation over time?

## Where the two conversations landed

- **wf** orchestrates and holds a round's temporary memory: worktrees, fresh agents, round state,
  the two gates, handoffs, and calling the project's verification. Not the permanent store of how a
  project works.
- **The project** (JewelryX) holds what outlasts a round: code and architecture, ordinary tests,
  structural health checks, commands that drive and inspect the app, and feature maps kept current
  pstack's way (one read-only agent per feature against the source, then a live pass), top features first.
- Round artifacts are handoff memory; after the merge what lasts is code, tests and the PR. A
  decision record only when a later agent would otherwise undo a non-obvious choice.
- One owner per phase; helpers inside it, one level deep. The path's length follows the task.
- Not now: ADR/PDR machinery, a law registry, an evidence graph, a pluggable verification framework.
- Next step as written then: take 2–3 recent rounds, turn what agents kept rediscovering into
  project commands, add 1–2 structural checks, leave wf mostly alone, and see whether rounds get simpler.

## Second reading (2026-10-05)

Five papers on what happens to agent code after it merges, each read in full, against wf:
`show-me-maintainability-papers.html`, with notes per paper in `papers/`.
