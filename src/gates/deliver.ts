#!/usr/bin/env node
// deliver.ts — wf deliver: after T2 approved (skills/round/SKILL.md). T2 is local and comes first: the
// approval is the merge, and nothing leaves the machine before it (Shay, 2026-09-27).
//   1. `wf check` with the agreement's verification case (the repro)
//   2. the PR: the round's own sections in the order a reviewer reads them, the commits, and
//      ASSESSMENT.md's verdict (the assess agent's check; a word heuristic
//      here printed "missing: loop" — TJEW-700). Not the agreement verbatim — see prBody.
//   3. the merge, and the branch deleted
//   4. the project's tracker note in the round folder (the round skill posts it last; wf never calls the
//      tracker), its path in .wf/state.json for `wf next`
//   5. `wf step merged`
import { execFileSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync, renameSync, unlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { refuseCaller } from '../refusal.ts';
import { seams } from '../seams.ts';
import { runCheck } from './check.ts';
import { baseBranch, trackerNote } from '../project.ts';
import { agreementPath, assessmentGap, ASSESSMENT_FILE, TICKET_FILE, verificationCases } from '../round/agreement.ts';
import { openQuestionGate } from '../round/ask.ts';
import { readVerdict, approvalBinding, approvalContentGap } from './review-format.ts';
import { headContentSha, trackerNotePath, worktreeContentSha } from './content-identity.ts';
import type { ContentIdentity } from './content-identity.ts';
import { readState, roundOf, toplevelOf, writeState } from '../round/state.ts';
import { runStep } from '../round/step.ts';
import type { GhResult } from '../seams.ts';
import type { State } from '../round/state.ts';

// GitHub refuses a PR body over 65,536 characters (JX-1221, 2026-10-08: PLAN.md 61,331 + VALIDATION.md
// 6,260 + commits, "Body is too long" at `gh pr create`). The budget keeps a margin under it; .length
// counts UTF-16 units, never fewer than GitHub's characters.
export const PR_BODY_BUDGET = 60000;

type PrSources = { ticket: string; agreement: string; commitLines: string[]; assessment: string; agreementPath: string; folder?: string; budget?: number };

// The `## T2 walk` line of the agreement — a section body, or the `**T2 walk.**` bullet the agreement
// template writes inside `## Agreed` (both name the same `open:` line).
const t2WalkOf = (text: string): string => /^(?:-\s*)?(?:\*\*T2 walk\.\*\*\s*)?(open:[^\n]*)$/m.exec(text)?.[1]?.trim() ?? '';

// The `## <name>` sections of a round file, by name. A section runs to the next `## ` or the end.
function sectionsOf(text: string) {
	const out: Record<string, string> = {};
	for (const part of text.replace(/\r\n/g, '\n').split(/^## /m).slice(1)) {
		const nl = part.indexOf('\n');
		out[part.slice(0, nl).trim()] = part.slice(nl + 1).trim();
	}
	return out;
}

const h1Of = (text: string) => /^#\s+(.+)$/m.exec(text)?.[1]?.trim() ?? '';
const section = (name: string, text: string | undefined) => (text?.trim() ? `## ${name}\n\n${text.trim()}\n` : '');
const sub = (name: string, text: string) => (text.trim() ? `### ${name}\n\n${text.trim()}\n` : '');

// Pure: the PR title — the round's own title, TICKET.md's H1 (`# JX-1221 — דף משתמש …`). Never a
// commit subject: JX-1221's title came from commitLines.at(-1), the round's *first* commit — "split
// /users/[id] into a view-only detail page and a /users/[id]/edit page", a design T2 removed nine
// revisions later (Shay, 2026-10-08). The title is the one line everybody reads.
export function prTitle({ ticket, agreement, commitLines }: Pick<PrSources, 'ticket' | 'agreement' | 'commitLines'>) {
	return h1Of(ticket) || commitLines.at(0)?.replace(/^- \w+ /, '') || h1Of(agreement) || 'round';
}

// Pure: the pushed commits as the PR lists them — one row per commit, newest first. A commit is not a
// verification case (#112): no row is matched to a case, carries its check, or waits for a subject to
// appear under `## Verification`. The old rows joined a case's `message` to a commit *subject* to pair
// the agreed case with the pushed hash; the case and the commit are now independent lists.
export function commitRows(commitLines: string[]) {
	return commitLines
		.map((line) => /^- (\w+) (.+)$/.exec(line))
		.filter((m): m is RegExpExecArray => m !== null)
		.map((m) => `| ${m[1]} | ${m[2]} |`);
}

// Pure: the PR body — the round's own sections in the order a reviewer reads them, not the agreement
// verbatim. JX-1221's body was 46,275 characters: 41% of it the commit table's file lists, a preamble
// of 14 `Revision (…)` paragraphs, and `## Build` — the call stack, the one section that says how —
// the section the budget cut first, because it sits after the first `## ` and the preamble does not.
// Intent, the agreement's agreed material, the actual commits and verification cases, the T2 walk and
// ASSESSMENT.md's verdict are the reviewer's minimum and are never cut. The agreement's working notes
// (units, rulings, a repro) fold under `<details>`; over the budget they go first, then the
// assessment's detail, then the oldest commits — and the body says where the rest is.
export function prBody({ ticket, agreement, commitLines, assessment, agreementPath: agreementFilePath, folder: roundFolder, budget = PR_BODY_BUDGET }: PrSources) {
	const folder = roundFolder ?? agreementFilePath.replace(/\/[^/]+$/, '');
	const A = sectionsOf(agreement);
	const K = sectionsOf(ticket);
	const V = sectionsOf(assessment);
	// ASSESSMENT.md's own first lines, minus its `# <round> — final assessment` title: the `Verdict:`
	// and `head:` the reviewer reads before anything else (prompts/assess.md).
	const verdict = assessment
		.replace(/\r\n/g, '\n')
		.split(/^## /m)[0]
		.split('\n')
		.filter((l) => l.trim() && !l.startsWith('# '))
		.join('\n');
	// The agreed material a reviewer after the merge must be able to read: the agreement's own behavior
	// (Observed + Agreed for B/C, Intent for class A). Without this the PR body lost what the round was
	// agreed to do (#111.2, #113.5).
	const agreementBody = [A.Observed, A.Agreed].filter(Boolean).join('\n\n').trim() || (A.Intent ?? K.Intent ?? '').trim();
	const t2Walk = A['T2 walk']?.trim() || t2WalkOf(agreement);
	// The assessment's own sections, in the template's order and by axis, so one cannot mask another:
	// the intent judgement, what was observed, consequential design, applicable standards, and the
	// `material:` line that says the work left the agreement (#113.1, prompts/assess.md).
	const detail: Record<string, string> = {
		Intent: V.Intent ?? '',
		'Behavior and evidence': V['Behavior and evidence'] ?? '',
		Design: V.Design ?? '',
		Standards: V.Standards ?? '',
		Agreement: V.Agreement ?? '',
	};
	// The agreement's optional working notes — the units a large change lands in, the person's rulings,
	// and a check round's repro — folded: detail, not what a reviewer reads first.
	const notes = [['Units', A.Units], ['Decisions', A.Decisions], ['Repro', A.Repro]] as const;
	const notesText = notes.map(([name, text]) => section(name, text)).join('\n').trim();
	let notesBlock = notesText ? `<details>\n<summary>Working notes — ${notes.filter(([, text]) => text?.trim()).map(([name]) => name.toLowerCase()).join(', ')}</summary>\n\n${notesText}\n\n</details>\n` : '';
	const commits = commitRows(commitLines);
	// The agreement's verification cases beside the commits, but never joined to them (#112): the case
	// says what `wf check` proves, the commit says what landed. Neither names the other.
	const cases = verificationCases(agreement);
	const verificationBlock = cases.length
		? `## Verification\n\n| # | case | check |\n|---|---|---|\n${cases.map((c) => `| ${c.n} | ${c.message} | ${c.check || '—'} |`).join('\n')}\n`
		: '';
	let keep = commits.length;
	let cut = false;

	const commitsBlock = () => {
		const earlier = keep < commits.length ? [`| — | (${commits.length - keep} earlier commits in the branch) |`] : [];
		return `## Commits\n\n| commit | message |\n|---|---|\n${[...earlier, ...commits.slice(0, keep)].join('\n')}\n`;
	};
	const assessmentBlock = () => {
		const lines = Object.entries(detail)
			.filter(([, body]) => body.trim())
			.map(([name, body]) => sub(name, body));
		return [verdict, ...lines].filter((p) => p.trim()).length ? `## Assessment\n\n${[verdict, ...lines].filter((p) => p.trim()).join('\n\n')}\n` : '';
	};
	const assemble = () =>
		[
			cut ? `> Shortened: GitHub limits a PR body to 65,536 characters, so the round folder's own text stops here. The agreement, ASSESSMENT.md and the rest are in the branch at \`${agreementFilePath}\`.\n` : '',
			`Round folder: \`${folder}/\`\n`,
			section('Intent', K.Intent),
			section('Agreement', agreementBody),
			commitsBlock(),
			verificationBlock,
			section('T2 walk', t2Walk),
			assessmentBlock(),
			notesBlock,
		]
			.filter((b) => b.trim())
			.join('\n') + '\n';

	// Least read first, and only what can be spared: a reviewer's minimum is above this list.
	const cutOrder = ['Standards', 'Design', 'Behavior and evidence', 'Agreement', 'Intent'];
	const stages: Array<() => boolean> = [
		// The fold goes first: it is collapsed, and the agreement is in the same branch as this body.
		() => {
			if (!notesBlock) return false;
			notesBlock = '';
			return true;
		},
		// Then the assessment's detail, least consequential first: standards, design, the evidence, the
		// material line, and last the intent judgement.
		() => {
			const name = cutOrder.find((n) => detail[n].trim() && !detail[n].startsWith('(cut here'));
			if (!name) return false;
			detail[name] = `(cut here, in \`${folder}/ASSESSMENT.md\`)`;
			return true;
		},
		// Then the oldest commits, a quarter at a time, never the newest.
		() => {
			if (keep <= 1) return false;
			keep = Math.max(1, keep - Math.ceil(keep / 4));
			return true;
		},
	];
	let text = assemble();
	// One pass is the normal case: the fold, then the assessment's detail. A body that is still over
	// (a round with thousands of commits) takes the same stages again until a pass cuts nothing.
	for (let pass = 0; pass < 20 && text.length > budget; pass++) {
		let changed = false;
		for (const stage of stages) {
			if (text.length <= budget) break;
			if (!stage()) continue;
			cut = true;
			changed = true;
			text = assemble();
		}
		if (!changed) break;
	}
	// Still over with only the reviewer's minimum left: `gh pr create` refuses the body outright, so
	// the body stops here rather than fail the merge (JX-1221 hit "Body is too long" once already).
	if (text.length > budget) text = `${text.slice(0, budget)}\n(cut here, in the branch: \`${agreementFilePath}\`)\n`;
	return text;
}

// Pure: null when T2 approved the round (`wf review --done` moved it to step pr) and, when `current`
// is given, the worktree and HEAD still match the bytes REVIEW.md recorded. Else why deliver, which
// merges, may not run yet. A product/test/repro change after approval, committed or not, makes the
// verdict stale: deliver pushes HEAD, so a restored working tree is not enough (#106).
export function t2Gap(state: State | null, reviewText: string | null, current?: ContentIdentity) {
	if (state?.step !== 'pr' || readVerdict(reviewText ?? '') !== 'approved') return 'T2 has not approved this round. deliver merges, so it comes after `wf review <branch> --done` with verdict: approved';
	// The binding is the same check `wf review --done` made; `current` absent is the pure verdict-only
	// arm a caller not at the delivery boundary uses.
	return current ? approvalContentGap(reviewText ?? '', current) : null;
}

// Pure: whether a failed push was the project's pre-push hook refusing it (not the network or auth).
export const hookRefused = (output: string) => /pre-push/i.test(output ?? '');

// Pure: the REVIEW.md section a push the hook refused becomes. Its changes-requested verdict is a T2
// fix like any other (wf next dispatches fix-review, then T2 again): TJEW-670's orchestrator built
// this by hand, 2026-09-28, after fallow-audit refused a push T2 had approved.
export function refusedPushSection(output: string, date: string) {
	// The lines that name a failure, not the tail: the hook's last 30 lines were svelte-kit and node
	// warnings, and the file fallow flagged was above them (bench, 2026-09-28).
	const all = output.replace(/\r\n/g, '\n').split('\n').filter((l) => l.trim());
	const named = all.filter((l) => /[\u2717\u2718]|\u{1F94A}|\berror\b|CRITICAL|^\s*(packages|verification|scripts|docs)\/|^\s+:\d+\s/u.test(l) && !/lefthook v\d/.test(l));
	const lines = (named.length ? named : all).slice(-30);
	return `\n## ${date} \u2014 the push was refused by the project's pre-push hook\n\ncomments:\n(the push) \u2014 fix what the hook reports; \`wf check\` runs the same hook on the files you change:\n${lines.map((l) => `    ${l}`).join('\n')}\n\nverdict: changes-requested\n`;
}

const git = (toplevel: string, args: string[]) => execFileSync('git', ['-C', toplevel, ...args], { encoding: 'utf8' }).trimEnd();

// Every value a git config key has, in order, or [] when it is unset. `--get-all`, not `--get`: a
// remote can name several urls, and git pushes to all of them (issue 108).
const gitConfigAll = (toplevel: string, key: string) =>
	(spawnSync('git', ['-C', toplevel, 'config', '--get-all', key], { encoding: 'utf8' }).stdout ?? '')
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);

// Origin's push url(s) as git resolves them: `insteadOf`/`pushInsteadOf` rewrites applied, one line
// per value. An origin with no url exits nonzero and answers nothing.
const gitPushUrls = (toplevel: string) =>
	(spawnSync('git', ['-C', toplevel, 'remote', 'get-url', '--push', '--all', 'origin'], { encoding: 'utf8' }).stdout ?? '')
		.split('\n')
		.map((line) => line.trim())
		.filter(Boolean);

// ── the remote half: what a retry finds, and what it may do about it ─────────────────────────────
// `wf deliver` merges on GitHub; the tracker note and the step are local and can be reached after the
// merge (issue 108). A retry asks the remote what its branch already has instead of trusting that a
// local step says everything: a PR that is already merged means only the note and the step are left,
// and a gh that cannot be asked is not proof there is no PR.

// The states gh reports for a PR deliver can act on: gh's `state` is OPEN, CLOSED or MERGED (a merged
// PR is reported MERGED, not CLOSED).
export type PrState = 'OPEN' | 'MERGED' | 'CLOSED';

// What the remote answered about a branch's PRs. `unknown` is not "none": it is a gh that failed or
// answered something unusable, from which no safe delivery decision can be made.
export type PrLookup =
	| { kind: 'none' }
	| { kind: 'found'; url: string; state: PrState; headRefOid: string | null }
	| { kind: 'unknown'; why: string };

// What a delivery retry may do: create the PR (`deliver`), finish an open one (`resume`), finish the
// note and the step of an already merged one (`finish`), or stop (`refuse`).
export type DeliveryResume =
	| { do: 'deliver' }
	| { do: 'resume'; url: string }
	| { do: 'finish'; url: string }
	| { do: 'refuse'; why: string };

// A GitHub head commit id: a full SHA-1. gh reports the 40-hex OID of the PR's head commit, and a
// value that is not one cannot prove which commit a merge landed.
const commitOid = /^[0-9a-f]{40}$/i;

// A repository deliver addresses, by owner and name. `gh` without `--repo` asks whichever repository
// it infers from the folder's remotes — not necessarily this round's origin (a second remote, a fork)
// — so a lookup or create that names no repository can read or write another project's PR. Only
// github.com is read; deliver's remote half is GitHub's, and any other host is unknown, not guessed.
export type GithubRepo = { owner: string; name: string };

// The path segments after `github.com` in a remote (`git@github.com:o/r.git`,
// `https://github.com/o/r.git`, `ssh://git@github.com/o/r.git`) or a PR url
// (`https://github.com/o/r/pull/1`), or null when the text addresses no github.com path.
function githubPath(text: string): string[] | null {
	const t = text.trim();
	const m =
		/^(?:[^@/\s]+@)?github\.com:(.+)$/i.exec(t) ??
		/^[a-z][a-z0-9+.-]*:\/\/(?:[^@/\s]+@)?github\.com\/(.+)$/i.exec(t);
	return m ? m[1]!.split(/[?#]/)[0]!.split('/').filter(Boolean) : null;
}

const sameRepo = (a: GithubRepo, b: GithubRepo) =>
	a.owner.toLowerCase() === b.owner.toLowerCase() && a.name.toLowerCase() === b.name.toLowerCase();

// Pure: origin's url as the GitHub repository it names, or null when it is not one deliver can pin.
// `git remote get-url` would answer the insteadOf-rewritten transport url; the configured url is the
// repository's identity, which is what gh needs to be told.
export function githubRepo(remoteUrl: string): GithubRepo | null {
	const parts = githubPath(remoteUrl);
	if (!parts || parts.length !== 2) return null;
	const name = parts[1]!.replace(/\.git$/i, '');
	return parts[0] && name ? { owner: parts[0], name } : null;
}

// Pure: the repository a PR url names (`https://github.com/o/r/pull/1`), or null when it names none.
export function githubPrRepo(prUrl: string): GithubRepo | null {
	const parts = githubPath(prUrl);
	if (!parts || parts.length !== 4 || parts[2] !== 'pull' || !/^\d+$/.test(parts[3]!)) return null;
	return { owner: parts[0]!, name: parts[1]! };
}

// Pure: a remote url with its credentials and query/fragment removed, for a refusal diagnostic. A
// token in userinfo (`https://user:token@host/...`) or a signed query must never reach the log
// (issue 108). `git@host:path` keeps only the host and path.
export function redactRemote(text: string): string {
	return text
		.trim()
		.replace(/^([a-z][a-z0-9+.-]*:\/\/)[^/@]*@/i, '$1')
		.replace(/^[^@/\s]+@(?=[^@/\s]+:)/, '')
		.replace(/[?#].*$/, '');
}

// What origin's configured urls and pushurls prove about where `git push origin` goes. `refuse`
// carries why, with credentials already redacted. `effectivePushUrls` is what git would actually push
// to (`git remote get-url --push --all origin`), which applies `insteadOf`/`pushInsteadOf` rewrites the
// configured values below never show.
export type OriginTarget = { kind: 'repo'; repo: GithubRepo } | { kind: 'refuse'; why: string };

// Pure: the single GitHub repository `git push origin` reaches. `git push` uses `pushurl` when it is
// set and otherwise every `url`, so a repository is returned only when every configured value names
// the same github.com repository. A fork `pushurl` beside an upstream `url` is the reported incident:
// the branch went to the fork while gh addressed origin (issue 108). A differing, multiple, or
// unreadable destination is refused before any mutation rather than guessed at. The configured urls
// are read, not `git remote get-url`, so a valid `insteadOf` transport remap keeps its GitHub identity.
// The effective push urls are then checked: a rewrite that lands on another github.com repository is
// refused, since gh would address origin while git pushed a different project. A rewrite to a
// non-GitHub transport (a local bare path, a proxy) is trusted and not proven — deliver cannot read
// it, and the controlled local transports the tests use must keep working.
export function originTarget(urls: string[], pushurls: string[], effectivePushUrls: string[] = []): OriginTarget {
	const values = [...urls, ...pushurls];
	if (!values.length) return { kind: 'refuse', why: 'origin has no url or pushurl configured' };
	const repos: GithubRepo[] = [];
	for (const value of values) {
		const repo = githubRepo(value);
		if (!repo) return { kind: 'refuse', why: `origin's remote ${JSON.stringify(redactRemote(value))} is not a github.com repository` };
		repos.push(repo);
	}
	const first = repos[0]!;
	const other = values.findIndex((_, i) => !sameRepo(repos[i]!, first));
	if (other >= 0) {
		return { kind: 'refuse', why: `origin's urls and pushurls name different repositories (${JSON.stringify(redactRemote(values[0]!))} and ${JSON.stringify(redactRemote(values[other]!))}); deliver cannot prove git push and gh address the same one` };
	}
	for (const value of effectivePushUrls) {
		const repo = githubRepo(value);
		if (repo && !sameRepo(repo, first)) {
			return { kind: 'refuse', why: `git's effective push url for origin is ${JSON.stringify(redactRemote(value))}, not ${first.owner}/${first.name} — a url rewrite sends the push to another github.com repository, so gh and git push would address different projects` };
		}
	}
	return { kind: 'repo', repo: first };
}

// Pure: a gh answer as a PrLookup. A failed gh, or an answer that is not a JSON array, is `unknown`:
// reading it as "no PR" would create a second PR for the same branch. A nonempty answer must be
// wholly readable and wholly this delivery's — one row without the url, state or head commit we asked
// for, for another base branch, or whose url names another repository, makes the whole answer
// unusable. Several rows are ambiguous (branch reuse puts an old merged PR beside a fresh open one),
// so only a lone PR is `found`; ranking them would pick a delivery that may not be this one (issue
// 108). `expected` is the head, base and repository the query was pinned to; without it the metadata
// is read as it comes.
export function prLookup(result: GhResult, expected?: { headRefName: string; baseRefName: string; repo?: GithubRepo }): PrLookup {
	if (result.status !== 0) {
		return { kind: 'unknown', why: `gh pr list exited ${result.status ?? 'null'}: ${(result.stderr || result.stdout).trim().slice(0, 300)}` };
	}
	let parsed: unknown;
	try {
		parsed = JSON.parse(result.stdout);
	} catch {
		return { kind: 'unknown', why: `gh pr list did not answer JSON: ${result.stdout.trim().slice(0, 200)}` };
	}
	if (!Array.isArray(parsed)) return { kind: 'unknown', why: 'gh pr list did not answer a JSON array' };
	// An empty array is a real answer, and the only one that lets deliver create a PR.
	if (!parsed.length) return { kind: 'none' };
	const rows: Array<{ url: string; state: PrState; headRefOid: string | null }> = [];
	for (const p of parsed) {
		if (typeof p !== 'object' || p === null) return { kind: 'unknown', why: 'gh pr list answered a row that is not an object' };
		const row = p as { url?: unknown; state?: unknown; headRefOid?: unknown; headRefName?: unknown; baseRefName?: unknown; isCrossRepository?: unknown };
		if (typeof row.url !== 'string' || !row.url.trim()) return { kind: 'unknown', why: 'gh pr list answered a row without a url' };
		if (typeof row.state !== 'string' || !['OPEN', 'MERGED', 'CLOSED'].includes(row.state)) return { kind: 'unknown', why: `gh pr list answered a PR in state ${JSON.stringify(row.state)}, which deliver cannot act on` };
		if (row.headRefOid !== undefined && row.headRefOid !== null && (typeof row.headRefOid !== 'string' || !commitOid.test(row.headRefOid))) {
			return { kind: 'unknown', why: `gh pr list answered a PR with head commit ${JSON.stringify(row.headRefOid)}, which is not a commit id` };
		}
		if (expected) {
			if (row.headRefName !== expected.headRefName) return { kind: 'unknown', why: `gh pr list answered a PR whose head is ${JSON.stringify(row.headRefName)}, not this branch ${expected.headRefName}` };
			if (row.baseRefName !== expected.baseRefName) return { kind: 'unknown', why: `gh pr list answered a PR whose base is ${JSON.stringify(row.baseRefName)}, not ${expected.baseRefName}` };
			if (row.isCrossRepository !== false) return { kind: 'unknown', why: 'gh pr list answered a PR from another repository, not this branch on origin' };
			if (expected.repo) {
				const got = githubPrRepo(row.url);
				if (!got || !sameRepo(got, expected.repo)) return { kind: 'unknown', why: `gh pr list answered a PR at ${row.url}, which is not a pull request in ${expected.repo.owner}/${expected.repo.name}` };
			}
		}
		rows.push({ url: row.url, state: row.state as PrState, headRefOid: typeof row.headRefOid === 'string' ? row.headRefOid : null });
	}
	// Branch reuse is real: an old merged PR and a fresh open one on the same branch are two deliveries,
	// and picking the merged one would write this round's note over work it did not do. A lone PR is
	// this delivery; several are ambiguous, so deliver refuses rather than rank them (issue 108).
	if (rows.length > 1) return { kind: 'unknown', why: `gh pr list answered ${rows.length} PRs for this branch; which is this delivery's cannot be told` };
	const pr = rows[0];
	return { kind: 'found', url: pr.url, state: pr.state, headRefOid: pr.headRefOid };
}

// Pure: what a delivery retry does with the remote's answer for its branch, at `head`. An `unknown`
// answer refuses — the remote could not be asked, and guessing costs a duplicate PR or merge. A
// merged PR without the head commit it landed refuses: that is no proof this delivery's commit is the
// one merged. A merged PR for another commit refuses: the merge is not this delivery's. A CLOSED PR
// refuses: the branch was abandoned short of a merge, and deliver will not revive it.
export function deliveryResume(lookup: PrLookup, head: string): DeliveryResume {
	if (lookup.kind === 'unknown') return { do: 'refuse', why: `the remote could not be asked about this branch's PR (${lookup.why}); fix the remote and run it again` };
	if (lookup.kind === 'none') return { do: 'deliver' };
	if (lookup.state === 'MERGED') {
		if (!lookup.headRefOid || !commitOid.test(lookup.headRefOid)) {
			return { do: 'refuse', why: `this branch's PR ${lookup.url} is merged but records no head commit, so the merge cannot be proven to be this commit (${head.slice(0, 12)}); nothing was changed` };
		}
		if (lookup.headRefOid !== head) {
			return { do: 'refuse', why: `this branch's PR ${lookup.url} merged ${lookup.headRefOid.slice(0, 12)}, but HEAD is ${head.slice(0, 12)} — the merge is not this commit; nothing was changed` };
		}
		return { do: 'finish', url: lookup.url };
	}
	if (lookup.state === 'OPEN') return { do: 'resume', url: lookup.url };
	return { do: 'refuse', why: `this branch's PR ${lookup.url} is ${lookup.state}, not open or merged — deliver will not merge it` };
}

// Pure: whether an existing note may stand as this delivery's finished one. Every id must have a
// `## <id>` heading with at least one body line under it: a heading alone is an interrupted section, a
// missing heading is another round's note, and neither may be kept as the finished note (issue 108). A
// posted heading keeps its id and gains " (posted)" (post.ts), so the id is the heading's first word.
export function noteComplete(text: string, ids: string[]): boolean {
	const hasBody = new Map<string, boolean>();
	let key: string | null = null;
	for (const line of text.replace(/\r\n/g, '\n').split('\n')) {
		if (line.startsWith('## ')) {
			key = line.slice(3).trim().split(/\s+/)[0];
			hasBody.set(key, false);
		} else if (key && line.trim()) {
			hasBody.set(key, true);
		}
	}
	return ids.every((id) => hasBody.get(id) === true);
}

// Write a file so a crash never leaves a partial one: the text goes to a same-directory temp file
// (exclusive create), then replaces the target in one rename. The old truncate-and-write left a note
// deliver itself had cut off, which every retry then refused as another round's (issue 108). The temp
// is removed if the write or rename fails; the error still propagates.
function writeAtomic(path: string, text: string) {
	// The suffix is base36; `|| '0'` keeps it nonempty, so the temp always matches the exact
	// writer-temp rule content-identity.ts owns (Math.random() can be exactly 0, whose base36 is "0").
	const token = Math.random().toString(36).slice(2) || '0';
	const tmp = `${path}.${process.pid}.${token}.tmp`;
	try {
		writeFileSync(tmp, text, { flag: 'wx' });
		renameSync(tmp, path);
	} catch (error) {
		try { unlinkSync(tmp); } catch { /* the temp was never created, or is already gone */ }
		throw error;
	}
}

// Pure: what to do with a note file deliver finds at its own note path (issue 108).
//  - 'keep': a finished note — a person filled and posted it, or a previous run wrote it whole.
//  - 'replace': a strict prefix of the note deliver would write: this delivery's own write was
//    interrupted. Completing it can lose nothing a person wrote, and refusing would strand the round
//    forever.
//  - 'refuse': neither — another round's note, or text deliver cannot account for. Those sections may
//    be the only posted copy, so deliver refuses rather than risk dropping them.
// `noteComplete` alone cannot tell a truncated scaffold from a finished one when the truncation left
// one full section: the comparison with the note deliver would write is what does (issue 108).
export function existingNoteAction(text: string, noteText: string, ids: string[]): 'keep' | 'replace' | 'refuse' {
	if (text === noteText) return 'keep';
	if (noteText.startsWith(text)) return 'replace';
	return noteComplete(text, ids) ? 'keep' : 'refuse';
}

// The local half of a delivery whose remote half is done: the branch (if it is still there), the
// tracker note, its path in state, and `wf step merged` — deliver.ts's steps 4 and 5. Only what is
// unfinished is written: a note the round already filled, or posted, is kept, so a retry never
// duplicates a tracker update (issue 108). A note that exists but does not cover the round's ids is
// refused, not overwritten — those sections may be the only posted copy. A note that is a prefix of
// the one deliver would write is deliver's own interrupted write and is completed. A failed branch
// delete is ignored: the branch may already be gone, and the step and the note must still be finished.
async function finishDelivery({ toplevel, state, folder, ids, url, because }: { toplevel: string; state: State | null; folder: string; ids: string[]; url: string; because: string }) {
	const note = trackerNote({ ids, url });
	const rel = `${folder}/${note.file}`;
	const recorded = state?.note && existsSync(join(toplevel, state.note)) ? state.note : null;
	const existing = recorded ?? (existsSync(join(toplevel, rel)) ? rel : null);
	let kept = rel;
	if (existing) {
		const path = join(toplevel, existing);
		const text = readFileSync(path, 'utf8');
		// A file without a filled section for every id is another round's note, or deliver's own write cut
		// off mid-way. The first may hold a posted section and is refused; the second is a prefix of what
		// deliver would write and is completed.
		const action = existingNoteAction(text, note.text, ids);
		if (action === 'refuse') {
			console.error(`FAILED: ${existing} exists but is truncated or another round's note. deliver will not overwrite it: finish it by hand or move it aside, then run deliver again.`);
			process.exit(1);
		}
		// A prefix cannot hold a posted section: deliver wrote it and was cut off, so completing it is safe.
		if (action === 'replace') writeAtomic(path, note.text);
		kept = existing;
	} else {
		writeAtomic(join(toplevel, rel), note.text);
	}
	const branch = git(toplevel, ['rev-parse', '--abbrev-ref', 'HEAD']);
	// Not --delete-branch: gh would then check out the base branch in this worktree, and it is checked
	// out in the person's clone (deliver.ts, the merge). The delete is ignored: the branch may already
	// be gone.
	spawnSync('git', ['-C', toplevel, 'push', '-q', 'origin', '--delete', branch], { encoding: 'utf8' });
	writeState(toplevel, () => ({ note: kept }));
	console.log(`${url} ${because}; tracker note: ${kept}`);
	await runStep(['merged']);
}

export async function runDeliver() {
	const toplevel = toplevelOf();
	const state = readState(toplevel);
	// The step is the delivery's last write; once it is `merged` there is nothing left to finish. A
	// retry that never reached it is recovered above, from what the remote shows.
	if (state?.step === 'merged') {
		console.error(`wf deliver: already merged${state.note ? ` (tracker note: ${state.note})` : ''}; \`wf next\` says what is left`);
		process.exit(2);
	}
	const gate = openQuestionGate(state);
	if (gate) {
		console.error(`wf deliver: ${gate}`);
		process.exit(2);
	}
	const { id, folder } = roundOf(state, toplevel);
	const branch = git(toplevel, ['rev-parse', '--abbrev-ref', 'HEAD']);
	const head = git(toplevel, ['rev-parse', 'HEAD']);
	const agreementFile = agreementPath(toplevel, state?.class ?? null, folder);
	if (!folder || !existsSync(agreementFile)) {
		console.error(`wf deliver: no agreement file in ${folder ?? 'the round folder'}`);
		process.exit(2);
	}
	// The id names the commit and the tracker note: without it they said docs(null) and `## null`.
	if (!id) {
		console.error('wf deliver: .wf/state.json has no id or round — run `wf step <step>` in this worktree first, or recreate the round with `wf new --id`');
		refuseCaller();
	}
	const reviewFile = join(toplevel, folder, 'REVIEW.md');
	const reviewText = existsSync(reviewFile) ? readFileSync(reviewFile, 'utf8') : null;
	const notePath = trackerNotePath(folder);
	// The bytes T2 approved (worktree and HEAD) and the ones on disk now. Every mutation boundary below
	// (the last check, the round-folder commit, the push hook) is compared against them: a task or hook
	// that rewrites a file, or a commit that carries code the restored worktree hides, cannot keep the
	// approval it desynchronized (#106, 2026-10-09).
	const identityNow = (): ContentIdentity => {
		try {
			return { worktree: worktreeContentSha(toplevel, folder, notePath, 'approval'), head: headContentSha(toplevel, folder, notePath, 'approval') };
		} catch (e) {
			console.error(`wf deliver: could not read the implementation the round approved: ${(e as Error).message}`);
			process.exit(2);
		}
	};
	const binding = approvalBinding(reviewText ?? '');
	// The bytes T2 approved (worktree and HEAD) re-asserted at every mutation boundary below (the last
	// check, the round-folder commit, the push hook, the merge). The worktree must still be the approved
	// bytes, and HEAD must carry them: either the approved HEAD (nothing committed since review) or the
	// approved worktree (deliver's round-folder commit, or a retry that already made one) — so exactly
	// the approved bytes are shipped (#106). Both are accepted at every boundary because a resumed
	// delivery meets HEAD == the approved worktree, not the reviewed HEAD (#108).
	const requireApprovedContent = (what: string) => {
		const now = identityNow();
		const worktreeOk = binding.contentSha !== null && now.worktree === binding.contentSha;
		const headOk = now.head === binding.headSha || now.head === binding.contentSha;
		if (binding.contentSha !== null && binding.headSha !== null && worktreeOk && headOk) return;
		console.error(`wf deliver: ${what} changed the implementation T2 approved (REVIEW.md worktree ${binding.contentSha ?? 'none'}, HEAD ${binding.headSha ?? 'none'}; now worktree ${now.worktree}, HEAD ${now.head}) — the approval no longer covers it. Commit or revert the change, re-run \`wf check\`, and re-run \`wf review <round>\` + T2`);
		process.exit(2);
	};
	const t2 = t2Gap(state, reviewText, identityNow());
	if (t2) {
		console.error(`wf deliver: ${t2}`);
		process.exit(2);
	}
	// The PR carries the assessment: it must be the completed final assessment, with a verdict (#113).
	const assessmentFile = join(toplevel, folder, ASSESSMENT_FILE);
	const vGap = assessmentGap(existsSync(assessmentFile) ? readFileSync(assessmentFile, 'utf8') : null);
	if (vGap) {
		console.error(`wf deliver: ${vGap}`);
		process.exit(2);
	}
	const agreementText = readFileSync(agreementFile, 'utf8');
	// The GitHub repository this delivery addresses: origin's own identity, from origin's configured
	// urls and pushurls, and the push urls git resolves those to. gh without --repo asks whatever
	// repository it infers from this folder, so a second remote or a fork could receive the branch or
	// answer about another project's PR; every lookup, create, edit and merge is pinned to this one
	// (issue 108). A push destination deliver cannot prove is the same repository refuses before any
	// mutation: it is unknown, not a default. A rewrite to a non-GitHub transport is trusted, not
	// proven (deliver cannot read it), so this is not a universal proof of where the push lands.
	const target = originTarget(gitConfigAll(toplevel, 'remote.origin.url'), gitConfigAll(toplevel, 'remote.origin.pushurl'), gitPushUrls(toplevel));
	if (target.kind === 'refuse') {
		console.error(`wf deliver: ${target.why}; nothing was changed`);
		process.exit(2);
	}
	const repo = target.repo;
	const repoName = `${repo.owner}/${repo.name}`;
	// What the remote already did for this branch (issue 108), read before any push: a retry after a
	// completed merge must not push the deleted branch back or merge again, and a gh that cannot be
	// asked must not be read as "no PR". The query is pinned to this repository, branch and base, and
	// the response's head, base and repository are checked against them, so a same-named branch from a
	// fork or a PR against another base or repository is not taken for this delivery's.
	const resume = deliveryResume(
		prLookup(seams.gh(['pr', 'list', '--repo', repoName, '--head', branch, '--base', baseBranch, '--state', 'all', '--json', 'url,state,headRefOid,headRefName,baseRefName,isCrossRepository'], toplevel), { headRefName: branch, baseRefName: baseBranch, repo }),
		head,
	);
	if (resume.do === 'refuse') {
		console.error(`wf deliver: ${resume.why}`);
		process.exit(2);
	}
	if (resume.do === 'finish') {
		await finishDelivery({ toplevel, state, folder, ids: state?.ids ?? [id], url: resume.url, because: 'was already merged' });
		return;
	}
	await runCheck([]); // exits 1 with the failure; silent when the matching case is green
	requireApprovedContent('the last check');

	// The round folder ships with the PR (dev keeps every round's evidence), except
	// repro/.auth, which holds a live login session. PNGs are gitignored (bug-reports/**/*.png).
	// Once .gitignore covers bug-reports/**/.auth/, git add refuses an exclude that names the ignored
	// path (exit 1, "paths are ignored"), so the exclude is only needed while it is not ignored.
	const authIgnored = spawnSync('git', ['-C', toplevel, 'check-ignore', '-q', `${folder}/repro/.auth`]).status === 0;
	// REVIEW.md and the tracker note are the round's own paperwork, read by nobody after it: they stay
	// uncommitted, and reap keeps them in ~/.cache/wf-reaped (Shay, 2026-09-27).
	const keep = ['--', folder, ...(authIgnored ? [] : [`:(exclude)${folder}/repro/.auth`]), `:(exclude)${folder}/REVIEW.md`];
	if (git(toplevel, ['status', '--porcelain', ...keep])) {
		git(toplevel, ['add', ...keep]);
		// Pathspec, not a bare commit: a product file staged for another purpose is not swept into the
		// round-folder commit and pushed under an approval that never covered it (#106 review).
		git(toplevel, ['commit', '-q', '-m', `docs(${id}): round folder: ticket, agreement, assessment, repro`, ...keep]);
	}
	requireApprovedContent('the round-folder commit');
	// gh pr create cannot push without a terminal; push first (BJEW-603, the first real deliver).
	const pushed = spawnSync('git', ['-C', toplevel, 'push', '-q', '-u', 'origin', 'HEAD'], { encoding: 'utf8' });
	if (pushed.status !== 0) {
		const output = (pushed.stdout ?? '') + (pushed.stderr ?? '');
		console.error(`FAILED: git push\n${output}`.trimEnd());
		if (hookRefused(output)) {
			appendFileSync(reviewFile, refusedPushSection(output, new Date().toISOString().slice(0, 10)));
			await runStep(['build']);
			console.error(`wf deliver: the pre-push hook refused the push. ${folder}/REVIEW.md now asks for the fix (verdict: changes-requested); the round is back at build. \`wf next\` dispatches it, then T2 again.`);
		}
		process.exit(1);
	}
	requireApprovedContent('the push hook');

	const base = git(toplevel, ['merge-base', `origin/${baseBranch}`, 'HEAD']);
	const commitLines = git(toplevel, ['log', '--format=- %h %s', `${base}..HEAD`]).split('\n').filter(Boolean);
	if (!commitLines.length) {
		console.error(`wf deliver: no commits since origin/${baseBranch} — nothing to deliver`);
		process.exit(1);
	}
	const body = join(tmpdir(), `wf-pr-${Date.now()}.md`);
	// The assessment is the read-only final assessment (#113); first thing T2 reads.
	const assessment = existsSync(assessmentFile) ? readFileSync(assessmentFile, 'utf8') : '';
	const ticketPath = join(toplevel, folder, TICKET_FILE);
	const ticket = existsSync(ticketPath) ? readFileSync(ticketPath, 'utf8') : '';
	writeFileSync(body, prBody({ ticket, agreement: agreementText, commitLines, assessment, agreementPath: `${folder}/${agreementPath(toplevel, state?.class ?? null, folder).split(/[\\/]/).pop()}`, folder }));
	const title = prTitle({ ticket, agreement: agreementText, commitLines });
	// An open PR is this delivery's own: edit its body, never create a second one (issue 108).
	const url = resume.do === 'resume' ? resume.url : null;
	const pr = url
		? seams.gh(['pr', 'edit', url, '--body-file', body], toplevel)
		: seams.gh(['pr', 'create', '--repo', repoName, '--base', baseBranch, '--title', title, '--body-file', body], toplevel);
	if (pr.status !== 0) {
		console.error(`FAILED: gh pr ${url ? 'edit' : 'create'}\n${(pr.stdout ?? '') + (pr.stderr ?? '')}`.trimEnd());
		process.exit(1);
	}
	const prUrl = url ?? pr.stdout.trim().split('\n').at(-1) ?? '';
	// The PR the rest of deliver acts on must be in the repository origin names: a create that answers
	// with another repository's URL would otherwise be edited and merged here (issue 108).
	const prRepo = prUrl ? githubPrRepo(prUrl) : null;
	if (!prUrl || !prRepo || !sameRepo(prRepo, repo)) {
		console.error(`FAILED: gh answered PR url ${JSON.stringify(prUrl)}, which is not a pull request in ${repoName}`);
		process.exit(1);
	}
	// The paperwork commit above moved HEAD since the pre-push lookup, and a create or an OPEN PR can
	// record a different head than the branch now has (a force-push, or a stale PR answer). Read the PR
	// again at the commit the branch now carries, and refuse unless it is an open PR for this url whose
	// head is that commit. `--match-head-commit` then makes the merge itself conditional on the commit,
	// so a push between this read and the merge cannot land code this round did not review (gh 2.96's
	// `gh pr merge --help` documents the flag; a gh without it fails the merge rather than merging).
	const headNow = git(toplevel, ['rev-parse', 'HEAD']);
	const fresh = prLookup(
		seams.gh(['pr', 'list', '--repo', repoName, '--head', branch, '--base', baseBranch, '--state', 'all', '--json', 'url,state,headRefOid,headRefName,baseRefName,isCrossRepository'], toplevel),
		{ headRefName: branch, baseRefName: baseBranch, repo },
	);
	if (fresh.kind === 'unknown') {
		console.error(`wf deliver: the remote could not be asked about PR ${prUrl} before the merge (${fresh.why}); nothing was merged`);
		process.exit(1);
	}
	// A concurrent actor merged this exact commit: finish, as the pre-push lookup would have.
	if (fresh.kind === 'found' && fresh.state === 'MERGED' && fresh.headRefOid === headNow && fresh.url === prUrl) {
		await finishDelivery({ toplevel, state, folder, ids: state?.ids ?? [id], url: fresh.url, because: 'was already merged' });
		return;
	}
	if (fresh.kind !== 'found' || fresh.state !== 'OPEN' || fresh.url !== prUrl) {
		console.error(`wf deliver: PR ${prUrl} is no longer an open PR for ${branch} (${fresh.kind === 'found' ? fresh.state : fresh.kind}); nothing was merged`);
		process.exit(1);
	}
	if (fresh.headRefOid !== headNow) {
		console.error(`wf deliver: PR ${prUrl} is open at ${(fresh.headRefOid ?? 'no commit').slice(0, 12)}, but HEAD is ${headNow.slice(0, 12)} — merging it would land a commit this round did not push; nothing was merged`);
		process.exit(1);
	}
	// The final approval recheck, after the push and the PR create/edit and lookup roundtrip: assert
	// HEAD still carries the approved content, and that the commit the merge is pinned to is the one
	// read as HEAD above — a hook or concurrent commit that moved HEAD since that read fails closed
	// rather than merging a commit whose approval was never re-verified (#106/#108).
	requireApprovedContent('the merge');
	const headAtMerge = git(toplevel, ['rev-parse', 'HEAD']);
	if (headAtMerge !== headNow) {
		console.error(`wf deliver: HEAD moved to ${headAtMerge.slice(0, 12)} after the merge was pinned to ${headNow.slice(0, 12)}; nothing was merged`);
		process.exit(1);
	}
	// Not --delete-branch: gh would then check out the base branch in this worktree, and it is checked
	// out in the person's clone (finishDelivery does the delete).
	const merged = seams.gh(['pr', 'merge', prUrl, '--merge', '--match-head-commit', headNow], toplevel);
	if (merged.status !== 0) {
		console.error(`FAILED: gh pr merge ${prUrl}\n${(merged.stdout ?? '') + (merged.stderr ?? '')}`.trimEnd());
		process.exit(1);
	}
	// Every --id the round was made with: a round on subitems has one note per subitem (TJEW-670).
	await finishDelivery({ toplevel, state, folder, ids: state?.ids ?? [id], url: prUrl, because: 'merged' });
}

if (process.argv[1]?.endsWith('deliver.ts')) await runDeliver();
