# Plan: a JewelryX verification skill (control CLI + feature map), used by wf rounds

Status: draft for Shay, 2026-09-27. Nothing here is built yet.

## Goal

A fresh agent in a round's worktree can drive the running JewelryX app and prove a behaviour with
one project-owned command set and one maintained feature map, instead of re-deriving login, URLs
and traps each round. wf's rounds use it in research (repro), in a new live check at validate, and
in `wf show`.

Done when:
- **The fired pain is gone** (the adoption rule in `2026-09-17-workflow-v2.md`: "No tool leaves the
  trigger table without its trigger having fired"; this skill's row fired 2026-09-27):
  - a new round's `repro/` contains no login implementation (today the five wf repros log in four
    different ways, below);
  - no round spends research budget on driving the app instead of measuring the defect
    (BJEW-461, below).
- **Measured, not graded**: step 0 and step 7 run the same replay task the way the playwright-cli
  adoption did (`2fb977b91`: 3 runs per arm, seconds, turns, cost, correct or not) and report the
  numbers next to the decision. They set no pass mark of their own.
- **Validate is independent and live**: validate returns a live `VERIFIED | NOT VERIFIED |
  INCONCLUSIVE` line from an agent that did not write the code.
- **Upkeep proven**: one `maintain-verification-skill` pass ends `clean` or `changed`.

## Constraint: the team keeps working on v1

Shay tests v2 (wf rounds plus this skill) while the team keeps running v1: the
`bug-fix-orchestrator` and `cr-implement-orchestrator` flows, their agents, `verify-b2b`,
`verify-admin`, `_shared/doctor.mjs`, `bug-reports/_FLOW.md` and the `docs/process/` it cites (JewelryX
#226 restored all of these for everyone, and #226 stays). So:

- **Nothing in this plan edits or removes a v1 file.** The new skill is added alongside v1.
- **Hiding v1 from Shay's v2 sessions is machine-local only.** Round worktrees drop v1 links through
  wf's `unlinkCompetingSkills` (`projects/jewelryx/round.mjs`). Sessions at the hub are covered by
  `~/work/jeweleryx/.pi/settings.json`. `scripts/link-tools.mjs` keeps linking v1 for everyone.
- **v1 moving onto the new skill is Saar's call, not a step here** (step 7).

## Why this, in short (the research behind it)

- **Lauren Tan's talk** (x.com/poteto/status/2102050467505430555, transcribed locally 2026-09-27):
  - A verification skill is two things. The first is **a CLI inside the skill directory**: "rather
    than have your agents create scripts every time, you know, that can differ between agent
    sessions, you can actually create a CLI that's within the skill directory, and your agents will
    just use that every time" [09:09–10:15].
  - The second is **a feature map**: "a form of materialized memory … what features does it have?
    How does a user reach it?", kept current by an automation [10:15–11:40].
  - The pair became "critical infrastructure for our team and we constantly maintain it" [12:02].
  - **Module and dependency boundaries are not part of the verification CLI.** She puts them in the
    code-quality layers: Dune "enforces these boundaries through the import and dependency graph"
    in CI [28:51]. Her layer order is codebase → static analysis → rules/skills → style guide
    [15:24–18:35]. That layer is a separate plan (see *Not in this plan*).
- **pstack** (github.com/cursor/plugins/tree/main/pstack; the Pi port is installed at
  `~/.pi/agent/npm/node_modules/@zenspc/pi-pstack`):
  - `create-verification-skill` fixes the skill's shape: Launch / Doctor / Drive / Evidence /
    Cleanup / Helpers, a feature map of 3–5 features with four fixed H2s, and one end-to-end proof
    before hand-over.
  - `maintain-verification-skill` fixes the upkeep:
    - one read-only source reader per feature;
    - one live pass;
    - drift, harness gap and regression sorted apart;
    - outcome `clean`, `changed` or `blocked`.
  - The worked example with a real command surface is github.com/poteto/verification-skill-example
    (`control-atlas.mjs`: doctor, per-checkout isolation, snapshot, screenshot, click, press,
    wait-settle, network-log, trace).
- **JewelryX today**, measured by reading the repo on 2026-09-27:
  - **Four login styles in five repros:**
    - `fix-bjew-603` imports `loginB2B`;
    - `fix-role-assign-dialog` imports `loginAdmin`;
    - both `fix-tjew682-*` fill the OTP from the DEV banner inline;
    - `feat-tjew-700` has its own `fetch` + `dev_otp_code` login.

    Each also has its own `playwright.config.ts`.
  - **Traps rediscovered each time** are only written as prose in `docs/agents/testing.md`:
    - the hydration trap (`networkidle` before submit);
    - `localhost` resolving to `::1`;
    - the `PARAGLIDE_LOCALE` cookie;
    - the wrong port;
    - `import.meta` breaking helpers imported from `repro/`, which cost a whole research budget
      in the BJEW-461 spike (`wf/projects/jewelryx/round.mjs`).
  - **The pieces exist, scattered:**
    - `wf/projects/jewelryx/show.mjs` logs in and opens a page. It is project knowledge living in
      wf, against wf's AGENTS.md rule that such facts live in the project.
    - `JewelryX-Tools/skills/verify-{b2b,admin}/` has pstack-shaped sections, 10 feature files and
      `_shared/doctor.mjs`. It dates from 2026-09-08, predates wf's per-worktree stacks (it
      launches `:8001`), and has no CLI.
    - `verification/tests/support/auth.ts` has the login code.
    - `verification/screen-facts/` has 17 user-view files. One records 16 tutorial routes broken
      on one admin page in six days, so a map without upkeep rots fast.
  - **The typed API client already exists.** A hey-api SDK is generated from
    `packages/backend/openapi.json` (398 operations). It is the backend read-back channel; no
    Stainless or MCP is needed.
