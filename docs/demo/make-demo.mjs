// make-demo.mjs — regenerate this demo's rendered pages with wf's own code.
//
// It imports the shipped renderer, so what you open is what a round would produce, not a hand-written
// mock: the T1 page (the agreement's `## Observed` + `## Agreed`), the T2 agreement page (the whole
// AGREEMENT.md), and the REVIEW.md header T2 sees — the one that carries the `manual:` rows. Change
// the renderer, run this, see the difference: it is the fastest check on a `agreementPage` or
// `renderHeader` change, with no round and no worktree.
//
//   node docs/demo/make-demo.mjs           regenerate in docs/demo
//   WF_ROOT=~/other/wf node docs/demo/make-demo.mjs
import { mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The wf checkout whose renderer this demo runs: this clone's root (docs/demo → ../..), or WF_ROOT.
const here = dirname(fileURLToPath(import.meta.url));
const WF = process.env.WF_ROOT ?? join(here, '..', '..');
const load = (rel) => import(pathToFileURL(join(WF, rel)).href);

const { agreementPage, renderSkeleton, roundArtifacts } = await load('src/gates/review-format.ts');
const { agreedSection, agreedOffset } = await load('src/gates/agree.ts');
const { verificationCases } = await load('src/round/agreement.ts');
const { manualCheck } = await load('src/gates/check.ts');

const demo = process.argv[2] ? process.argv[2] : here;
const round = 'DEMO-1';
const folder = join(demo, 'bug-reports', round);
const wfDir = join(demo, '.wf');
mkdirSync(wfDir, { recursive: true });

const agreement = readFileSync(join(folder, 'AGREEMENT.md'), 'utf8');

// T1 — what `wf agree` writes, from the agreement's agreed material (gates/agree.ts). The page's
// blocks carry the AGREEMENT.md line a comment on them folds onto, so `base` is the agreement's own
// line for `## Observed`.
writeFileSync(join(wfDir, 'AGREEMENT-T1.html'), agreementPage({
  title: `Agreement — ${round} · T1`,
  meta: ['agreement-sha: sha256:demo', 'the agreed material this round is built against'],
  section: agreedSection(agreement, 'B'),
  base: agreedOffset(agreement, 'B'),
  artifacts: roundArtifacts(folder, wfDir),
}));

// T2 — what `wf review` writes, from the whole AGREEMENT.md (gates/review.ts writeAgreement).
writeFileSync(join(wfDir, 'AGREEMENT.html'), agreementPage({
  title: `Agreement — ${round}`,
  meta: ['class B · base dev', 'the agreement the diff is judged against — the markdown is the file of record'],
  section: agreement,
  artifacts: roundArtifacts(folder, wfDir),
}));

// T2's REVIEW.md header: the `manual:` rows a verification case can name (gates/review.ts manualFor).
const manual = verificationCases(agreement).flatMap((c) => {
  const text = manualCheck(c.check);
  return text ? [`manual: case ${c.n} — ${text}`] : [];
});
writeFileSync(join(wfDir, 'REVIEW.md'), renderSkeleton({
  round, klass: 'B', base: 'dev',
  contentSha: 'sha256:demo-worktree', headSha: 'sha256:demo-head', date: '2026-10-06',
  urls: 'admin:  http://localhost:12001\napi:    http://127.0.0.1:22001/api/v1\n',
  files: [
    'packages/admin/src/lib/listings.remote.ts',
    'packages/admin/src/routes/admin/listings/ListingBadge.svelte',
    'packages/admin/src/routes/admin/listings/listings.test.ts',
  ],
  assessment: ['assessment: clean (bug-reports/DEMO-1/ASSESSMENT.md)'],
  manual,
}));

// The old route's two pages are not a wf it makes any more; a leftover file is a dangling reference.
for (const stale of ['SPEC-T1.html', 'PLAN.html']) rmSync(join(wfDir, stale), { force: true });

console.log(`renderer: ${join(WF, 'src', 'gates', 'review-format.ts')}\nwrote:\n  ${['AGREEMENT-T1.html', 'AGREEMENT.html', 'REVIEW.md'].map((f) => join(wfDir, f)).join('\n  ')}`);
