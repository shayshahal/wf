// projects/jewelryx/evidence.ts — what one red-base run's own output shows (issue #109).
//
// wf check runs the row's test with the row's change taken back to HEAD and needs that run to fail
// (red-base, PRACTICES.md TDD). An exit code is not that proof, and neither is "some failure at the
// line the row named": reverting the fix can break an import before any assertion runs, a runner may
// be missing, a test can fail on a precondition (a login, a fixture) before the assertion the row is
// about, and the expression at the bound line can raise a NameError/AttributeError/TypeError -- all of
// which pytest reports as FAILED at that line. This module reads the runner's own report and returns
// one discriminated result:
//
//   behavioral-failure  a test the runner collected, ran and reported FAILED on a framework
//                       assertion/expectation (pytest's rewritten `assert`/`AssertionError`/`Failed`,
//                       vitest's `AssertionError`, playwright's `Error: expect(...)`), at the
//                       reviewed origin line the row named (`path::test id@<line>`). This is the only
//                       red-base proof.
//   passed              the runner reported the one selected test ran and passed, named in its own
//                       report -- the positive evidence a `refactor:` row needs. A suite total
//                       ("1 passed, 1 skipped") is not that evidence: the selected case may be the
//                       skipped one, or (the #109 review's counterexample) the selector matched an
//                       unrelated case while the row's own test was never selected. The report must
//                       name the selected case (`PASSED <nodeid>`, vitest's `✓ file > name`, and, for
//                       playwright, the JSON reporter's spec whose canonical space-joined suite/title
//                       path is the selected id).
//   runner-failure      the run never reached a behavioral result (missing executable, import/collect
//                       error, setup error, nothing collected, internal error, usage error).
//   unavailable         the run produced a report that cannot be tied to the intended assertion: no
//                       binding, a failure in another file, a non-assertion exception, a failure at
//                       another origin line, a pass that names no case or another case, a report it
//                       cannot read.
//
// Nothing here keys on a bare exit code, the substring `AssertionError`, or a generic `Error`. The
// target comes from the plan row's check cell, parsed by core (`checkCellTarget`, src/gates/check.ts)
// into `{ file, id, line, refactor }`; the run's own `cwd` and the selected test path it was given
// resolve a runner-printed path against the repo path exactly, so a look-alike suffix in another
// directory does not match. A selected task's command escapes the name literal before `-t`/`-g` and
// carries a per-test reporter (`-rA`, `--reporter=verbose`/`list`, checks.ts), so a `1 passed` total
// has a named case to tie to the row; a run that does not name it is `unavailable`.
//
// The pytest arms in evidence.selfcheck.ts are checked against real captured output (2026-10-09,
// `uv run --no-project --with pytest`, pytest 9.1.1), the vitest arms against vitest 5.0.1 and the
// playwright arms against playwright 1.61.1's `--reporter=json` (real browser-free runs, 2026-10-09).
import { isAbsolute, join } from 'node:path';
import type { CheckTarget } from '../../src/gates/check.ts';

/** The runners a JewelryX red-base task can be: pytest (backend), vitest and playwright (frontend). */
export type Runner = 'pytest' | 'vitest' | 'playwright';

/** One failing test the runner itself reported, with the provenance the result must carry. */
export type FailingTest = { id: string; error: string; source?: string; assertion: boolean };

/** Why a run never reached a behavioral failure. Every one of these fails red-base closed. */
export type RunnerFailureKind = 'no-exit-status' | 'usage-error' | 'collection-error' | 'setup-error' | 'no-tests' | 'internal-error';

/**
 * The result of reading one runner report. `behavioral-failure` is the only verdict that proves the
 * selected assertion ran; `passed` is the positive evidence a `refactor:` row needs; the rest fail
 * closed. `runner-failure`: the runner never produced a behavioral result. `unavailable`: it did, but
 * the result cannot be tied to the intended assertion.
 */
export type RunnerEvidence =
	| { verdict: 'behavioral-failure'; runner: Runner; selected: string; tests: FailingTest[]; say: string }
	| { verdict: 'passed'; runner: Runner; selected: string; test: string; summary: string; say: string }
	| { verdict: 'runner-failure'; runner: Runner; selected: string; kind: RunnerFailureKind; detail: string; say: string }
	| { verdict: 'unavailable'; runner: Runner | null; selected: string; detail: string; say: string };

/**
 * How a runner-printed path is resolved to a repo path: the task's cwd, the selected test path, and
 * the actual worktree root core ran the task in. `root` binds an absolute path -- playwright's
 * `config.rootDir` + suite/spec `file` (the actual file on disk, a TEMP-base clone root included) and
 * its error location -- so the identity is exactly `root + target.file`, never a guess from the
 * printed text, the declared cwd, or a suffix.
 */
export type RunnerContext = { cwd: string; root?: string; selected: string | null };