- **wf today**: validate is read-only by rule ("Do not run anything", `prompts/validate.md`). The
  only look at the running app after a fix is Shay's own, through `wf show`. The earlier review
  found this to be wf's largest verification gap.
- **Papers.** All five exist at the cited arXiv ids. None compares workflow designs. They agree on:
  - acceptance on an executable check against observed state, never the agent's reply
    (Jarmak 2608.13867 §4.1/§8.2: a self-verdict was accepted in 100% of cycles, and 56% of those
    cycles gained nothing);
  - an independent verifier where the producer can't see its own mistake (Jarmak ch.18.1);
  - structure over prose instructions (Jarmak; Park 2609.24234);
  - "measure against the cheapest credible baseline" (Jarmak), which is why step 0 exists.
- **The adoption rule already exists.** `2026-09-17-workflow-v2.md`, *Adopt only when the named
  pain appears*: a tool is adopted when its named pain has fired, not on a new threshold. This
  skill has its own row there (fired 2026-09-27, evidence above). The existing
  `Midscene · Playwright Agents · wf drive` row does not cover it: that trigger is the human's T3
  drive being skipped, not agents re-deriving the harness.

## Decisions taken

| Decision | Choice | Why |
|---|---|---|
| Where the skill lives | `docs/agents/verify-jewelryx/` in JewelryX, **committed**. It is linked into `.pi/skills`, `.claude/skills` and `.agents/skills` by wf's round setup, in Shay's worktrees only (step 5a), not by `scripts/link-tools.mjs`. | pstack's default (`.pi/skills/verify-<app>/`) is gitignored in JewelryX (`.gitignore:249-251`). `docs/agents/` is where wf already reads project facts (wf AGENTS.md). The CLI sits inside the skill folder, as in the talk. Linking through `link-tools` would show the team a second "verify B2B" skill next to v1's before step 7 (*Constraint*; decided 2026-09-27, while building step 3). |
| Old verify skills | `JewelryX-Tools/skills/verify-{b2b,admin}` stay for v1. v2 stops using them: hidden in Shay's round worktrees and hub sessions only (step 5e). Deprecation for everyone happens only if Saar moves v1 onto the new skill (step 7). | Two skills that both answer "verify B2B" would make agents pick at random. v1's bug-fixer drives the app through them (`JewelryX-Tools/Bug-Fix/agents/bug-fixer.md:234`, `JewelryX-Tools/README.md:77`), and the team still runs v1. |
| Driver | The persistent browser behind playwright-cli, or our own CDP browser (step 2 decides). Not a new automation library. | pstack and `control-ui`: "existing harnesses first". playwright-cli is already adopted, with a measured win. |
| Backend channel | The generated hey-api SDK, called from the CLI | It already exists and validates responses. The Stainless-style code mode was checked and rejected (see *Not in this plan*). |
| Scope of the first cut | Correctness only: drive, observe, evidence | Performance traces were her origin story, but JewelryX has no perf problem on record. Add `trace` when a perf ticket arrives. |

