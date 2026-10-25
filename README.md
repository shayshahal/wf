# wf

A portable skill for taking a project task through agreement, implementation and verification,
independent review, human approval and safe delivery. The agent uses whichever harness it has;
wf does not select its model, spawn its workers or require a particular terminal UI.

The skill owns the workflow instructions. Small executable tools prepare workspaces, measure results,
retain decisions and enforce approval/delivery safeguards. Project facts and verification recipes live
in the project's repository; each task keeps its durable memory in its worktree (JewelryX:
`bug-reports/<round>/`, plus `.wf/` machine records). The previous chat is not required to resume.

## Use as one skill folder

From this checkout, with Node >=22.18:

```sh
node wf.mjs skill export /path/to/skills/round
```

Choose a new destination. The command refuses to overwrite an existing directory. Give the exported
folder to a harness that supports skills, or tell any agent to read its `SKILL.md` explicitly:

```text
round/
├── SKILL.md
├── references/             # Branch-specific intake, review, questions and fallback guidance
└── scripts/
    ├── wf.mjs              # The portable entry
    └── runtime/            # Generated from the kit's one source, not another implementation
```

Run its tools as `node "/path/to/skills/round/scripts/wf.mjs" <command>` from the project/round.
No plugin, globally installed `wf`, runtime npm dependencies or named agent profiles are required.
The folder includes the currently configured project adapter (JewelryX); it is portable between
harnesses, not a claim that arbitrary projects or operating-system prerequisites need no setup.
The kit exports no `env/`, secrets, sessions, task state, git metadata or development dependencies.
It can be moved or re-exported without keeping this checkout.

Start with `notes` for the project's prerequisites and workflow references. `next` identifies the
current allowed work; `brief agree|build|assess` supplies its context and handoff. Agreement/build can
run in the current session. Assessment requires a fresh independent context, supplied by this or
another harness; the tools enforce report freshness but cannot prove an LLM context's independence.
Missing capabilities produce an explicit blocker/handover, not a silently weaker completion standard.

A configured machine launcher is still useful for machine-specific infrastructure. Keep using the
entry that created an existing task: changing harnesses does not authorize changing its environment.
`WF_NO_OPEN=1` suppresses external editor/browser windows for a remote or UI-owning harness.
Both the kit (including installed/exported skill bootstraps) and machine entries detect authenticated
T3 Code sessions and supply native-tool handoffs ahead of external review UI. This keeps the round's
entry and machine identity unchanged; the session executes the tools and records the actual ruling. Claude Code retains its
no-external-window default. Human-facing documents use compact decision sheets and visual views
(`process/SHOW-ME.md`); generated UI presents the files, never replaces their approval identity. Inbox,
review UI, delegation, wakeups and durable execution are optional conveniences; plain sessions save
and resume rather than claiming to run after exit.

**Changing wf:** [DIRECTION.md](DIRECTION.md) records the consolidation goal. The skill is
`skills/round/SKILL.md`; [AGENTS.md](AGENTS.md) governs changes to the tools.

## Where things are