const clean = (s: string) => s.replace(/\x1b\[[0-9;]*m/g, '').replace(/\r\n?/g, '\n');
const trim = (s: string) => s.trim();
const norm = (p: string) => p.replace(/\\/g, '/').replace(/^\.\//, '');
const firstMatch = (lines: string[], re: RegExp): RegExpExecArray | null => lines.map((l) => re.exec(trim(l))).find((m): m is RegExpExecArray => m !== null) ?? null;
const lastMatch = (lines: string[], re: RegExp): RegExpExecArray | null => lines.map((l) => re.exec(trim(l))).filter((m): m is RegExpExecArray => m !== null).at(-1) ?? null;
// A pytest failure-block header is a run of underscores, a name, and another run: `_{3,}` so the
// nested-traceback separator (`_ _ _ _`) is not mistaken for the next block.
const PYTEST_HEADER = /^_{3,} .+ _{3,}$/;

/** Pure: how a target reads in a verdict's message: `path`, `path::test id`, `path::test id@7`. */
export function targetLabel(target: CheckTarget): string {
	return `${target.file}${target.id ? `::${target.id}` : ''}${target.line !== null ? `@${target.line}` : ''}`;
}

/**
 * Pure: whether a runner-printed path names the target file. The runner prints a path relative to its
 * own rootdir (pytest) or package (vitest), or an absolute path (playwright's `config.rootDir` +
 * suite/spec `file`, and its error location), while the plan row names the repo path. An absolute path
 * binds only when it is exactly the worktree root the task ran in plus the row's repo path -- never by
 * suffix, the task's declared cwd, or a guessed root, so a file in another worktree or directory does
 * not match. A relative path keeps the other exact ties: the repo path itself, the command's selected
 * test path when the repo path ends at it, and the path resolved from the task's cwd.
 */
export function sameTestFile(printed: string, target: CheckTarget, ctx: RunnerContext): boolean {
	const p = norm(printed);
	const t = norm(target.file);
	// An absolute report file (playwright) is compared as the worktree root plus the repo path only;
	// joining it against the declared cwd or a suffix would bind a path nobody ran. Windows compares
	// case-insensitively (a drive letter's case is not part of the identity).
	if (isAbsolute(p)) {
		if (!ctx.root) return false;
		const at = norm(join(ctx.root, t));
		return process.platform === 'win32' ? p.toLowerCase() === at.toLowerCase() : p === at;
	}
	if (p === t) return true;
	const selected = ctx.selected && norm(ctx.selected);
	if (selected && p === selected && t.endsWith(`/${selected}`)) return true;
	if (ctx.cwd && norm(join(ctx.cwd, p)) === t) return true;
	return false;
}

/** Pure: whether a runner-printed node id is the selected target (file, and test id when one is named). */
export function matchesTarget(id: string, target: CheckTarget, ctx: RunnerContext): boolean {
	const n = norm(id);
	const i = n.indexOf('::');
	const file = i < 0 ? n : n.slice(0, i);
	if (!sameTestFile(file, target, ctx)) return false;
	if (!target.id) return true;
	const name = i < 0 ? '' : n.slice(i + 2);
	return name === target.id || name.endsWith(`::${target.id}`) || name.endsWith(`/${target.id}`);
}

/**
 * Pure: why one runner-reported failing test is not the intended assertion, or null when it is. This is
 * the #109 guard: the row's `@<line>` is the reviewed origin of the assertion the fix must turn green,
 * and the run must have failed on a framework assertion at that origin. A generic exception at the
 * line (a NameError while evaluating the assertion), a failure at another line, a helper that threw,
 * and a row that names no line all fail closed -- none is proof.
 */
export function notIntendedAssertion(test: FailingTest, target: CheckTarget, ctx: RunnerContext): string | null {
	// A refactor row names no assertion to reach: its proof is that the selected test passes on both
	// sides, so any failure here is behavioral (core wants `passed`), not a binding failure.
	if (target.refactor) return null;
	if (target.line === null) return `the row names no intended assertion for ${target.file}; add @<line> to its check cell`;
	if (!test.assertion) return `the run failed with ${test.error}, not a framework assertion`;
	const m = test.source ? /^(.*):(\d+)$/.exec(test.source) : null;
	if (!m || !sameTestFile(m[1], target, ctx) || Number(m[2]) !== target.line) return `the run failed at ${test.source ?? 'no reported source'}, not at the intended assertion (${target.file} line ${target.line})`;
	return null;
}

/** Pure: which known runner a red-base task runs, or null. The split redBaseEvidence makes. */
export function runnerOf({ cmd, args }: { cmd?: string; args?: string[] }): Runner | null {
	const line = [cmd ?? '', ...(args ?? [])].join(' ');
	if (/\bpytest\b/.test(line)) return 'pytest';
	if (/\bvitest\b/.test(line)) return 'vitest';
	if (/\bplaywright\b/.test(line)) return 'playwright';
	return null;
}

/** Pure: the test path the task was given (`tests/x.py::id`, `src/x.test.ts`, `verification/x.spec.ts`). */
export function selectedTestPath(args: string[]): string | null {
	const p = args.map((a) => a.split('::')[0]).filter((a) => /\.(py|[cm]?[jt]s)$/.test(a) && /(test|spec)/.test(a)).at(-1);
	return p ?? null;
}

const behavioral = (runner: Runner, target: CheckTarget, tests: FailingTest[]): RunnerEvidence => ({
	verdict: 'behavioral-failure', runner, selected: targetLabel(target), tests,
	say: `red on ${tests.length} test the runner reported FAILED on an assertion at the intended line: ${tests.map((t) => `${t.id} (${t.error}${t.source ? ` @ ${t.source}` : ''})`).join('; ')}`,
});
const passed = (runner: Runner, target: CheckTarget, test: string, summary: string): RunnerEvidence => ({
	verdict: 'passed', runner, selected: targetLabel(target), test, summary,
	say: `the runner reported the selected test ran and passed: ${test} (${summary})`,
});
const runnerFailure = (runner: Runner, target: CheckTarget, kind: RunnerFailureKind, detail: string): RunnerEvidence => ({
	verdict: 'runner-failure', runner, selected: targetLabel(target), kind, detail, say: `${kind}: ${detail}`,
});
const unavailable = (runner: Runner | null, target: CheckTarget, detail: string): RunnerEvidence => ({
	verdict: 'unavailable', runner, selected: targetLabel(target), detail, say: `not proof of the intended defect: ${detail}`,
});

// ── pytest ───────────────────────────────────────────────────────────────────
// Real captured evidence, 2026-10-09 (`uv run --no-project --with pytest`, pytest 9.1.1):
//   0 all passed, or an ERROR at setup/teardown; 1 test FAILED; 2 an import/syntax error interrupted
//   collection; 3 an internal error; 4 the path was not found (a usage error); 5 nothing was collected.
// The `short test summary info` lines `FAILED <nodeid> - <reason>` and `ERROR <nodeid>` are the
// runner's own distinction between a test that ran (FAILED) and one that never did (ERROR).
//
// The failure block prints the traceback caller-first: the exception origin is the LAST `file.py:line:`
// line, and the exception/assertion headline is the FIRST `E ` line. A bare `assert total() == 120`
// that raises `NameError` prints the same caller line but an `E NameError:` headline -- the assertion
// never ran, and this module refuses it on the headline, not the line.

function pytestAssertion(headline: string): boolean {
	return /^(assert\b|AssertionError\b|Failed\b)/.test(headline);
}

function pytestDetail(nodeId: string, reason: string, output: string): FailingTest {
	const name = nodeId.includes('::') ? nodeId.split('::').at(-1)! : nodeId;
	const L = clean(output).split('\n');
	const at = L.findIndex((l) => PYTEST_HEADER.test(trim(l)) && l.includes(name));
	const end = at < 0 ? -1 : L.findIndex((l, i) => i > at && (/^=+ short test summary info =+$/.test(trim(l)) || PYTEST_HEADER.test(trim(l))));
	const block = at < 0 ? [] : L.slice(at, end < 0 ? undefined : end);
	const headline = firstMatch(block, /^E\s+(\S.*)$/)?.[1];
	const origin = lastMatch(block, /^(.+?\.py):(\d+):/);
	const error = headline ?? reason;
	return { id: nodeId, error, ...(origin ? { source: `${norm(origin[1])}:${origin[2]}` } : {}), assertion: pytestAssertion(error) };
}

// `-rA`'s short-summary `PASSED <nodeid>` lines name every test that ran and passed (#109 review):
// the default report has none, so a passing report without one is not positive evidence of a case.
function pytestPassedIds(output: string): string[] {
	return clean(output).split('\n').map(trim).filter((l) => /^PASSED\s+/.test(l)).map((l) => l.replace(/^PASSED\s+/, '').trim()).filter(Boolean);
}

function pytestEvidence(exit: number | null, output: string, target: CheckTarget, ctx: RunnerContext): RunnerEvidence {
	if (exit === null) return runnerFailure('pytest', target, 'no-exit-status', 'no exit status: pytest never started (missing executable or spawn failure)');
	const text = clean(output);
	const usage = text.split('\n').map(trim).find((l) => /^ERROR: (file or directory not found|usage:)/.test(l));
	if (exit === 4 || usage) return runnerFailure('pytest', target, 'usage-error', usage ?? 'pytest refused the path it was given');
	if (exit === 3) return runnerFailure('pytest', target, 'internal-error', text.split('\n').map(trim).find((l) => l) ?? 'pytest exited 3');
	if (exit === 5 || /no tests ran/.test(text)) return runnerFailure('pytest', target, 'no-tests', `${text.split('\n').map(trim).filter(Boolean).at(-1) ?? 'pytest collected nothing'} — the row's test was not collected`);
	if (exit === 2 || /error during collection/i.test(text)) {
		const err = text.split('\n').map(trim).find((l) => /^E\s+\S/.test(l))?.replace(/^E\s+/, '');
		return runnerFailure('pytest', target, 'collection-error', err ?? 'pytest could not import or collect the test module, so no assertion ran');
	}
	const summary = text.split('\n').map(trim);
	// The run's final line is `================ 1 passed in 0.04s =================` when pytest is not
	// quiet (the row's task is not: it needs `-rA`), and `1 passed in 0.04s` when it is (`-q`, the
	// suite task). Strip the decoration before reading the count.
	const summaryLine = (l: string) => l.replace(/^=+\s*/, '');
	const at = summary.findIndex((l) => /^=+ short test summary info =+$/.test(l));
	const summaryLines = at < 0 ? [] : summary.slice(at + 1);
	const failed = summaryLines.filter((l) => /^FAILED\s+/.test(l)).map((l) => {
		const body = l.replace(/^FAILED\s+/, '');
		const dash = body.indexOf(' - ');
		return { id: body.slice(0, dash < 0 ? undefined : dash).trim(), reason: dash < 0 ? '' : body.slice(dash + 3).trim() };
	});
	const errors = summaryLines.filter((l) => /^ERROR\s+/.test(l)).map((l) => l.replace(/^ERROR\s+/, '').trim());
	// A setup/teardown ERROR anywhere means the run was not clean behavioral proof, even when a target
	// test also FAILED: BJEW-461's shared setup failed before any spec ran, and #109 refuses that.
	if (errors.length) return runnerFailure('pytest', target, 'setup-error', `the run reported ${errors.length} ERROR (setup/teardown), e.g. ${errors[0]}`);
	if (exit === 0 && !failed.length) {
		const line = summary.find((l) => /^\d+ passed\b/.test(summaryLine(l)));
		const n = line ? Number(/^(\d+) passed\b/.exec(summaryLine(line))![1]) : 0;
		const other = line ? /\b\d+ (failed|error|errors|skipped|deselected|xfailed|xpassed)\b/.test(line) : false;
		if (!line) return unavailable('pytest', target, 'pytest exited 0 with no "N passed" line, so no test is shown to have run');
		// A row that names no test id ran a whole file; exactly one passing test there is its evidence.
		if (!target.id) return n === 1 && !other
			? passed('pytest', target, target.file, line)
			: unavailable('pytest', target, `${line} — the selected test is not shown to have run and passed on its own`);
		// A selected task must name the one case that ran and passed, not a suite total (#109 review).
		const distinct = [...new Set(pytestPassedIds(text).filter((id) => matchesTarget(id, target, ctx)))];
		if (distinct.length !== 1) return unavailable('pytest', target, distinct.length ? `${line} but ${distinct.length} passed tests match ${target.file}::${target.id} (${distinct.join(', ')}); the row names one test` : `${line} — the report names no PASSED test for ${target.file}::${target.id}, so the selected case is not shown to have run`);
		const name = distinct[0].includes('::') ? distinct[0].slice(distinct[0].indexOf('::') + 2) : '';
		if (name !== target.id) return unavailable('pytest', target, `the passed test ${distinct[0]} is not the selected ${target.file}::${target.id}`);
		return passed('pytest', target, distinct[0], line);
	}
	if (!failed.length) return unavailable('pytest', target, `pytest exited ${exit} with no FAILED or ERROR line to read`);
	const inTarget = failed.filter((f) => matchesTarget(f.id, target, ctx));
	if (!inTarget.length) return unavailable('pytest', target, `the run was red in another file, not ${target.file}: ${failed.map((f) => f.id).join(', ')}`);
	if (inTarget.length > 1) return unavailable('pytest', target, `${inTarget.length} tests in the target failed (${inTarget.map((f) => f.id).join(', ')}); the row names a file, not the intended assertion`);
	const detail = pytestDetail(inTarget[0].id, inTarget[0].reason, text);
	const why = notIntendedAssertion(detail, target, ctx);
	return why ? unavailable('pytest', target, why) : behavioral('pytest', target, [detail]);
}

// ── vitest ───────────────────────────────────────────────────────────────────
// Documented report shape. A file that could not load is `FAIL <file> [ <file> ]` under `Failed
// Suites`; a test that ran and failed is `FAIL <file> > <name>` under `Failed Tests`, with the
// `AssertionError:` headline and its `❯ file:line` frames top-down (origin first). Only a test-level
// FAIL on an `AssertionError` is proof; a bare `Error`/`TypeError` is not.

function vitestDetail(file: string, name: string, output: string): FailingTest {
	const L = clean(output).split('\n');
	const at = L.findIndex((l) => /^\s*FAIL\s+/.test(l) && l.includes(file) && l.includes(name));
	const block = at < 0 ? [] : L.slice(at, at + 25);
	const error = firstMatch(block, /^([A-Za-z]*Error):\s*(.+)$/)?.slice(1).join(': ');
	const origin = firstMatch(block, /(?:❯|at)\s+(.+?\.(?:test|spec)\.[cm]?[jt]s):(\d+):/);
	return { id: name ? `${norm(file)} > ${name}` : norm(file), error: error ?? 'the runner reported this test failed', ...(origin ? { source: `${norm(origin[1])}:${origin[2]}` } : {}), assertion: /^AssertionError\b/.test(error ?? '') };
}

// `--reporter=verbose`'s `✓ <file> > <name> <duration>` lines name each test that ran and passed
// (#109 review). The `↓` skipped marker and the `Tests 1 passed | 2 skipped` total are not identity:
// a run whose selected test was skipped has no ✓ line, so no case is named.
function vitestPassedTests(output: string): { file: string; name: string }[] {
	return clean(output).split('\n').flatMap((raw) => {
		const m = /^\s*(?:✓|√)\s+(.+?\.(?:test|spec)\.[cm]?[jt]s)\s+>\s+(.*)$/.exec(raw);
		return m ? [{ file: norm(m[1].trim()), name: m[2].replace(/\s+\d+(?:\.\d+)?m?s\s*$/, '').trim() }] : [];
	});
}

function vitestEvidence(exit: number | null, output: string, target: CheckTarget, ctx: RunnerContext): RunnerEvidence {
	if (exit === null) return runnerFailure('vitest', target, 'no-exit-status', 'no exit status: vitest never started (missing executable or spawn failure)');
	const text = clean(output);
	if (/No test files found/.test(text)) return runnerFailure('vitest', target, 'no-tests', 'vitest found no test files');
	const fails = text.split('\n').map(trim).filter((l) => /^FAIL\s+/.test(l)).map((l) => l.replace(/^FAIL\s+/, ''));
	const suites: string[] = [];
	const tests: { file: string; name: string }[] = [];
	for (const body of fails) {
		const suite = /^(.+?)\s+\[\s*(.+?)\s*\]$/.exec(body);
		if (suite) { suites.push(norm(suite[1])); continue; }
		const [file, ...rest] = body.split(/\s+>\s+/);
		tests.push({ file: norm(file.trim()), name: rest.join(' > ').trim() });
	}
	if (suites.some((f) => sameTestFile(f, target, ctx))) return runnerFailure('vitest', target, 'collection-error', `the target file failed to load before any test ran (Failed Suites: ${suites.find((f) => sameTestFile(f, target, ctx))})`);
	const inTarget = tests.filter((t) => sameTestFile(t.file, target, ctx) && (!target.id || t.name.includes(target.id)));
	if (!tests.length) {
		const line = text.split('\n').map(trim).find((l) => /^Tests\s/.test(l));
		const n = line ? Number(/Tests\s+(\d+) passed/.exec(line.replace(/\s+/g, ' '))?.[1] ?? 0) : 0;
		const other = line ? /(failed|skipped|todo)/.test(line) : false;
		const passing = vitestPassedTests(text).filter((t) => sameTestFile(t.file, target, ctx));
		// A selected task must name the one case that ran and passed (#109 review). The file's other
		// tests are `↓` skipped by the selector, so the summary's skipped count is not a denial: the
		// absence of the selected name is.
		if (target.id) {
			const distinct = [...new Set(passing.map((t) => t.name))];
			return exit === 0 && distinct.length === 1 && distinct[0] === target.id
				? passed('vitest', target, `${norm(target.file)} > ${target.id}`, line ?? 'the selected test passed')
				: unavailable('vitest', target, distinct.length ? `${line ?? 'the run'} — the passed test ${distinct.join(', ')} is not the selected ${target.id}` : `${line ?? 'the run'} — the selected test ${target.id} is not shown to have run and passed`);
		}
		if (exit === 0 && line && n === 1 && !other) return passed('vitest', target, target.file, line);
		return exit === 0 && line
			? unavailable('vitest', target, `${line} — the selected test is not shown to have run and passed on its own`)
			: unavailable('vitest', target, 'vitest printed no Failed Suites, Failed Tests or a single passing test to read');
	}
	if (!inTarget.length) return unavailable('vitest', target, `the run was red in another file, not ${target.file}: ${tests.map((t) => t.file).join(', ')}`);
	if (inTarget.length > 1) return unavailable('vitest', target, `${inTarget.length} tests in the target failed (${inTarget.map((t) => t.name).join(', ')}); the row names a file, not the intended assertion`);
	const detail = vitestDetail(inTarget[0].file, inTarget[0].name, text);
	const why = notIntendedAssertion(detail, target, ctx);
	return why ? unavailable('vitest', target, why) : behavioral('vitest', target, [detail]);
}

// ── playwright ───────────────────────────────────────────────────────────────
// The selected task runs `--reporter=json` (checks.ts). That reporter is the framework's own output:
// the suite tree carries the real describe/title path, and each failed result carries the error
// `message` and its `location` -- the actual assertion frame, absolute, NOT the numbered header's
// test-definition line. The list reporter flattened the path with `›` (ambiguous with a `›` inside a
// literal title) and printed the origin as free text; the JSON is parsed, never guessed.
//
// Shape (playwright 1.61.1): `{ config, suites, errors, stats }`; `config.rootDir` is the ABSOLUTE
// directory every suite/spec `file` is relative to; a suite is `{ title, file, specs, suites }` (the
// top-level file suite's title IS the file path); a spec is `{ title, file, line, tests }`; a test is
// `{ projectName, results }`; and a result is `{ status, error|errors }` with `{ message, location:
// { file, line, column } }`. The canonical case id is the space-joined describe/title path -- exactly
// what `-g` matches. Only the fields this module reads are checked, recursively; a well-formed report's
// other fields are kept unread. A report whose used fields have the wrong shape is not read at all: it
// fails closed as `unavailable`, never a throw (#109 review).

type PwLocation = { file?: string; line?: number; column?: number };
type PwError = { message?: string; location?: PwLocation };
type PwResult = { status?: string; error?: PwError; errors?: PwError[] };
type PwTest = { projectName?: string; results?: PwResult[] };
type PwSpec = { title?: string; file?: string; tests?: PwTest[] };
type PwSuite = { title?: string; file?: string; specs?: PwSpec[]; suites?: PwSuite[] };
type PwStats = { expected?: number; skipped?: number; unexpected?: number; flaky?: number };
// The reporter always writes `rootDir`, an absolute path. A report that lacks it, or carries a
// relative one, names no file this module can bind to the row's repo path, so the parser refuses it
// (the type records the invariant: `rootDir` is present and absolute).
type PwConfig = { rootDir: string };
type PwReport = { config: PwConfig; suites: PwSuite[]; errors?: PwError[]; stats?: PwStats };

const isObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
// A used field is either absent or the type it is read as: a present value of another type makes the
// whole report malformed, so the caller records `unavailable` instead of reading something that is not
// the value it thinks it is.
const fieldOk = (v: unknown, ok: (x: unknown) => boolean) => v === undefined || ok(v);
const str = (v: unknown) => typeof v === 'string';
const num = (v: unknown) => typeof v === 'number';

const pwConfigOk = (v: unknown): v is PwConfig => isObject(v) && typeof v.rootDir === 'string' && isAbsolute(v.rootDir);
const pwLocationOk = (v: unknown): boolean => isObject(v) && fieldOk(v.file, str) && fieldOk(v.line, num);
const pwErrorOk = (v: unknown): boolean => isObject(v) && fieldOk(v.message, str) && (v.location === undefined || pwLocationOk(v.location));
const pwResultOk = (v: unknown): boolean => isObject(v) && fieldOk(v.status, str)
	&& (v.error === undefined || pwErrorOk(v.error))
	&& (v.errors === undefined || (Array.isArray(v.errors) && v.errors.every(pwErrorOk)));
const pwTestOk = (v: unknown): boolean => isObject(v)
	&& (v.results === undefined || (Array.isArray(v.results) && v.results.every(pwResultOk)));
const pwSpecOk = (v: unknown): boolean => isObject(v) && fieldOk(v.title, str) && fieldOk(v.file, str)
	&& (v.tests === undefined || (Array.isArray(v.tests) && v.tests.every(pwTestOk)));
const pwSuiteOk = (v: unknown): boolean => isObject(v) && fieldOk(v.title, str) && fieldOk(v.file, str)
	&& (v.specs === undefined || (Array.isArray(v.specs) && v.specs.every(pwSpecOk)))
	&& (v.suites === undefined || (Array.isArray(v.suites) && v.suites.every(pwSuiteOk)));
const pwReportOk = (v: unknown): v is PwReport => isObject(v) && pwConfigOk(v.config) && Array.isArray(v.suites) && v.suites.every(pwSuiteOk)
	&& (v.errors === undefined || (Array.isArray(v.errors) && v.errors.every(pwErrorOk)))
	&& (v.stats === undefined || isObject(v.stats));

// Pure: the JSON report in the run's output, or null when it cannot be read. The reporter writes the
// object to stdout, so a stray warning on stderr must not turn a readable report into a throw; the
// first `{` through the last `}` is what the reporter emitted. The parsed value is taken only when
// its used fields all read (pwReportOk), never wholesale as a `PwReport`.
function playwrightReport(output: string): PwReport | null {
	const text = clean(output);
	const parse = (s: string): PwReport | null => {
		try {
			const v: unknown = JSON.parse(s);
			return pwReportOk(v) ? v : null;
		} catch {
			// Not the reporter's JSON (a truncated or non-JSON run). The caller fails closed, so the
			// reason is recorded as an unreadable report, never a false proof.
			return null;
		}
	};
	return parse(text) ?? parse(text.slice(Math.max(0, text.indexOf('{')), text.lastIndexOf('}') + 1));
}

// One collected test the reporter listed, with the outcome its own results establish and the
// assertion provenance the result must carry. `status` is the spec's own per-attempt result statuses
// aggregated: `none` when it has no executed attempt at all (a `--list` collection, dropped
// `results`/`tests`, a test with no result), `unavailable` when they disagree or carry an unknown
// status. `passed` is never read from the spec's `ok` flag or the run's totals (#109 review).
type PwOutcome = 'passed' | 'failed' | 'skipped' | 'unavailable' | 'none';
// `file` is the runner-reported path (relative to `config.rootDir`, or absolute) as it names the file
// in messages and the case id; `absolute` is that path resolved through `config.rootDir` to the actual
// file on disk, which is what binds to the row's repo path (#109 review).
type PwCase = { file: string; absolute: string; canonical: string; status: PwOutcome; error: string | null; source: string | null; assertion: boolean };

const playwrightAssertion = (message: string): boolean => /^expect\(/.test(message.replace(/^Error:\s*/, ''));

// Pure: one spec's outcome from its own tests' per-attempt results. Playwright writes one test per
// project and appends each retry to `results`; the last attempt of every test is read. A pass needs
// every attempt `passed` (a multi-project run that disagrees is not a clean pass); an explicit
// `failed` is a failure; a missing or unknown status is unavailable. The matching attempt provides
// the failure's provenance.
function specOutcome(tests: PwTest[] | undefined): { status: PwOutcome; result: PwResult | null } {
	const attempts = (tests ?? []).map((t) => t.results?.at(-1)).filter((r): r is PwResult => r !== undefined);
	if (!attempts.length) return { status: 'none', result: null };
	const statuses = attempts.map((r) => r.status);
	if (statuses.some((s) => s !== 'passed' && s !== 'failed' && s !== 'skipped')) return { status: 'unavailable', result: null };
	if (statuses.every((s) => s === 'passed')) return { status: 'passed', result: attempts[0] };
	if (statuses.includes('failed')) return { status: 'failed', result: attempts.find((r) => r.status === 'failed')! };
	if (statuses.every((s) => s === 'skipped')) return { status: 'skipped', result: null };
	return { status: 'unavailable', result: null };
}

// Pure: every spec the report names, depth-first, with its canonical space-joined title path. The
// TOP-LEVEL suite whose title is its own file path is the file node, not a describe; its children are
// the describes. A nested describe whose title happens to equal the file path is still a describe: the
// file node is only the top of the tree (#109 review).
function playwrightCases(report: PwReport): PwCase[] {
	const out: PwCase[] = [];
	const rootDir = report.config.rootDir;
	// The report's own absolute root resolves a suite/spec `file` (relative to it, or already absolute)
	// to the actual file on disk. That, not a suffix or the task's declared cwd, is what binds to the
	// row's repo path (#109 review). An absolute `file` is taken as-is rather than appended blindly.
	const absoluteFile = (file: string | undefined) => (file ? norm(isAbsolute(file) ? file : join(rootDir, file)) : '');
	const walk = (suites: PwSuite[], path: string[], top: boolean) => {
		for (const suite of suites) {
			const title = suite.title ?? '';
			const here = top && suite.file !== undefined && norm(title) === norm(suite.file) ? path : [...path, title];
			for (const spec of suite.specs ?? []) {
				const { status, result } = specOutcome(spec.tests);
				const err = result?.error ?? result?.errors?.[0];
				const message = err?.message ? clean(err.message) : '';
				const loc = err?.location;
				const reported = spec.file ?? suite.file;
				out.push({
					file: norm(reported ?? ''),
					absolute: absoluteFile(reported),
					canonical: [...here, spec.title ?? ''].join(' ').trim(),
					status,
					error: message ? (message.split('\n')[0] ?? null) : null,
					source: loc?.file && loc.line !== undefined ? `${norm(loc.file)}:${loc.line}` : null,
					assertion: playwrightAssertion(message),
				});
			}
			if (suite.suites) walk(suite.suites, here, false);
		}
	};
	walk(report.suites, [], true);
	return out;
}

// The reporter has no human summary line; the stats are the run's counts.
function playwrightSummary(stats: PwStats = {}): string {
	const parts = [`${stats.expected ?? 0} passed`];
	if (stats.unexpected) parts.push(`${stats.unexpected} failed`);
	if (stats.skipped) parts.push(`${stats.skipped} skipped`);
	if (stats.flaky) parts.push(`${stats.flaky} flaky`);
	return parts.join(', ');
}

const playwrightErrorText = (errors: PwError[]): string[] => errors.map((e) => clean(e.message ?? '')).filter(Boolean);

function playwrightEvidence(exit: number | null, output: string, target: CheckTarget, ctx: RunnerContext): RunnerEvidence {
	if (exit === null) return runnerFailure('playwright', target, 'no-exit-status', 'no exit status: playwright never started (missing executable or spawn failure)');
	// The browser is launched before the JSON reporter writes anything: a missing binary leaves no report
	// to parse, so the raw output names that environment failure rather than an unreadable report.
	if (/Executable doesn't exist|browserType\.launch/.test(clean(output))) return runnerFailure('playwright', target, 'internal-error', 'the browser binary is missing, so no test ran');
	const report = playwrightReport(output);
	if (!report) return unavailable('playwright', target, 'the run printed no readable JSON report (the selected task runs --reporter=json)');
	const cases = playwrightCases(report);
	const errors = playwrightErrorText(report.errors ?? []);
	// No collected test: the reporter's own errors say why (no match, a file that did not load, a config
	// error). A load error is checked first because playwright reports it together with "No tests found".
	if (!cases.length) {
		const collection = errors.find((m) => /SyntaxError|Cannot find module|Failed to load|ReferenceError/.test(m));
		if (collection) return runnerFailure('playwright', target, 'collection-error', collection.split('\n')[0]);
		if (errors.some((m) => /^Error: No tests found/.test(m))) return runnerFailure('playwright', target, 'no-tests', 'playwright found no tests');
		if (errors.length) return runnerFailure('playwright', target, 'internal-error', errors[0].split('\n')[0]);
		return runnerFailure('playwright', target, 'no-tests', 'the report names no test');
	}
	// Tests collected alongside a reporter error: the run reached a result, but not a clean one.
	if (errors.length) {
		const collection = errors.find((m) => /SyntaxError|Cannot find module|Failed to load|ReferenceError/.test(m));
		return runnerFailure('playwright', target, collection ? 'collection-error' : 'internal-error', (collection ?? errors[0]).split('\n')[0]);
	}
	const summary = playwrightSummary(report.stats);
	const inFile = cases.filter((c) => sameTestFile(c.absolute, target, ctx));
	// The row names one test; a selector that matched more than one case is ambiguous, whether the extra
	// cases passed or failed. Playwright does not reject two cases whose described titles collapse to
	// the same space-joined id (verified 2026-10-09: a `cart > discount` and a flat `cart discount`
	// both run), so this count is the boundary that keeps the proof to one case (#109 review).
	if (target.id && inFile.length > 1) return unavailable('playwright', target, `${summary} — the selector matched ${inFile.length} tests (${inFile.map((c) => c.canonical).join(', ')}); the row names one test`);
	const passedCases = inFile.filter((c) => c.status === 'passed');
	const failedCases = inFile.filter((c) => c.status === 'failed');
	// A spec with no executed result (a `--list` collection, dropped `results`/`tests`, a status the
	// reporter never wrote) cannot be read as either outcome; a multi-project spec whose results
	// disagree is unavailable too. Never a pass from `spec.ok` or the run's totals (#109 review).
	const notExecuted = inFile.filter((c) => c.status === 'none' || c.status === 'unavailable');
	if (!failedCases.length) {
		// A selected task must name the one case that ran and passed. The selector filters out the file's
		// other tests, so the run's total alone cannot say which case passed; a skipped or never-executed
		// selected case has no pass at all.
		if (target.id) {
			return exit === 0 && passedCases.length === 1 && passedCases[0].canonical === target.id && !notExecuted.length
				? passed('playwright', target, `${norm(target.file)} › ${target.id}`, summary)
				: unavailable('playwright', target, notExecuted.length ? `${summary} — the report shows no completed result for the selected ${target.id}, so it is not shown to have run and passed` : passedCases.length ? `${summary} — the passed test ${passedCases.map((c) => c.canonical).join(', ')} is not the selected ${target.id}` : `${summary} — the selected test ${target.id} is not shown to have run and passed`);
		}
		return exit === 0 && passedCases.length === 1 && !inFile.some((c) => c.status === 'skipped' || c.status === 'none' || c.status === 'unavailable')
			? passed('playwright', target, target.file, summary)
			: unavailable('playwright', target, `${summary} — the selected test is not shown to have run and passed on its own`);
	}
	const matches = failedCases.filter((c) => !target.id || c.canonical === target.id);
	if (!matches.length) {
		// #109 review: the same file but a different case used to read as "another file". A red in a
		// genuinely different file leaves `inFile` empty and falls through the pass branch as unavailable.
		return unavailable('playwright', target, `the run was red in ${inFile[0].file} at ${inFile.map((c) => c.canonical).join(', ')}, not the selected ${target.id}`);
	}
	if (matches.length > 1) return unavailable('playwright', target, `${matches.length} tests match ${target.file}::${target.id} (${matches.map((c) => c.canonical).join(', ')}); the row names one test`);
	const one = matches[0];
	const detail: FailingTest = { id: `${one.file} › ${one.canonical}`, error: one.error ?? 'the runner reported this test failed', ...(one.source ? { source: one.source } : {}), assertion: one.assertion };
	const why = notIntendedAssertion(detail, target, ctx);
	return why ? unavailable('playwright', target, why) : behavioral('playwright', target, [detail]);
}


/**
 * Pure: what one red-base run's output shows, keyed on the runner the task runs. Core (check.ts) calls
 * this with the check cell's parsed target, the task's cwd and the actual worktree root the task ran in
 * (`toplevel`): `redBaseEvidence({ cmd, args, cwd, root, exit, output, target })`. The root binds
 * playwright's report file (`config.rootDir` + suite/spec `file`) and its absolute error location to
 * the repo path (`root + target.file`); without either it fails closed. Only `behavioral-failure`
 * proves the intended assertion ran; `passed` is the positive evidence a `refactor:` row needs
 * (exactly the selected test ran and passed); everything else fails the row closed, naming `say`.
 */
export function redBaseEvidence({ cmd, args, cwd, root, exit, output, target }: { cmd: string; args: string[]; cwd: string; root?: string; exit: number | null; output: string; target: CheckTarget }): RunnerEvidence {
	const ctx: RunnerContext = { cwd, root, selected: selectedTestPath(args) };
	const runner = runnerOf({ cmd, args });
	if (!runner) return unavailable(null, target, `no known runner in \`${cmd} ${args.join(' ')}\``);
	if (runner === 'pytest') return pytestEvidence(exit, output, target, ctx);
	if (runner === 'vitest') return vitestEvidence(exit, output, target, ctx);
	return playwrightEvidence(exit, output, target, ctx);
}

/**
 * Pure: whether one repro run's failure is a framework assertion/expectation -- the only kind that can
 * measure the defect. A generic `Error`/throw, a load failure, or a runner wf cannot read is not a
 * measurement: the repro half of the gate fails closed between "the defect" and "the repro crashed".
 */
export function reproFailure({ cmd, args, output }: { cmd: string; args: string[]; output: string }): { asserted: boolean; say: string } {
	const runner = runnerOf({ cmd, args });
	if (!runner) return { asserted: false, say: `no known runner in \`${cmd} ${args.join(' ')}\`: a repro crash wf cannot read is not proof of the defect` };
	const lines = clean(output).split('\n').map(trim);
	if (runner === 'pytest') {
		const headline = lines.map((l) => /^E\s+(\S.*)$/.exec(l)?.[1]).find(Boolean);
		return { asserted: Boolean(headline && pytestAssertion(headline)), say: headline ?? 'no exception headline in the pytest report' };
	}
	if (runner === 'vitest') {
		const headline = firstMatch(lines, /^([A-Za-z]*Error):\s*(.+)$/)?.slice(1).join(': ');
		return { asserted: /^AssertionError\b/.test(headline ?? ''), say: headline ?? 'no error headline in the vitest report' };
	}
	const headline = firstMatch(lines, /^Error:\s*(.+)$/)?.[1];
	return { asserted: /^expect\(/.test(headline ?? ''), say: headline ?? 'no error headline in the playwright report' };
}