## pstack skills this needs

Only these. pstack is installed in Pi but disabled (`settings.json`: the `@zenspc/pi-pstack` entry
has `"skills": []`, and extension-manager lists it as disabled). The Pi port matches upstream except
for paths (`.cursor/skills` → `.pi/skills`) and the `/skill:` prefix (diffed 2026-09-27).

| Skill | Source | Used for | When | Adaptation |
|---|---|---|---|---|
| `create-verification-skill` (+ `references/feature-map-example/`) | pstack | The generator. It interviews the repo, writes SKILL.md with Launch/Doctor/Drive/Evidence/Cleanup/Helpers, seeds 3–5 feature files and proves the result once end to end | Once, step 3–4 | Point it at `docs/agents/verify-jewelryx/`, not `.pi/skills/`. Tell it the CLI is `control-jewelryx.mjs` and give it the step-2 decision. |
| `maintain-verification-skill` | pstack | The upkeep loop: one source reader per feature, a live pass, then drift, harness gap or regression, then `clean`, `changed` or `blocked` | Step 6, then on demand | "one PR" means one chore branch outside a round. Its source wave uses pi's `subagent`. |
| `principle-prove-it-works` | pstack | The proof bar the live validate applies: the real artifact, not a proxy; script the check | Referenced from the validate prompt (step 5d) | None. |
| `verify-this` | cursor-team-kit (same repo; pstack's shipping playbook uses it) | The verdict protocol: restate the claim so it can be falsified; one verdict out of `VERIFIED`, `NOT VERIFIED`, `INCONCLUSIVE` | Step 5d | Baseline is the research agent's recorded red run, not a second stack (one stack per round). |
| `control-ui` | cursor-team-kit | Reference only: harness rules (pick the page by stable marker, one action then a fresh snapshot, clean up what you started) | Step 3, read by whoever builds the CLI | Not installed. Its rules go into our SKILL.md where they apply. |

**Read but not adopted:**
- `principle-build-the-lever` and `principle-encode-lessons-in-structure` are the reasoning behind a
  CLI over per-session scripts.
- `poteto-mode/playbooks/shipping.md` ("a verdict from an agent that did not write the code") is
  the reasoning behind 5d.
- benny's `control-adapter.md` is the capability checklist. From it we take doctor, fail closed, and
  evidence that survives cleanup. We skip recording.

**Not needed:**
- `poteto-mode` and its playbooks. `principle-never-block-on-the-human` conflicts with wf's Asks and
  class C.
- `swarm` (cloud workers); `blast-radius` could come later for class B.
- `arena`, `why`, `how`, `recall`, `reflect`, `show-me-your-work`, `unslop`, the benny automations.

## Steps

Each step says what, why, and how it is checked. Steps 1–4 happen in JewelryX on a `tools/` branch
(not a round: "harness trouble is not round trouble", round SKILL.md). Step 5 is wf.

### 0. Measure the baseline before building anything

- **What:**
  - Choose one past repro task: TJEW-682's auction-picker bug, rewound to its base commit.
  - Run it as a fresh research agent with today's prompt, 3 times.
  - Measure it the way `2fb977b91` measured playwright-cli: same model for both arms, and per run
    record seconds, turns, cost, and whether the result was correct. Here "correct" means the
    repro went red on the defect's own assertion, not on a precondition. Also note how it logged
    in.
  - No pass mark. The decision in step 7 follows the adoption rule (the fired pain is gone), and
    these numbers are reported next to it.
- **Why:**
  - None of the papers measures a workflow change (Kapetanovic 2608.30701 §3: "open problem"). Our
    own measurement is the only evidence we will get.
  - Jarmak asks for a comparison against the cheapest baseline.
  - The method is the one already used for playwright-cli, so the two results can be compared.
- **Check:** the three runs are written down in the tools branch's notes before step 1.
- **Result (2026-09-27), arm A, 3 valid runs** (`C:/Users/Shay/work/wf-bench/replay682/README.md`):
  - **Medians:** 460 s, 45 turns including sub-agents, $1.04.
  - **Correctness:**
    - 2 of 3 runs went red on the defect's own assertions, for items 1, 4 and 5 only.
    - Run 3 spent its whole budget on getting through wizard step 1 and measured nothing, which
      is the trigger's pain, reproduced.
    - Items 2 and 3 were measured in no run.
  - **Login:** every repro wrote its own `login()` (11–12 lines).
  - **Harness defects found, not fixed by this plan:**
    - `subagent_interrupt` did not stop an agent, so an interrupted dispatch ran a full phase.
    - A `codebase-locator` hung for 775 s.

### 1. Turn on the three pstack skills in Pi

- **What:** in `~/.pi/agent/settings.json`, give the `@zenspc/pi-pstack` entry the skill list
  `create-verification-skill`, `maintain-verification-skill`, `principle-prove-it-works`, and drop
  it from extension-manager's disabled list. `verify-this` is vendored into the skill folder as
  `references/verify-this.md`, since it is not in the Pi port.
- **Why:**
  - Enable only what the plan uses. The full pack brings 40+ skills whose descriptions compete
    with wf's round skill; `poteto-mode` is one example.
- **Check:** a fresh pi session lists exactly those three pstack skills.

### 2. Decide the driver (spike, ≤½ day)

- **What:** find the way a sequence of separate CLI calls can share one logged-in browser for this
  worktree. Try two options:
  - **(a) playwright-cli's own session.** `control-jewelryx login` drives it through its commands, or
    loads a storage state into it.
  - **(b) Our own Chromium with a remote-debugging port.** Each command uses `connectOverCDP`, as
    `control-atlas` and `control-ui` do.
    - Port `P+40000` (50000–59999). This avoids mongo's `P+30000` (`STACK.md`) and the app ports.

  Choose (a) if it passes, because agents already know playwright-cli from `testing.md`.
- **Pass criteria:**
  - `login seller`, then `open b2b /...`, then `screenshot`, run as three processes, act on one
    logged-in page;
  - an agent can still explore that same page with playwright-cli;
  - two worktrees never share a browser.
- **Why:**
  - The talk's CLI is reproducible because its commands act on a known instance (control-glass is a
    CDP driver).
  - pstack's `create-verification-skill` says "existing harnesses first", so we must not build a
    second driver when the adopted one would do.
