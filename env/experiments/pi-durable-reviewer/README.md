# pi-durable read-only reviewer — experiment (wf issue #116)

Status: **optional, removable, not adopted.** This is a bounded experiment for #114/#115, run in a
worktree. It changes no production round state, approvals, hooks, or reviewer dispatch, and wf core
does not import it.

It tests whether [`@earendil-works/pi-durable`](https://github.com/earendil-works/pi) makes agent work
cheap to reconnect to and steer: unfinished-work recovery and durable coordination, not merely saving
chat (ordinary Pi already persists sessions).

## What runs, and where

- A **separate local Node process** (`src/runner.ts`) started and resumed from a terminal. It is not a
  Pi extension, not a cloud service, and there is no server, dashboard, or daemon.
- The worker reviews a **fixed diff and working agreement** captured once and stored in SQLite. Its
  tools are read-only; a `ToolTask` hook blocks any tool name outside the fixed set.
- **One process owns the database at a time.** The owner publishes an `owner.lock` file (PID) beside
  the database and refuses a second live owner; inspection and steering go through the running owner's
  local control socket, never by opening the database from a second process. Publication is atomic: a
  complete lock is written to a unique temporary file and hard-linked into place. A short-lived
  `owner.lock.acquiring` guard serializes the read-decide-publish section (so a stale observer cannot
  delete the winner's fresh lock) and is released before the review starts. Each acquisition carries a
  token, so a released handle cannot delete a newer acquisition by the same process. An unreadable
  lock or an existing guard fails closed with a manual-recovery instruction (2026-10-09 hardening; see
  `test/owner-lock.ts`).
- The **SQLite database lives outside both the reviewed worktree and this checkout** (`--storage`).
  The runner resolves symlinks and refuses a `--storage` inside either, before creating the directory
  or the database. The tests use a temp directory; nothing durable is committed.
- Storage backend: `openNodeSqliteStorage` (WAL, `synchronous = NORMAL`), the package's documented
  crash-safe mode — commits survive a process crash, the newest may be lost on power/host failure.
  This experiment proves process-crash recovery, not power-loss.

Dependencies are pinned and installed **only here** (`node_modules/` under this folder, git-ignored):

| package | version |
|---|---|
| `@earendil-works/pi-durable` | `1.1.0` |
| `@earendil-works/pi-ai` | `1.1.0` |
| `@earendil-works/chord` | `1.1.0` |

## Read-only enforcement (by construction)

The reviewer's tools are exactly `read`, `list_files`, `git` (an allowlisted, shell-free argv
builder), and `review_target` (returns the frozen diff and agreement). There is no `write`, `edit`, or
`bash` tool, no unrestricted shell, and no push/merge/tracker tool. A `ToolTask.beforeTool` hook blocks
any tool name outside the set, so even a stored agent that selected more cannot reach one. The
worker's own database writes are unaffected (they are the host's, not the model's).

A `NodeExecutionEnv` `cwd` does **not** confine paths, so the containment is enforced at the tools that
promise it (2026-10-09 hardening):

- `read` and `list_files` resolve the requested path against the checkout and refuse `..`, an absolute
  path outside it, or a symlink that resolves outside it (`containedPath` in `src/path-safety.ts`).
- `read` checks the canonical file's size before reading it and refuses a file over a 4 MiB cap, so an
  in-checkout symlink to an oversized file cannot slip past it; `list_files` pages the directory
  through `openDirReader` and shows at most 2000 entries. Untracked capture also refuses an untracked
  file over 4 MiB rather than reading it whole to hash it.
- `git` accepts only the six allowlisted subcommands and a ref matching a pattern whose first character
  is not `-`, so an option such as `--ext-diff` cannot be smuggled through `ref`. Every argv adds
  `--no-optional-locks -c core.fsmonitor=false`, and `diff`/`show` add `--no-ext-diff --no-textconv`,
  so repository-configured external diff, textconv and fsmonitor programs cannot run or mutate the
  checkout during a read (a configured `diff.external` was observed mutating it). The child gets a
  sanitized environment with every `GIT_*` variable removed, so `GIT_DIR`/`GIT_WORK_TREE`/`GIT_CONFIG_*`
  in the environment cannot redirect git to another repository or inject configuration.
- `captureReviewTarget` runs the same hardened argv and **refuses** an unreadable repository or base
  ref instead of hashing git's error text as a valid diff. A selection over the 400 000-character
  review budget is marked `partial`; `ensureReviewTarget` refuses to start a review from it, so an
  unseen whole diff is never presented as a reviewed result.

## Run it

```bash
cd env/experiments/pi-durable-reviewer
npm install                 # only here; never in wf's root graph

# Start the owner in a foreground terminal (real model, pinned):
node src/runner.ts --storage /path/outside/repo --worktree /path/to/checkout \
  --agreement /path/to/AGREEMENT.md --base HEAD --provider opencode-go --model deepseek-v4.1-flash

# From another terminal, against the same --storage:
node src/cli.ts --storage /path/outside/repo status
node src/cli.ts --storage /path/outside/repo transcript 40
node src/cli.ts --storage /path/outside/repo steer "Focus on responsibility ownership and coupling."
node src/cli.ts --storage /path/outside/repo result
node src/cli.ts --storage /path/outside/repo stop

# Deterministic process-kill recovery (faux provider, no network):
node test/kill-recovery.ts
# Identity, invalid-capture and read-only-interface regression tests (no network):
node test/hardening.ts
# Concurrent and abrupt-kill owner-lock acquisition (no network):
node test/owner-lock.ts
# One real read-only review (needs OPENCODE_API_KEY in the environment):
node test/real-review.ts
```

`--provider faux` (with `--probes`) adds two test-only interruption tools; the default provider is
`opencode-go`. The runner prints `model <provider>/<modelId>` at start; the model is never switched
silently.

## Identity and staleness

- `requestId = review:<sha256(worktree + base + agreementPath)[:16]>` — stable across content
  changes, so a restart re-finds the same submission instead of submitting a second review. The
  worktree path is part of the hash, so moving the checkout produces a different request ID and cannot
  reconnect the same submission even when the content matches; relocation is not supported. A caller
  wanting a fresh review of new content changes the agreement path or base.
- The captured identity holds `headSha`, `diffHash` and `agreementHash`. The selection the hash covers
  is the tracked diff **plus every nonignored untracked file** (with its full-content hash), because
  `git diff` omits untracked files and a new source file otherwise left the review looking fresh
  (2026-10-09). The hash is over the whole selection, not only the truncated text the model is shown.
- `result` re-reads the worktree and reports `stale: true` when any hash differs, or when the worktree
  cannot be read at all (an unreadable current target is stale, never a valid same-error identity). A
  stale result is never presented as approval of current code. This does **not** replace #106; it is a
  content-hash freshness check, not an approval mechanism.

## Evidence

### 1. Process-kill recovery — deterministic faux provider

`node test/kill-recovery.ts` spawns the **actual runner** three times and SIGKILLs it twice mid-tool,
reopening the **actual SQLite storage** each time:

1. Start with a hold inside `read` (replay-safe). SIGKILL while the read runs. A second live owner is
   refused.
2. Reopen: the replay-safe `read` **reruns to completion** (not `interrupted`); the same submission is
   re-found; steer the busy owner twice with the same text so both queue as distinct submissions;
   SIGKILL while a non-replay-safe probe holds.
3. Reopen: the unsafe tool settles as **`interrupted`** (visible in the transcript); the **queued
   steer is placed**; the review finishes; the transcript is read back through the control socket; the
   result names the identity; changing the worktree makes the result **stale**.

Observed (all green):

```
  ok   process 1 reaches the read tool
  ok   a second owner is refused while the first is alive
  ok   process 1 submitted the review
  ok   process 1 was killed abruptly (SIGKILL)
  ok   the owner lock survives the abrupt kill
  ok   the interrupted replay-safe read reruns and completes
  ok   the review was not submitted a second time
  ok   steering the busy owner is accepted
  ok   a second identical steer is a distinct submission, not a silent duplicate
  ok   the owner reports both steers queued
  ok   process 2 was killed abruptly (SIGKILL)
  ok   the recovered run settles
  ok   the review was not submitted a third time
  ok   the result names the fixed review identity
  ok   the result is not stale while the worktree is unchanged
  ok   the result carries the review answer
  ok   the transcript is inspectable after reconnecting
  ok   the queued steer survived the restart and was placed
  ok   the non-replay-safe interruption is visible
  ok   the review request was submitted exactly once
  ok   a changed worktree makes the result stale
  ok   steering an idle owner is refused instead of starting a run
  ok   the owner stops on request
```

### 2. Real read-only review — pinned model, supported credential

`node test/real-review.ts` reviews a small real diff with the pinned model
`opencode-go/deepseek-v4.1-flash`. The provider reads `OPENCODE_API_KEY` from the environment (the
supported mechanism); the test never prints or copies the key.

Observed (twice, on the committed code):

```
observed: settled done
identity: {"requestId":"review:3880cb413889be6a", ..., "diffHash":"47c8e81389066689...", "agreementHash":"42cf3f4e197e3b4b..."}
stale: false
review_target was read by the model: true
real review green
```

Two runs with different temp paths produced different `requestId`s but the **same** `diffHash` and
`agreementHash` — the identity binds to the reviewed content, not to where the checkout happens to
live. The answer (1140–1342 chars) correctly found the planted bug each time: `price - price * percent`
treats a `0..100` percentage as a fraction, produces negatives, and violates both agreement
invariants; verdict "request changes"/"Reject". Full answers are in the run logs.

### 3. Hardening regression tests — public interfaces

`node test/hardening.ts` exercises the real interfaces: `captureReviewTarget`/`targetIsStale`, the
`buildGitArgv` argv run through the same spawn the tool uses, and the `read`/`list_files` `execute`
against a real `NodeExecutionEnv`. All green:

```
  ok   a new untracked source file makes the captured result stale
  ok   the untracked file content is part of the frozen review text
  ok   an ignored untracked file does not change the identity
  ok   an invalid base refuses capture instead of hashing an error string
  ok   a directory that is not a git repository refuses capture
  ok   buildGitArgv refuses an option ref
  ok   the allowlisted git argv cannot run a repository external diff
  ok   the allowlisted git argv cannot run a repository textconv filter
  ok   the allowlisted git argv cannot run a repository fsmonitor program
  ok   containedPath keeps paths inside the checkout and refuses the rest
  ok   the read tool reads inside the checkout and refuses ../ and absolute outside paths
  ok   the list_files tool refuses a path outside the checkout
  ok   a symlink out of the checkout is refused
  ok   a change in a later file beyond the shown prefix is stale and the target is partial
  ok   the runner refuses a review target over the budget
  ok   assertOutsideRoots refuses storage inside a root and allows a path outside
  ok   storage reached through a symlink into the checkout is refused
  ok   the runner refuses --storage inside the reviewed checkout before creating it
  ok   the runner refuses --storage inside the wf checkout but outside the experiment folder
  ok   GIT_DIR in the environment cannot redirect capture to another repository
  ok   GIT_CONFIG_COUNT in the environment cannot inject an external diff
  ok   the read tool refuses a file over the byte cap before reading it
  ok   the read cap applies through an in-checkout symlink to an oversized file
  ok   an untracked file over the byte cap refuses capture instead of being read whole
  ok   the list_files tool pages a directory and reports the entry cap

all hardening checks green
```

### 4. Owner-lock concurrency — real subprocesses

`node test/owner-lock.ts` proves the atomic owner lock: an incomplete lock and an existing acquisition
guard fail closed, a second same-process acquire is refused, a released handle cannot delete a newer
acquisition, six concurrent subprocesses race to publish and exactly one wins, a stale-observer race
(the real liveness syscall is paused in a subprocess) leaves exactly one owner, and a SIGKILLed
holder's stale lock is taken over by the next owner. All green:

```
  ok   an empty lock fails closed with a recovery instruction
  ok   a failed acquire releases the acquisition guard
  ok   an existing acquisition guard fails closed
  ok   a second acquire in the same process is refused, not silently re-acquired
  ok   a released handle cannot delete a newer same-process acquisition
  ok   the newer handle releases its own lock
  ok   round 0: exactly one of six concurrent owners acquires (5 refused)
  ok   round 0: every refusal names the live owner or the acquisition guard
  ok   round 1: exactly one of six concurrent owners acquires (5 refused)
  ok   round 1: every refusal names the live owner or the acquisition guard
  ok   round 2: exactly one of six concurrent owners acquires (5 refused)
  ok   round 2: every refusal names the live owner or the acquisition guard
  ok   stale-observer race: exactly one contender acquires
  ok   stale-observer race: the second contender refuses while the guard is held
  ok   stale-observer race: the guard is released after acquisition
  ok   stale-observer race: the lock can be acquired again after the race
  ok   an abrupt kill during the review leaves no acquisition guard
  ok   an abrupt kill leaves a stale lock the next owner takes over
  ok   a released lock can be acquired again

all owner-lock checks green
```

### 5. wf checks

- `node src/selfcheck.ts` from the repo root: **41 selfchecks green** (tsc and eslint included).
- Experiment typecheck: `node ../../../node_modules/typescript/bin/tsc -p tsconfig.json` — clean.
- `node src/selfcheck.ts` with this folder's `node_modules` removed: **41 green** — wf's own check does
  not require the experiment's dependencies.

One root change makes this hold:

- `tsconfig.json`: `exclude` now also has `env/experiments`, so root `tsc` never resolves the
  experiment's dependencies.

An earlier version also skipped `node_modules` in `src/selfcheck.ts`; that was reverted (2026-10-09):
wf checks with `typescript` and `eslint` from the repo root and the pinned dependencies ship no
`*.selfcheck.ts`, so the walk finds the same 39 selfcheck files with or without the skip.

## Acceptance matrix (issue #116)

| Check | Status | Evidence |
|---|---|---|
| Starts locally with explicit worktree/storage; deps isolated | met | `--worktree`/`--storage` required; `--storage` refused inside the reviewed checkout or the wf checkout that holds the experiment (symlinks followed) before creation; 3 pinned deps installed only here; root tsc excludes `env/experiments` |
| Repo edits, unrestricted shell, delivery/tracker mutations unavailable; DB writes permitted | met | tool set is `read`/`list_files`/allowlisted `git`/`review_target`; `ToolTask` block hook; no shell tool; read/list confined by `containedPath` with a 4 MiB read cap and a paged 2000-entry list cap; git argv rejects option refs, disables external diff/textconv/fsmonitor/optional writes, and strips every `GIT_*` variable (`test/hardening.ts`) |
| Same conversation/submission recovered after abrupt kill; retry same request ID submits nothing | met | kill-recovery: one `submission` id across all three processes; "submitted exactly once"; `test/owner-lock.ts` proves one concurrent owner, stale-observer serialization and stale-lock takeover |
| Interrupted replay-safe read recovers; interruption visible; no exactly-once claim | met | read reruns after kill; unsafe probe settles `interrupted`; only process-crash recovery claimed |
| Progress/transcript inspectable after reconnecting | met | `cli transcript` over the owner socket (owner-only mode on POSIX) after restart |
| Steering at a supported boundary; committed queued steering survives restart | met | steer queued on the busy owner, survives the kill, placed after restart; an idle owner is refused and two identical steers are distinct submissions |
| Result identifies diff/agreement; changed content reported stale | met | `identity` in `result`; `stale: true` after editing the worktree, adding a nonignored untracked file, or changing a later file beyond the shown prefix; an unreadable target is stale, an invalid base refuses capture, and an over-budget target refuses review |
| Deterministic faux kill/reopen + one real review; observed vs documented separated | met | §1 and §2; §"Observed vs documented" below |
| Compare with ordinary Pi resume; record host/glue, setup, keep/change/drop | met | §"Ordinary Pi resume" below |
| No production round state/approvals/delivery/hooks/default dispatch change | met | nothing under `src/round`, `src/gates`, hooks, or dispatch touched |

## Observed vs package documentation

**Observed here** (by the tests above): a replay-safe tool reruns after a process kill; a
non-replay-safe tool settles as `interrupted`; a submission with the same `requestId` is returned, not
duplicated; a queued steer survives a process kill and is placed; the transcript and identity are
recoverable; a stored agent's model/tools/cwd survive restart; SQLite reopens after SIGKILL.

**Documented by the package, not re-verified here**: WAL `synchronous = NORMAL` commits survive
process crashes but the newest may be lost on power/host failure; storage has **no cross-process
locking** (the single-owner guard here is this prototype's own atomic hard-linked lock file, not a
library guarantee); arbitrary external side effects are not exactly-once.

## Ordinary Pi resume vs this prototype (observed exercise)

Observed with the installed Pi CLI, temp `--session-dir`, `--no-context-files --no-extensions`, pinned
`opencode-go/deepseek-v4.1-flash`:

- `pi --print --session-id compare-1 "…codeword ORANGE…"` then `--session-id compare-1 "What was the
  codeword?"` → **`ORANGE`**. Ordinary Pi persists the session and resumes it across processes.
- `pi --print --session-id compare-kill "run: sleep 40…"`, SIGKILLed ~12 s in, then resumed: the tool
  call came back **"No result provided"**, and the model had to run more shell commands to work out
  whether `sleep` had finished before answering. The interrupted tool was **not** recovered as work.

| Property | Ordinary Pi resume (observed) | This prototype (observed) |
|---|---|---|
| Conversation persistence across processes | yes | yes |
| In-flight tool call after a crash | lost ("No result provided"); model improvises | replay-safe reruns; unsafe marked `interrupted` |
| Resubmitting the same request | no dedup key | same `requestId` → same submission |
| Steering a running process from another terminal | interactive UI only | `cli steer` over a local socket |
| Inspect transcript after reconnect | session file / `--resume` UI | `cli transcript`/`status` from another terminal |
| Restart friction | `--continue`/`--session-id` | `--storage … ` re-run; recovers same conversation/submission |
| Frozen, stale-checked review identity | not a concept | `identity` + `stale` in every result |

### Keep / change / drop

- **Keep (idea worth carrying into #114/#115):** durable in-flight recovery and a frozen, content-
  hashed review identity. These are the parts ordinary Pi resume does not provide, and they map
  directly to #106/#107/#108 concerns without this prototype's harness.
- **Change (if ever adopted):** don't build a second harness. A durable reviewer is ~1200 lines of
  host/glue here (owner lock, control socket, tool allowlist, identity/staleness) on top of a library
  whose API is explicitly experimental and changes without notice. If durable recovery is wanted, it
  should come from the agent harness wf already runs (Pi sessions), not a parallel runtime with its own
  single-owner storage and no cross-process locking.
- **Drop:** the separate local process, control socket, and own SQLite as wf runtime. They do not
  simplify #114 enough: ordinary Pi already persists sessions, and the extra process adds setup and a
  second source of truth to reconcile. The prototype should be removable without touching the normal
  PI/Claude Code workflow, and it is.

## Setup and host/glue burden

- Dependencies: 3 pinned packages; `npm install` added 90 packages (isolated here).
- Code: 1186 lines in `src/` (runner 333, reviewer 409, control 109, owner-lock 164, path-safety 64,
  identity 61, cli 46) and 955 lines of tests; plus 1 small root-check edit.
- Host/glue written by hand: atomic single-owner lock, newline-JSON control socket, read-only tool set
  with an allowlist hook, path containment and byte caps, identity/staleness hashing, event printing,
  transcript formatting.
- Ordinary Pi needs none of that for session persistence and resume.

## Limitations / blockers

- Single-owner protection is this prototype's atomic hard-linked lock file plus a short-lived
  acquisition guard, with a PID liveness check; PID reuse could in principle fool it. It is **not**
  library cross-process locking. An unreadable lock fails closed and needs manual removal, and an
  abrupt kill *during acquisition* leaves the guard, which also needs manual removal (a kill during
  the long review leaves only the reclaimable main lock).
- Only process-crash recovery is claimed (WAL `synchronous = NORMAL`); power-loss is not.
- Staleness is a content-hash comparison, not the approval/content identity of #106. A selection over
  the 400 000-character review budget is refused rather than reviewed from a prefix.
- The path containment check and the read are separate syscalls, so a concurrent same-user process
  could swap a checked path for a symlink between them (TOCTOU). Containment stops accidental and
  model-driven escapes, not a concurrent same-user attacker; the review runs as one local user with no
  privilege boundary.
- The control socket is chmod 0600 only after `listen`, so it is briefly created with the process
  umask; on Windows a named pipe carries the default ACL and has no POSIX mode. The storage
  directory's permissions are the real boundary.
- Untracked capture follows `git ls-files --others --exclude-standard`; a nonignored untracked symlink
  that resolves outside the checkout refuses the capture rather than reading outside it, and an
  untracked file over the 4 MiB cap refuses the capture rather than being read whole.
- The git tool's read-only guarantee rests on the allowlist, the ref pattern, the sanitized `GIT_*`
  environment and the disabled helpers above; it is not a general sandbox for arbitrary git
  configuration. `read`'s 4 MiB cap means a larger file must be inspected with another tool.
- No GitHub/tracker side-effect reconciliation (#108), no multiplayer, no memory pipeline, no new
  universal harness interface.
- The real-provider test needs `OPENCODE_API_KEY`; it exits 2 with a gap message when absent rather
  than switching models. Real reviews cost tokens.

## Files

```
env/experiments/pi-durable-reviewer/
  package.json, package-lock.json, tsconfig.json, .gitignore
  src/identity.ts     request ID, hashes, staleness (pure)
  src/path-safety.ts  path containment, canonicalization, storage-location refusal
  src/owner-lock.ts   atomic single-owner lock with a short-lived acquisition guard
  src/control.ts      local socket server/client (newline JSON, owner-only on POSIX)
  src/reviewer.ts     frozen target, read-only tools, submission, capture
  src/runner.ts       the owner process
  src/cli.ts          the terminal client
  test/kill-recovery.ts   real SIGKILL/reopen/dedup/steer/transcript evidence
  test/owner-lock.ts      concurrent, stale-observer and abrupt-kill lock acquisition
  test/hardening.ts       identity, invalid-capture and read-only-interface regressions
  test/real-review.ts     one real read-only review (pinned model)
```