- `wf.mjs`: the kit's entry. The code is under `src/`, one module per command; the pure functions are
  checked by the `*.selfcheck.ts` files `src/selfcheck.ts` runs (beside the module that owns them):
  - `src/run.ts` is the dispatcher; `src/paths.ts` says where wf's own files are (`WF_ROOT`)
  - `src/models.ts`: optional helper profiles' effort level (`low` for the read-only judges, `medium` for the
    rest) and `wf models`, the model each level runs on here. Agent files say `effort:`, never a
    model: Claude Code's aliases are the kit's, pi's patterns are Shay's (`env/models.ts`)
  - `src/seams.ts`: what differs between machines (worktrees, the database, review screen,
    notifications, the model for each effort level) and the kit's defaults for it. An env's own
    entry plugs its pieces in: `env/wf.mjs` is Shay's.
  - `src/project.ts` → `projects/<name>/`: everything project-specific. See *Projects* below.
  - `src/round/`: a round's state and its loop. `state.ts` is `.wf/state.json` (versioned; an
    old-route round is refused before mutation); `next.ts` is `wf next`, the current work or unmet condition
    from its state and files (no model selection or agent dispatch); `agreement.ts` is the working
    agreement (which file it is, the agreed-material sha T1 binds, the verification cases);
    `brief.ts` + `prompt.ts` are `wf brief <phase>`, what a phase agent runs first. Each build-to-assess
    handoff records the previous assessment's content identity: a fresh report is needed even if only
    the evidence changed and HEAD stayed the same. Each report records `assessed-at`; touching an old
    report cannot send the completed build back to repair. Legacy visits without a recorded identity
    get one fresh assessment rather than guessing from file timestamps. Build reasons survive in
    state, served briefs and `wf status --inspect`. A cleared handoff gap re-evaluates the existing
    assessment for freshness and T2 instead of requiring an empty rebuild;
    `step`, `ask`/`decide` (`decide --revise` sends a round back to `agree` for a new T1),
    `inbox` (posts user questions through the env's optional transport and saves replies; `decide`
    records the ruling), `corrections.ts` (`wf correct`, durable authored instructions, explicit
    disposition and source deduplication), `status` and `notes`.
    Builders and assessors receive the prior assessment and recorded question answers plainly; the
    builder chooses verification and repairs and the independent assessor judges the evidence, with
    no prescribed repair-response records or verification-ruling receipts. `clean` goes to T2,
    `repair` returns to build within a bounded budget, and `blocked` (or exhausted repairs) records
    one contextual user question. wf does not derive those outcomes from assessment prose.
  - `src/gates/`: `classify`, T1 (`agree.ts`), final T2 and optional checkpoints (`review.ts`),
    review/approval identity (`review-format.ts`, `content-identity.ts`) and safe resumable delivery.
    `wf check` is an optional project affected-check runner, not handoff authorization. Agents run
    normal project commands through their harness; final review judges the evidence. Supervised
    execution and isolated baseline helpers retain resource ownership without assertion/proof policy.
  - `src/worktrees/`: `worktree.ts` is the one interface to worktrees: list, ports and slugs
    (`ports.ts`), create (`wf new`), remove (`wf reap`). wf chooses `<repo>/.claude/worktrees/`
    for every allocator; envs may plug in allocation mechanics, not a different host's workspace.
    Native sessions bind to this existing checkout; `session-workspace.ts` refuses mismatched round
    work and cleanup of the calling session's workspace. Existing rounds keep their paths.
    No worktree is served from its
    creation: `wf serve` (`serve.ts`) runs the stack in the background (pid and logs in the
    worktree's `.wf/`), started by the phases that use it (`wf brief assess`, `wf review`, or a
    person running `wf serve` for the repro or a live check). `wf next`/`wf step` release
    idle stacks at classify, agreement, held, approved or merged boundaries and non-review human waits;
    build, assessment, CI waits and T2 review keep theirs. `wf serve --stop` closes only the recorded server
    tree, without reaping the checkout or database; use it after a helper checkout's live work.
    Stops verify process identity and working directory, rather than trusting a recycled PID, and await
    shutdown before clearing the record. Unverified ownership warns at a phase boundary without blocking
    its action; an explicit stop refuses and preserves the record.
  - `src/skill/skill-export.ts`: exports the self-contained skill from the canonical instructions and kit;
  - `src/plugin/`: `plugin.ts` writes `claude/agents/` from `agents/`; `anchor.ts` fills the paths
    in text (below); `t3code.ts` + `t3-workspace.ts` supply portable native presentation and workspace binding
  - `src/selfcheck.ts` runs every selfcheck and tsc; `src/boundary.selfcheck.ts` fails if the kit
    reaches into `env/`
- `env/`: Shay's machine, which the kit never imports: worktrunk and its hooks (`env/hook.ts`,
  `env/worktrees.ts`), self-update (`env/update.ts`), plannotator and herdr (`env/adapters/`), and
  per project where the worktrees' databases live (JewelryX: one MongoDB) and portless
  (`env/projects/`).
  `env/projects/jewelryx/rework.ts` measures how much of each change's code is changed again within N days, and by
  what (a fix, a revert, a sweep, other work): wf rounds against other ticket work and other PRs
