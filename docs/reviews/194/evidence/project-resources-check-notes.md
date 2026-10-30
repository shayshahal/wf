# Explicit project resource binding — focused check notes

## Measured

- `node src/selfcheck.ts projects/lint-kit/index.selfcheck.ts projects/jewelryx/workspace-resources.selfcheck.ts projects/jewelryx/index.selfcheck.ts src/worktrees/serve-verification.selfcheck.ts`: PASS, four focused files plus tsc/eslint, 42.8s. Log: `project-resources-focused-final.log`.
- `node src/worktrees/serve-verification.selfcheck.ts`: PASS isolated after the HTTP failure below. Log: `project-resources-serve-isolated.log`.
- `projects/jewelryx/readiness-narrow.cli.selfcheck.ts`, tsc and eslint PASS in additional compatibility run. Full compatibility run is NOT green: see below.
- Lint-kit setup selfcheck uses actual pnpm frozen install against a dependency-free temporary fixture, then a mismatched package manifest. It verifies disabled lifecycle scripts, explicit none disposition, repeated release, failed frozen setup, and logs surviving deletion. It is not a fresh lint-kit repository lifecycle.
- JewelryX neutral setup selfcheck exercises real env sanitization and shared setup selection with controlled build commands/database function; no real database, frontend build or app stack was used.

## Failures and isolation

- Initial edits had deterministic TypeScript syntax errors while extracting shared setup; fixed before green focused evidence. Retained `project-resources-focused.log` and `project-resources-focused-retry.log` explain those failures.
- First syntactically valid focused run (`project-resources-focused-fixed.log`) failed serve verification at line 60: after refusing a malformed profile and preserving its record, a one-second HTTP status probe returned null instead of 200. No server stop mutation was made by this patch; only lease disposition metadata changed. An isolated rerun passed; the final focused run also passed. This does NOT establish the cause of the original unavailable HTTP probe.
- Additional compatibility run (`project-resources-serve-compatibility.log`) failed one pre-existing `serve.selfcheck.ts` assertion: copied/recycled PID refusal. The CLI did refuse the stop with the expected ownership message, but the compound assertion also requires all independent HTTP endpoints to answer and an unchanged PID file. Subsequent assertions passed, including independent process liveness. The log cannot distinguish an HTTP probe timeout from the other compound conditions; root cause remains unmeasured. Do not report this compatibility run green.

## Limits

No hooks changed by this subagent. No real JewelryX or lint-kit repository lifecycle, relocated kit export, full suite, commit or push performed. Adapter-level server teardown refuses surviving unknown ownership; the lifecycle owner must retain the checkout and use its durable recovery protocol rather than obtaining kill authority from a PID. Machine-specific database providers must honor the optional supplied log when emitting their own startup diagnostics.

## Final explicit-environment and recovery checks

Parent approved minimal optional launch-environment propagation and persisted token-scoped recovery.

- Final command: `node src/selfcheck.ts src/worktrees/serve-verification.selfcheck.ts projects/jewelryx/workspace-resources.selfcheck.ts projects/jewelryx/index.selfcheck.ts projects/lint-kit/index.selfcheck.ts projects/jewelryx/readiness-narrow.cli.selfcheck.ts`: PASS, five focused files plus tsc/eslint, 52.1s. Log: `project-resources-final-env-recovery.log`.
- Real fixture launch proves selected API profile, explicit child env marker, removal of live ambient MONGODB_URL, retained environment through the Windows hidden-hop options, token-scoped recovery from a fresh adapter instance, replacement-token refusal, repeated recovery and borrowed endpoint preservation.
- Recovery receipt `.wf/workspace-dependency.json` contains disposition and, only when owned, the exact acquisition-returned ownershipToken. It is never reconstructed by reading a possibly replaced server-owner record. Fresh recovery passes that token through the existing stopWorktreeServers identity/inventory checks. No receipt plus surviving ownership remains refused (including a crash between server acquisition and receipt publication).
- Existing round callers omit launchEnv and keep inherited launch behavior. Persistent leases still have borrowed disposition (no release authority); neutral adapters refuse those requirements.

## Additional isolated HTTP diagnosis

A temporary diagnostic copy of the existing serve lifecycle selfcheck (not a source change) logged the error and the compound ownership conditions. Logs retained:

- `project-resources-serve-compatibility-isolated-diagnostic.log`: the originally failing copied-PID condition passed, with refusal exit 1 and PID bytes unchanged. Two different active-stack HTTP conditions failed. The shell timeout was 120s; the log reached the file's final two-failures summary. The temporary copy was removed.
- `project-resources-serve-http-cause.log`: isolated diagnostic copy completed green with all arms passing. Expected shutdown probes show ECONNREFUSED/ECONNRESET. The copied-PID condition again reported exit 1, unchanged PID bytes and live independent listeners.

This narrows the observed instability to the HTTP-observation portion rather than the original refusal message or PID-file mutation in the isolated replay. It does not prove the cause of the earlier active HTTP failures: do not erase or reinterpret the retained failed runs as green. No production polling or timeout behavior was altered to hide it.
