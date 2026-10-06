// make-demo.mjs — regenerate this demo's rendered pages with wf's own code.
//
// It imports the shipped renderer, so what you open is what a round would produce, not a hand-written
// mock: the T1 page (`## For T1` of SPEC.md), the T2 plan page (PLAN.md), and the REVIEW.md header T2
// sees — the one that carries the `manual:` rows. Change the renderer, run this, see the difference:
// it is the fastest check on a `planPage` or `renderHeader` change, with no round and no worktree.
//
//   node docs/demo/make-demo.mjs           regenerate in docs/demo
//   WF_ROOT=~/other/wf node docs/demo/make-demo.mjs
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

// The wf checkout whose renderer this demo runs: this clone's root (docs/demo → ../..), or WF_ROOT.
const here = dirname(fileURLToPath(import.meta.url));
const WF = process.env.WF_ROOT ?? join(here, '..', '..');
const load = (rel) => import(pathToFileURL(join(WF, rel)).href);

const { planPage, renderSkeleton, roundArtifacts } = await load('src/gates/review-format.ts');
const { forT1Section } = await load('src/gates/design.ts');
const { planCommitRows } = await load('src/round/prompt.ts');
const { manualCheck } = await load('src/gates/check.ts');

const demo = process.argv[2] ? process.argv[2] : here;
const round = 'DEMO-1';
const folder = join(demo, 'bug-reports', round);
const wfDir = join(demo, '.wf');
mkdirSync(wfDir, { recursive: true });

// T1 — what `wf design` writes, from SPEC.md's `## For T1` (gates/design.ts).
const spec = readFileSync(join(folder, 'SPEC.md'), 'utf8');
writeFileSync(join(wfDir, 'SPEC-T1.html'), planPage({
  title: `SPEC — ${round} · For T1`,
  meta: ['spec-sha: sha256:demo', 'the design this round is built against — annotate the markdown'],
  section: forT1Section(spec) ?? '',
  artifacts: roundArtifacts(folder, wfDir),
}));

// T2 — what `wf review` writes, from PLAN.md (gates/review.ts writePlan).
const plan = readFileSync(join(folder, 'PLAN.md'), 'utf8');
writeFileSync(join(wfDir, 'PLAN.html'), planPage({
  title: `PLAN — ${round}`,
  meta: ['class B · base dev', 'the plan the diff is judged against — the markdown is the file of record'],
  section: plan,
  artifacts: roundArtifacts(folder, wfDir),
}));

// T2's REVIEW.md header: the `manual:` rows a check cell can name (gates/review.ts manualFor).
const manual = planCommitRows(plan).flatMap((r) => {
  const text = manualCheck(r.check);
  return text ? [`manual: row ${r.n} — ${text}`] : [];
});
writeFileSync(join(wfDir, 'REVIEW.md'), renderSkeleton({
  round, klass: 'B', base: 'dev', specSha: 'sha256:demo', date: '2026-10-06',
  urls: 'admin:  http://localhost:12001\napi:    http://127.0.0.1:22001/api/v1\n',
  files: [
    'packages/admin/src/lib/listings.remote.ts',
    'packages/admin/src/routes/admin/listings/ListingBadge.svelte',
    'packages/admin/src/routes/admin/listings/listings.test.ts',
  ],
  standards: ['standards: admin-svelte — pass (0 issues)'],
  manual,
}));

console.log(`renderer: ${join(WF, 'src', 'gates', 'review-format.ts')}\nwrote:\n  ${['SPEC-T1.html', 'PLAN.html', 'REVIEW.md'].map((f) => join(wfDir, f)).join('\n  ')}`);
