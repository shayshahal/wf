#!/usr/bin/env node
// wf design <round> — T1: annotate the round folder's SPEC.md rendered as a page, fold → SPEC-REVIEW.md.
// Shay annotates only `## For T1` (SPEC-TEMPLATE.md): it is extracted to .wf/SPEC-T1.md — the text an
// editor shows on a machine with no review screen — and rendered to .wf/SPEC-T1.html, which is what a
// review screen annotates. Each block of the page carries its SPEC.md line, so a comment folds onto the
// line it was made on (review-format.ts pageLine) even though the markdown is not what was clicked.
// The sha in SPEC-REVIEW.md is still the whole SPEC.md's.
// BJEW-454 rev 1 (312 lines) came back «information overload, i cannot follow this».
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { refuseCaller } from '../refusal.ts';
import { openFile, openInEditor, opensWindows } from '../worktrees/editor.ts';
import { resolveWorktree } from '../worktrees/worktree.ts';
import { appendDatedSection, devUrlsFor, foldFeedbackLine, planPage, renderHeader, renderSkeleton, roundArtifacts, specShaFor } from './review-format.ts';
import { seams } from '../seams.ts';
import { roundFile } from '../round/state.ts';
import { runStep } from '../round/step.ts';

// The `## For T1` section of a SPEC, or null when it has none (`wf step design` refuses that SPEC).
export function forT1Section(text: string) {
  const m = /^## For T1[ \t]*\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text.replace(/\r\n/g, '\n'));
  return m ? m[0].trimEnd() + '\n' : null;
}

// The 0-based line `## For T1` starts at in SPEC.md: the page renders only that section, so without it
// every block's `wf-src-<line>` would be a line of the extract and not of the SPEC.md it is read in.
// No section (forT1Section null, which `wf step design` refuses) → 0.
export function forT1Offset(text: string) {
  return Math.max(0, text.replace(/\r\n/g, '\n').split('\n').findIndex((l) => /^## For T1[ \t]*$/.test(l)));
}

export async function runDesign(argv: string[]) {
  const round = argv.find((a) => !a.startsWith('-'));
  if (!round) {
    console.error('usage: wf design <round>');
    refuseCaller();
  }
  const { path: worktree } = resolveWorktree(round);
  const spec = roundFile(worktree, 'SPEC.md');
  if (!existsSync(spec)) {
    console.error(`no ${spec} yet — the design session writes it`);
    process.exit(2);
  }
  const prev = process.cwd();
  process.chdir(worktree);
  try {
    await runStep(['design', '--waiting-on', 'user', '--round', round]);
  } finally {
    process.chdir(prev);
  }
  const header = () => renderHeader({ round, specSha: specShaFor(worktree), urls: devUrlsFor(worktree) });
  const file = roundFile(worktree, 'SPEC-REVIEW.md');
  mkdirSync(join(worktree, '.wf'), { recursive: true });
  const specText = readFileSync(spec, 'utf8');
  const section = forT1Section(specText) ?? '';
  const toAnnotate = join(worktree, '.wf', 'SPEC-T1.md');
  writeFileSync(toAnnotate, `${section}\n<!-- extracted from SPEC.md § For T1: the design this round is built against; the rest of SPEC.md is working notes. Annotate here -->\n`);
  // The same section as a page, its views drawn (review-format.ts planPage). The page is what the person
  // annotates when the machine has a review screen, so every block carries its SPEC.md line (`base`); the
  // markdown extract above is what an editor shows when it has none.
  const pageFile = join(worktree, '.wf', 'SPEC-T1.html');
  writeFileSync(pageFile, planPage({
    title: `SPEC — ${round} · For T1`,
    meta: [`spec-sha: ${specShaFor(worktree) ?? 'n/a'}`, 'the design this round is built against'],
    section,
    base: forT1Offset(specText),
    artifacts: roundArtifacts(dirname(spec), join(worktree, '.wf')),
  }));
  console.log(`page: ${pageFile}`);
  // The machine's review screen when it has one (seams.reviewUI: plannotator on Shay's), else an editor.
  // The screen shows this page itself, so wf opens nothing beside it: one look, not two tabs.
  if (seams.reviewUI?.available()) {
    const line = seams.reviewUI.annotate({ worktree, file: pageFile, since: new Date().toISOString() });
    appendDatedSection(file, `${header()}${line ? foldFeedbackLine(line) : 'verdict: dismissed'}`);
    console.log(`wrote ${file}`);
    return;
  }
  openFile(pageFile);
  if (!existsSync(file)) appendDatedSection(file, renderSkeleton({ round, specSha: specShaFor(worktree), urls: devUrlsFor(worktree) }));
  if (!opensWindows()) {
    console.log(`to annotate: ${toAnnotate}
review file: ${file}
  Claude Code: show the person this section (in plain words if they ask, adding nothing it does not say); write into the review file a \`note —\` line with what you showed them, verbatim, then their comments and the verdict they said`);
    return;
  }
  if (!openInEditor([worktree, toAnnotate])) console.log(`fallback: no editor found — annotate by hand:\n  worktree: ${worktree}\n  spec: ${toAnnotate}\n  review file: ${file}`);
  else console.log(`skeleton at ${file} — fill the comments + verdict: line`);
}
