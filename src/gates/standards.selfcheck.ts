// standards.selfcheck.ts — node standards.selfcheck.ts → exit 0 when green.
// Pure arms: which .agents/checks rules cover a diff, a rule file read, and a report read and judged
// (standards.ts). Nothing is run.
import { applicable, checkId, parseCheck, readReport, reportGap, summaryLines } from './standards.ts';

let failures = 0;
const check = (name: string, cond: boolean | undefined, detail = '') =>
	(console.log(cond ? `  ok   ${name}` : `  FAIL ${name}${detail ? ` — ${detail}` : ''}`) as unknown) || (cond || failures++);

// ── which rules cover the diff
const paths = ['.agents/checks/perf.md', 'api/.agents/checks/errors.md', 'web/.agents/checks/a11y.md', 'docs/checks/x.md', '.agents/checks/notes/deep.md'];
const changed = ['api/orders.ts', 'api/util/fmt.ts', 'README.md', 'bug-reports/r/repro/spec.ts'];
const cover = applicable(paths, changed, 'bug-reports/r');
check('a rule at the root covers every changed file but the round folder', JSON.stringify(cover.find((c) => c.path === '.agents/checks/perf.md')?.files) === '["api/orders.ts","api/util/fmt.ts","README.md"]', JSON.stringify(cover));
check('a rule under api/ covers only api/\'s files', JSON.stringify(cover.find((c) => c.path === 'api/.agents/checks/errors.md')?.files) === '["api/orders.ts","api/util/fmt.ts"]');
check('a rule whose scope the diff never touched is not run', !cover.some((c) => c.path.startsWith('web/')));
check('only .agents/checks/<name>.md files are rules, not a subfolder of it', !cover.some((c) => c.path.includes('docs/') || c.path.includes('notes/')));
check('a diff that is all round folder needs no rule', applicable(paths, ['bug-reports/r/PLAN.md'], 'bug-reports/r').length === 0);
check('a path with a space is not a rule (a brief key is split on it)', applicable(['.agents/checks/no logs.md', 'my api/.agents/checks/x.md'], ['a.ts', 'my api/b.ts']).length === 0);
check('ids: the scope and the name', checkId('.agents/checks/perf.md') === 'perf' && checkId('api/.agents/checks/errors.md') === 'api/errors' && checkId('api\\.agents\\checks\\errors.md') === 'api/errors');

// ── a rule file (Amp's format)
const rule = parseCheck('api/.agents/checks/errors.md', '---\r\nname: API errors\r\ndescription: "handlers answer with error_code"\r\nseverity-default: High\r\n---\r\n\r\nEvery 4xx carries an `error_code`.\r\n');
check('frontmatter read, CRLF or not, quotes dropped, severity in lower case', rule.name === 'API errors' && rule.description === 'handlers answer with error_code' && rule.severity === 'high', JSON.stringify(rule));
check('the rule is the text after the frontmatter', rule.rule === 'Every 4xx carries an `error_code`.' && rule.scope === 'api' && rule.id === 'api/errors');
const bare = parseCheck('.agents/checks/perf.md', 'No N+1 queries.\n');
check('no frontmatter: named by its id, severity medium, the whole file is the rule', bare.name === 'perf' && bare.severity === 'medium' && bare.rule === 'No N+1 queries.');
check('a severity outside the four is medium, not dropped', parseCheck('.agents/checks/x.md', '---\nseverity-default: blocker\n---\nx').severity === 'medium');

// ── a report
const tok = '\n<!-- brief: abc123 -->\n';
const ISSUES = '# r — standards: API errors\nCheck: api/.agents/checks/errors.md\nResult: issues\n\n## Issues\n- low · api/util/fmt.ts:3 — logs the body · fix: drop it\n- high · api/orders.ts:42-44 — a 400 without error_code · fix: add `ORDER_LOCKED`\n' + tok;
const PASS = '# r — standards: perf\nCheck: .agents/checks/perf.md\nResult: pass\n\n## Issues\nnone\n' + tok;
check('a report with issues, whole: handed off', reportGap(ISSUES, 'standards/api/errors.md') === null, String(reportGap(ISSUES, 'f')));
check('a pass with none: handed off', reportGap(PASS, 'f') === null && reportGap(PASS.replace('none', '- none'), 'f') === null, String(reportGap(PASS, 'f')));
check('no Result line is refused', reportGap('## Issues\nnone\n', 'standards/perf.md') === 'standards/perf.md has no `Result: pass | issues` line');
check('an issue not in the line format is refused, quoting it', reportGap(ISSUES.replace('- low · api/util/fmt.ts:3', '- api/util/fmt.ts:3 low'), 'f')?.includes('"- api/util/fmt.ts:3 low'));
check('issues with none listed, or a pass that lists some, is refused', reportGap(PASS.replace('pass', 'issues'), 'f')?.includes('lists none') && reportGap(ISSUES.replace('Result: issues', 'Result: pass'), 'f')?.includes('says pass'));
const read = readReport(ISSUES.replace(/\n/g, '\r\n'));
check('issues read worst first, with file and line, CRLF or not', read.result === 'issues' && read.issues.map((i) => `${i.severity} ${i.file}:${i.line}`).join() === 'high api/orders.ts:42,low api/util/fmt.ts:3', JSON.stringify(read));

// ── T2's header
const lines = summaryLines([{ id: 'api/errors', file: 'f/standards/api/errors.md', text: ISSUES }, { id: 'perf', file: 'f/standards/perf.md', text: PASS }, { id: 'a11y', file: 'f/standards/a11y.md', text: null }]);
check('T2 sees each rule: its counts by severity and where to read it, a pass, a missing report', lines[0] === 'standards: api/errors — 1 high, 1 low: f/standards/api/errors.md  ← read beside the diff' && lines[1] === 'standards: perf — pass' && lines[2] === 'standards: a11y — no report (f/standards/a11y.md)', JSON.stringify(lines));

console.log(failures ? `\n${failures} FAILURE(S)` : '\nall arms green');
process.exit(failures ? 1 : 0);