- **Check:** the three-process sequence works in two worktrees at once. The spike's code is
  thrown away.
- **Result (2026-09-27): (a), playwright-cli's own session.** It passed all three criteria. Notes
  and the working snippets are in `C:/Users/Shay/work/wf-bench/spike-driver/`.
  - **One logged-in page across processes.** `open`, a `run-code` login, then separate `goto`,
    `screenshot` and `eval` calls all acted on one page, and `/b2b/orders` did not bounce to
    login. Login took 7 s warm and 23 s on a cold vite.
  - **Agents share it with no flags.** The CLI uses the `default` session, so an agent's plain
    `playwright-cli snapshot` sees the logged-in page.
  - **Worktrees are isolated by construction.** playwright-cli keys sessions by the nearest
    `.playwright/` folder, or else by its own install root, which is inside each worktree's
    `verification/node_modules` (`playwright-core/lib/tools/cli-client/registry.js`,
    `findWorkspaceDir`). A second worktree saw `(no browsers)` while the first was logged in.
    Two agents in *one* worktree do share a browser, which is how step 0's run 1 collided.
  - **Specs skip login entirely.** `state-save` writes a storageState with the httpOnly
    `b2b_access_token` and `b2b_refresh_token` cookies. A spec with only
    `test.use({ storageState })` started on `/b2b/orders` logged in and passed in 1.1 s.
  - **Gotchas for step 3:**
    - `run-code` runs in a sandbox with no `process`, so the CLI templates values into the snippet.
    - The browser never calls `/2fa/send`; the SvelteKit server does. The code is read from the DEV
      banner (`span.font-mono.tracking-widest`), as `verification/tests/support/auth.ts` does.
    - A headless session closes after an hour idle.
    - `dev` has no `@playwright/cli` installed (its `verification/node_modules` predates
      `2fb977b91`); round worktrees get it from `wf new`.

