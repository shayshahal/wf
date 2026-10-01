#!/usr/bin/env node
// wf design <round> — T1: annotate the round folder's SPEC.md, fold → SPEC-REVIEW.md next to it.
// Shay annotates only `## For T1` (SPEC-TEMPLATE.md): it is extracted to .wf/SPEC-T1.md and
// that file is what opens. The sha in SPEC-REVIEW.md is still the whole SPEC.md's.
// BJEW-454 rev 1 (312 lines) came back «information overload, i cannot follow this».
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { openInEditor, opensWindows } from '../worktrees/editor.ts';
import { resolveWorktree } from '../worktrees/worktree.ts';
import { appendDatedSection, devUrlsFor, foldFeedbackLine, renderHeader, renderSkeleton, specShaFor } from './review-format.ts';
import { seams } from '../seams.ts';
import { roundFile } from '../round/state.ts';
import { runStep } from '../round/step.ts';

// The `## For T1` section of a SPEC, or null when it has none (`wf step design` refuses that SPEC).
export function forT1Section(text: string) {
  const m = /^## For T1[ \t]*\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text.replace(/\r\n/g, '\n'));
  return m ? m[0].trimEnd() + '\n' : null;
}

export async function runDesign(argv: string[]) {
  const round = argv.find((a) => !a.startsWith('-'));
  if (!round) {
    console.error('usage: wf design <round>');
    process.exit(2);
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
  const toAnnotate = join(worktree, '.wf', 'SPEC-T1.md');
  writeFileSync(toAnnotate, `${forT1Section(readFileSync(spec, 'utf8'))}\n<!-- extracted from SPEC.md § For T1: the design this round is built against; the rest of SPEC.md is working notes. Annotate here -->\n`);
  // The machine's review screen when it has one (seams.reviewUI: plannotator on Shay's), else an editor.
  if (seams.reviewUI?.available()) {
    const line = seams.reviewUI.annotate({ worktree, file: toAnnotate, since: new Date().toISOString() });
    appendDatedSection(file, `${header()}${line ? foldFeedbackLine(line) : 'verdict: dismissed'}`);
    console.log(`wrote ${file}`);
    return;
  }
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