- `skills/round/SKILL.md`: the portable workflow skill ("start 662", "resume 662"); `skills/design-session/` for T1; `skills/show-me/` for a view
- `prompts/*.md.in`: pristine templates for `agree`, `build` and `assess` (`wf prompt <phase>` prints them). The `.in` suffix also protects the first upgrade through an older installer's markdown anchoring.
- `.claude-plugin/` + `claude/`: the optional Claude Code packaging (manifest, marketplace and helper profiles)
- `agents/`: `round-worker` (optional bounded help), `codebase-locator` and `codebase-analyzer` (optional read-only discovery), `harness-fixer` (harness trouble, outside the round)
- `process/`: lifecycle, classes, the agreement template (`AGREEMENT-TEMPLATE.md`), the views an agreement carries (`SHOW-ME.md`), review format, touchpoints, standards
- `docs/plans/2026-09-17-workflow-v2.md`: the plan wf was built from (history; done)
- `docs/research/papers-and-first-principles.md`: what wf is for, and the five papers read after it was built
- `docs/research/show-me-maintainability-papers.html`: five papers on what happens to agent code after it merges, against wf (notes per paper in `docs/research/papers/`)
- `docs/demo/`: the agreement pages rendered (`process/SHOW-ME.md`, `agreementPage`, the `manual:` cell) — `node docs/demo/make-demo.mjs`, then open `.wf/AGREEMENT-T1.html` (T1, the page `wf agree` annotates) and `.wf/AGREEMENT.html` (T2)

Runtime templates name wf's files as `{{wf}}/…` and project notes as `{{project}}/…`.
`wf prompt` / `wf brief` and `wf notes` fill in the current paths when read (`anchor.ts`); installation
keeps those templates relocatable. Phase briefs inline the canonical decision-sheet rules from
`process/SHOW-ME.md` before ticket context, rather than relying on the agent to follow a style link.
Skill references are relative. Only machine-installed optional helper profiles have their installed
location filled in ahead of time.

## Install (the team: the Claude Code plugin)

The kit alone, as a Claude Code plugin: this repo is its marketplace (`.claude-plugin/`).

- **Install:** in Claude Code Desktop, add the marketplace `shayshahal/wf` and install `wf`; or
  `claude plugin marketplace add shayshahal/wf` then `claude plugin install wf@wf`.
- **It carries:**
  - the skills `wf:round`, `wf:design-session` and `wf:show-me`;
  - optional helpers `wf:round-worker`, `wf:codebase-locator`, `wf:codebase-analyzer` and
    `wf:harness-fixer` (generated by `node src/plugin/plugin.ts`). There are no dispatch, fork
    restriction or handback hooks; the same skill works without these profiles.
- **Needs:** git, gh, node ≥ 22.18 (wf is TypeScript, which Node runs as is from 22.18), the project's own tools (JewelryX: pnpm, uv), and one MongoDB
  (`MONGO_URL`, default `mongodb://127.0.0.1:27017`; JewelryX: unset and down, wf brings up the repo's
  own with Docker). The project's `.env` files sit in the
  person's clone, where they keep them to run the app; every round's worktree copies them.
- **Try a change without installing:** `claude --plugin-dir <this clone>`.
- **Updates:** turn on auto-update for the `wf` marketplace (`/plugin` → Marketplaces → wf →
  Enable auto-update). It is off for every marketplace but Anthropic's, and the plugin then stays at
  the version first installed (BJEW-562, 2026-09-27: 0.1.0 ran the round after 0.1.2 merged). A
  push reaches the team only with a new `version` in `.claude-plugin/plugin.json`: that bump is the
  release. Auto-update runs inside a session, up to ten minutes after its first message, and the
  session keeps the version it started with: a merge reaches the session after next (BJEW-602,
  2026-09-27: started 15 minutes after 0.1.6 merged, it ran 0.1.4 and posted to Monday before T2).
  To start a round on what was just merged: `claude plugin update wf@wf` in a shell first.
- **A round's session:** open the clone as it is: its own branch in the branch picker, the
  *worktree* box off. `wf new` makes the round's branch and worktree, and the session moves into
  it; `resume <id>` does the same. Picking the round's branch fails (git: it is checked out in the
  round's worktree), and a Desktop worktree is one the round never uses.
- **Does it reproduce?** `/wf:round check <id>`: a round that measures the ticket's `## Repro` and
  stops, with the tracker untouched. "go" turns it into the round; "stop" reaps it.

## Projects

wf runs rounds on one project at a time, named in `project.ts`. Its folder, `projects/<name>/`,
holds everything wf knows about it, and `index.ts` there is the only file the rest of wf imports:

- names, ports and URLs of its apps; which changed files are pages
- `setup` (the pre-start steps), `serve`, `teardown`
- `checks`: the commands `wf check` runs for a diff
- `waitForVerificationReady`: execution readiness for app-driven checks, separate from status's
  reachability probe. JewelryX's verification and repro runners share buyer/seller/admin auth setup,
  so they wait for successful GET responses from the storefront and admin roots and the API's
  `/openapi.json`, using the URLs passed to the runner. The same helpers are available to isolated
  baseline work. Missing URLs, connection failures and HTTP errors identify the dependency and dev
  log; they do not establish a product defect. Checks without a running-app dependency do not start
  or probe the stack. Newly acquired narrow servers are temporary; borrowed stacks are not stopped. Baseline cleanup retains server diagnostics in the surviving
  `.wf/logs/baseline-redbase.log`; failed retention preserves the scratch for recovery.
  Readiness does not certify login, scenario data or test outcomes.
- its round folder, base branch, round branches, people, contract-paths file, tracker note
- `guidance`: the folder of its notes for agents, in its own repo. A note whose frontmatter has
  `globs:` (Amp's AGENTS.md form, from the repo root) is put in the build and assessment briefs when
  an actual changed file matches (`src/round/guidance.ts`); the rest are
  named by the phase prompts
- `commands`: wf subcommands only this project has (JewelryX: `seed`, `show`)

Next to it: `ROUND.md` (tracker, statuses, people, branches: read by the round skill),
`prompts/<phase>.md` (appended to that phase's prompt) and whatever implements the above.

There is one project, JewelryX. When a second one arrives, it gets a folder like this one, and
what the two share becomes the interface. Not before.

## Install (Shay's machine, the kit with `env/`)

The team installs the kit alone (docs/plans/2026-09-27-kit-and-env.md, step 5). Needs: git, node ≥ 22.18, [worktrunk](https://github.com/max-sixty/worktrunk) (`wt`), `gh`, pi and/or
Claude Code, plus what the project's `setup` runs (JewelryX: pnpm, uv, docker, portless).

1. `git clone https://github.com/shayshahal/wf ~/work/wf`: the editing clone. Never run wf from it.
   Run `npm ci` in it for the manual self-check tools (wf itself needs no packages).
2. `node ~/work/wf/env/update.ts`: installs the committed code into `~/.local/share/wf`, and wf's
   agents into pi (`~/.pi/agent/agents`). Claude Code gets wf from the plugin, as the team does:
   nothing of wf goes into `~/.claude/`, where a user-level agent or skill would outrank the plugin's.
3. Put `wf` on the PATH through Shay's entry: `~/bin/wf` is
   `exec node "$HOME/.local/share/wf/env/wf.mjs" "$@"`, and `~/bin/wf.cmd` is
   `@node "%USERPROFILE%\.local\share\wf\env\wf.mjs" %*`.
4. Skills: add `~/.local/share/wf/skills/round`, `~/.local/share/wf/skills/design-session` and
   `~/.local/share/wf/skills/show-me` to pi's `settings.json` `skills`. Each path is a stable entry
   point: the skill's directory keeps its name across releases, so a registered path never dangles
   (its folder and its frontmatter `name:` move together).
5. `wf hook install`: worktrunk's user config gets the project's hooks, calling the installed copy's
   `env/wf.mjs`.
6. The project's clone: a bare repo, and a worktree for its base branch (JewelryX):
   ```
   git clone --bare https://github.com/Raynw-MediaTech/jeweleryx ~/work/jeweleryx/.bare
   echo 'gitdir: ./.bare' > ~/work/jeweleryx/.git
   git -C ~/work/jeweleryx/.bare config remote.origin.fetch '+refs/heads/*:refs/remotes/origin/*'
   git -C ~/work/jeweleryx/.bare fetch origin      # a bare clone has no origin/dev until this
   git -C ~/work/jeweleryx/.bare worktree add ~/.herdr/worktrees/jeweleryx/dev dev
   ```
7. The project's secrets, on this machine (JewelryX: the four `.env` files `.worktreeinclude` names,
   from `.env.example` plus the real values) at the same paths under `~/.config/wf/<project>/`.
   Every new worktree copies them from there.

## Update

The portable-skill release changes `next` from harness dispatch lines to `work <phase>:` packets.
Reload the round skill (or start a new session) before continuing an active task. Version-2 task
records and their evidence/approval identities are unchanged; resume using the entry that created
that task. This does not convert legacy pipeline state or make environment configurations equivalent.

After a push to `main`, the next `wf` command installs it by itself and prints
`wf: updated <old> → <new>`. `wf update` fetches first. After changing `env/hook.ts` or the project's
`setup` steps: `wf hook install` again.

## Follow-up after delivery

A merged round owns one PR. More work on the same ticket starts a fresh branch with
`wf new <new-branch> --reopen --class A|B|C --id <id>`; `EARLIER.md` links earlier work and rulings,
not reusable approval. wf preserves the first delivery's identity and refuses to build on its merged
state. Refresh the ticket/scope and obtain fresh assessment and T2 for the follow-up.
`WF_FORCE_REAP=1` remains an explicit discard of the worktree and local branch; product changes are
not archived. Older rounds without a content binding can post their saved note, but cleanup requires
restored original evidence or that explicit discard.

## Corrections after approval

Give the instruction normally. The receiving agent records it with `wf correct`, preserving its
source, author, scope and words; `wf next`, actual build/assessment context and `status --inspect`
carry it independently of REVIEW.md. Reading or dispatching does not address it. Pending or blocked
instructions prevent delivery even before file bytes change. Historical approval remains intact;
changed reviewed content requires fresh T2, while an unchanged transient interruption can resume.
A correction racing an attempted merge waits for remote reconciliation; confirmed delivered product
work uses a fresh follow-up, never the old approval. Worker wake/launch is not provided here (#159).

## Async round questions

On Shay's entry, `wf inbox` sends open `wf ask` questions addressed to `user` to Plannotator
Inbox (CLI 0.28.9+). The round skill runs it when a question waits, and again on a reply or resume.
Each question has a retry-safe message reference in `.wf/state.json`; replies are saved there
until the agent records the person's ruling with `wf decide --q <n>`. Agreement changes still
use `--revise`; T1/T2 still use `wf agree`/`wf review`. `wf next` never polls the Inbox.

Inbox uses the shared Plannotator data directory, unlike the worktree-local T1/T2 reviews.
Pi's enabled Inbox integration wakes the sending session; after a session ends, `wf inbox` in
the round's worktree retrieves its replies. The kit without a transport, or an unavailable CLI,
falls back to asking directly and `wf decide`. No runtime packages are needed.

## Self-checks

From this folder: `node src/selfcheck.ts` (every `*.selfcheck.ts`, wf's and the projects', `tsc`, and
lint-kit's error-handling rules through `eslint`, in parallel; `npm ci` first). Pure checks, no network;
`review.selfcheck.ts` needs a git checkout (this one). Each completed check prints its elapsed time.
The suite is manual: wf has no mandatory selfcheck pre-push hook.

For an edit loop, pass explicit relative selfcheck paths:

```sh
node src/selfcheck.ts src/round/next.selfcheck.ts src/round/ask.selfcheck.ts
```

`node src/selfcheck.ts --changed [ref]` selects the checks whose static imports reach a file changed since
`ref` (default `origin/main`) or in the working tree, plus tsc and eslint. A change to a core module such as
`src/models.ts` reaches most checks; a change to a leaf reaches few. A check that only drives `wf.mjs` is not
followed through the CLI: name it too. The run is bounded: `WF_SELFCHECK_JOBS` checks at a time (default
min(6, cpus/4)) and `WF_SELFCHECK_TIMEOUT_S` seconds each (default 300), after which a check is killed with its
children and reported `TIMEOUT`. Each result line ends with `[done/total]`.

A selfcheck that drives the CLI uses `wfSync(args, { cwd, env })` (or `wfAsync` when the check serves HTTP
from its own thread for wf to probe) from `src/in-process-wf.ts`, not `spawnSync(node wf.mjs ...)`: it runs the
same `run()` in a worker thread (about 0.1 s against ~1 s for a process here). Use a real process to test the
entry files themselves (`wf.mjs`, `env/wf.mjs`, an exported skill's `scripts/wf.mjs`, the hooks), anything that
needs `NODE_OPTIONS` (read at process start), and a command that must change into another directory.

This runs those files plus tsc and eslint, and labels the result **focused**, not full delivery
proof. Unknown paths refuse the whole selection before any checks start. No arguments still runs
every check, when you choose to run the complete suite. Report which checks ran and any known
failures when publishing. On failure, use the printed check path to isolate it and collect diagnostics
before another full-suite attempt.