### 3. Build `control-jewelryx` and its SKILL.md

- **What:** `docs/agents/verify-jewelryx/control-jewelryx.mjs`, a Node script with no new
  dependencies (it uses `verification/node_modules`). It is generated and then hand-checked with
  `/skill:create-verification-skill`.
- **Where the stack is:** the CLI reads the URLs from `.verify-stack.env` at the worktree root.
  - The project's own setup `env` step (`wf/projects/jewelryx/env.mjs`) writes that file for wf
    worktrees.
  - Outside wf, the same variables are set by hand.
  - The CLI never imports wf, so the project owns its facts and Saar can use it without wf.

| Command | Replaces (evidence) |
|---|---|
| `doctor` | `JewelryX-Tools/skills/_shared/doctor.mjs`, the wrong-port trap. Checks: stack answers, `openapi.json` up, `OTP_DEV_EXPOSE`, `seed_fixtures --check`, Playwright present, browser owned by this worktree |
| `login <buyer\|seller\|admin>` | four login styles in five repros. Handles the hydration trap and the OTP banner |
| `auth <role> --out <file>` | login code in repros. Writes a storageState for specs |
| `open <b2b\|admin> <path> [--headed]` | hand-built URLs; `wf show`'s internals |
| `locale <he\|en>`, `viewport <mobile\|desktop>` | the `PARAGLIDE_LOCALE` trap; `resize 390 844` |
| `snapshot`, `screenshot [--el <ref>]`, `console`, `network` | ad-hoc evidence. Writes to one folder, `.verify/evidence/<run>/`, which survives cleanup |
| `api <operationId> [json]` | hand-written `fetch` read-backs (`feat-tjew-700`). Calls the hey-api SDK with the role's cookie |
| `reseed` | resetting state for a second repro attempt (wraps the project's seeder) |
| `cleanup` | killing what this run started. Never kills by process name (pstack Cleanup) |

- **Why:**
  - Each command removes a mistake or a piece of re-derivation found in the repo (the right column).
  - Anything with no evidence behind it is left out: recording, trace, feature flags.
  - The talk's reason for a CLI is that commands stay the same between agent sessions.
- **Check:** `create-verification-skill` step 4 runs end to end: launch, doctor, drive one feature,
  evidence, cleanup, and the evidence still exists after cleanup. In addition, `login` works for
  all three roles, and `api <the order-read operation> ORD-0003` returns the seeded order.
- **Result (2026-09-27): built, JewelryX `tools/verify-jewelryx` `713ac85c4`.**
  - Every command in the table works against a live stack, with 6 unit tests on the pure parts.
    Timings: `doctor` 0 s warm; a role login about 7 s warm; `auth` 5 s. A spec that only loads the
    saved login passes in 1 s. `api listOrders --as buyer` returns `ORD-0001`. `reseed` takes 0.8 s.
  - **Three traps, each now handled by a command:**
    - Git Bash rewrites `/products` into a Windows path, so paths are written without the slash and
      a rewritten one is named.
    - Switching roles in one browser raced the logged-in page's `cart_count` poll, which minted a
      new access cookie from the refresh cookie. Login now clears cookies from `about:blank`.
    - The SDK's `dist` is built for a bundler (no import extensions), so `api` resolves imports the
      way a bundler would.
  - Not linked into any tool folder yet: step 5a does it, in wf's round setup.

### 4. Seed the feature map: 4 features

- **What:** `docs/agents/verify-jewelryx/features/README.md` plus four files in pstack's shape:
  - a title and one paragraph;
  - `Sub-features`;
  - `How to get to it (user POV)`;
  - `Driving it with control-jewelryx`;
  - `Gotchas`.

  The four features are the ones wf rounds actually touched:

  | Feature | Rounds that touched it |
  |---|---|
  | auction wizard | TJEW-682 ×2 |
  | catalog / product card | BJEW-603 |
  | admin permissions / roles | role-assign |
  | orders | BJEW-461 |

  Seed the content from `JewelryX-Tools/skills/verify-*/features/` and `verification/screen-facts/`.
  The README records `verified at <sha>`.
- **Why:**
  - The talk: vague reports are only usable when the agent knows the feature map [10:32–11:40].
  - pstack: start with the top 3–5.
  - Jarmak: "Evidence without revision identity is stale", so the map records the commit it was
    last proven against.
  - The map is **not a spec**. It says how to reach and drive a feature and what ends up visible.
    Invariants stay in tests. This is the line drawn in the ChatGPT discussion ("a capability
    index, not tests in prose").
- **Check:** one `/skill:maintain-verification-skill` pass (step 6) drives all four live.

### 5. Wire it into wf (project folder first, core only where it must change)

- **5a. Research uses it.**
  - **What:**
    - `projects/jewelryx/prompts/research.md` points to the skill: read `features/README.md`, run
      `doctor`, drive with `control-jewelryx`, and explore with playwright-cli on the same browser.
    - `newRound` (`projects/jewelryx/round.mjs`) links `docs/agents/verify-jewelryx` into the round
      worktree's `.pi/skills`, `.claude/skills` and `.agents/skills`.
    - The project's setup `env` step writes `.verify-stack.env` with the worktree's direct URLs.
  - **Why:** research spends most of its budget re-deriving setup (the BJEW-461 spike).
- **5b. Repros stop logging in.**
  - **What:** `writeReproConfig` (`projects/jewelryx/round.mjs`) writes a `globalSetup` that runs
    `control-jewelryx auth <role>`, and a `use.storageState`, so a repro holds only the defect's own
    steps.
  - **Why:** four login styles in five repros, and the `import.meta` limit on `repro/` imports.
- **5c. `wf show` becomes a thin call.**
  - **What:** `show.mjs` parses the `open:` line and calls `control-jewelryx login <as>` then
    `open <app> <path> --headed`. It keeps its parsing and its selfcheck.
  - **Why:** the login-and-open knowledge moves into the project (wf AGENTS.md: "A project's facts
    that hold without wf … live in that project's own repo").
- **5d. Validate checks it live.**
  - **What:**
    - Core gets one new project export, `verifySkill` (the skill path). This is the export rule in wf
      AGENTS.md: core needs it now.
    - `prompts/validate.md` gains a `## Live` section that applies when the project exports
      `verifySkill`:
      - match the Intent lines to feature files;
      - drive each through the skill;
      - write one `verify-this` verdict per Intent line.
    - Its evidence goes to the round's `proof/`.
    - The rule "Do not run anything" narrows to "run nothing but the verification skill".
    - Tool budget rises from 15 to about 30.
  - **Why:**
    - Validate today judges the diff only, and the only live check is Shay's.
    - The papers and pstack agree the verdict must come from an agent that did not write the code
      (Jarmak ch.18.1; pstack shipping playbook).
    - It also checks the build against the requester's Intent in the real app, not only the plan.
- **5e. Hide the old verify skills from v2 only.**
  - **What:**
    - Add `verify-b2b` and `verify-admin` to `COMPETING_SKILLS` in `projects/jewelryx/round.mjs`,
      so `unlinkCompetingSkills` removes their links in round worktrees.
    - Add the same two to the exclusion list in `~/work/jeweleryx/.pi/settings.json`.
    - `scripts/link-tools.mjs` is not touched: it still links them for everyone.
  - **Why:** otherwise two skills would claim the same job in Shay's sessions, and the team's v1
    flows need the old ones (*Constraint*).
- **Check (wf AGENTS.md):**
  - `node selfcheck.mjs` is green, with new pure checks for the globalSetup text and the `open:` →
    command mapping.
  - Then one real cycle from the editing clone: `node wf.mjs hook install`, `wf new bench/verify`,
    confirm the stack answers, `control-jewelryx doctor`, `wf show`,
    `WF_FORCE_REAP=1 … reap bench/verify`, then `wf hook install` from the installed copy.
  - Then one real round.

### 6. Upkeep: run maintain when drift shows, not on a calendar

- **What:** run `/skill:maintain-verification-skill` once after step 5, and then whenever one of
  these happens:
  - a research or validate agent reports that the map and the app disagree (the validate `## Live`
    section asks it to flag that);
  - `verified at <sha>` is far behind and a sweep is due.

  `changed` ships as one PR on a chore branch. Product regressions it finds become tickets, never
  map edits.
- **Why:**
  - pstack sets no cadence.
  - The screen-facts record (16 routes broken in 6 days) says drift is fast.
  - A calendar job is machinery we have no evidence for yet.
  - The drift signal comes free from agents that are already driving the app.
- **Check:** the first pass ends `clean` or `changed` and says what it covered.

### 7. Measure again, then decide the deprecation

- **What:**
  - Rerun step 0's task with the skill, 3 runs, measured the same way.
  - Run the next 5 real rounds with it, and count:
    - repros that contain login or URL code;
    - BLOCKEDs, or research budget spent, on driving the app (login, URLs, repro config). These
      are not the same as wf's own markdown-parsing BLOCKEDs, which this skill does not address;
    - turns in research;
    - validate `NOT VERIFIED` / `INCONCLUSIVE` verdicts;
    - map drift reports.
- **Decide by the adoption rule:**
  - **The fired pain is gone** (the first two counts are zero): the skill stays for v2, and the v2
    trigger row is marked ADOPTED. Nothing of v1's is deleted. Show Saar the numbers and offer v1's
    bug-fixer the new skill. Retiring `verify-{b2b,admin}` and `_shared/doctor.mjs` for everyone
    happens only if he moves v1 over.
  - **It is not gone:** write down which command or map entry failed, and fix that one thing or
    drop it.
  - The replay numbers and the other counts are reported next to the decision. They are evidence,
    not a gate.
- **Why:** the wf evidence base is 5 rounds over about a week. Every "this helps" claim is
  provisional until counted.

## Not in this plan (and why)

- **Structural checks** (`lint-imports`, `fallow audit --base`, oxlint in `wf check`, svelte-check
  flags, waiting on CI before merge): the talk's static-analysis layer, a different job. JewelryX
  already has most of it (import-linter, fallow, anti-slop). It gets its own plan.
- **Stainless / MCP "code mode", WebMCP:**
  - Code mode helps agents with no shell or with too many tools, and neither applies here.
  - Stainless's hosted products are winding down (announced 2026-05-18).
  - The "94–97% accuracy" figure ChatGPT cited does not appear in Stainless's post.
  - WebMCP is an origin trial and would add a second action path to keep honest.
- **`trace`, recording, feature flags, swarm sweeps:** no incident asks for them yet.
- **The `verification/` corpus** (472k lines, gates nothing): it is Saar's programme and needs a
  conversation, not a plan step. This plan neither reads nor writes it, except for reusing
  `tests/support/auth.ts` knowledge.
- **The other wf changes from the review** (repro red on base, a lighter Class A, classifying B by
  shape, validating the PLAN format when it is written, hiding round folders from agent search,
  deleting the decision framework): separate, smaller changes.

- **Part A's wf side and Part B** (Shay, 2026-09-27: dropped; this plan takes priority):
  - the unpushed wf branch `process-from-project` (`0572769`, wf reading the method docs from the
    project) is not merged;
  - the decision-record fold into `verification/sources/` is not done.

  JewelryX #226 stays merged, because v1 depends on it (*Constraint*). wf keeps its own `process/`.

## Risks

- **The CLI turns into a framework.** Guard: every command must name the incident or the repeated
  code it replaces, as the table in step 3 does. A command with nothing in that column is not added.
- **The map drifts silently.** Guard: agents that already drive the app report drift (step 6).
  `verified at <sha>` makes staleness visible.
- **Live validate is slow or flaky.** Guard: the step-7 counts.
  - `INCONCLUSIVE` is allowed and goes to Shay. It never blocks the round silently.
  - If flakes dominate, the live section falls back to the repro rerun only.
- **The CDP port or browser leaks across worktrees.** Guard: the step-2 pass criteria, and
  `cleanup` kills only what this run started.

## Decided (2026-09-27; Shay handed the direction over)

1. **Step 0 task:** `fix/tjew682-auction-pickers`. It logs in inline, it has a 163-line repro,
   and its round recorded two BLOCKEDs about what the repro measured.
2. **5d model:** `## Live` runs on Sonnet, like validate today. If step 7 finds that
   `INCONCLUSIVE` comes from the model rather than the app, switch that section to Opus.
3. **Saar:** he is not affected until step 7, because v1 is untouched and the hiding is
   machine-local. At step 7 he gets the numbers and the offer.
