#!/usr/bin/env node
// wf design <round> — T1: annotate SPEC.md in the round's worktree, fold → SPEC-REVIEW.md.
// Shay annotates only `## For T1` (SPEC-TEMPLATE.md): it is extracted to .wf/SPEC-T1.md and
// that file is what opens. The sha in SPEC-REVIEW.md is still the whole SPEC.md's.
// BJEW-454 rev 1 (312 lines) came back «information overload, i cannot follow this».
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { isPlannotatorPresent, annotateFile } from './adapters/plannotator.mjs';
import { openInEditor } from './editor.mjs';
import { resolveWorktree } from './resolve-worktree.mjs';
import { appendDatedSection, devUrlsFor, foldFeedbackLine, renderHeader, renderSkeleton, specShaFor } from './review-format.mjs';
import { runStep } from './step.mjs';

// The `## For T1` section of a SPEC, or null when the SPEC has none (older shape: annotate it whole).
export function forT1Section(text) {
  const m = /^## For T1[ \t]*\r?\n([\s\S]*?)(?=^## |(?![\s\S]))/m.exec(text.replace(/\r\n/g, '\n'));
  return m ? m[0].trimEnd() + '\n' : null;
}

export async function runDesign(argv) {
  const round = argv.find((a) => !a.startsWith('-'));
  if (!round) {
    console.error('usage: wf design <round>');
    process.exit(2);
  }
  const { path: worktree } = resolveWorktree(round);
  const spec = join(worktree, 'SPEC.md');
  if (!existsSync(spec)) {
    console.error('no SPEC.md yet — the design session writes it');
    process.exit(2);
  }
  const prev = process.cwd();
  process.chdir(worktree);
  try {
    await runStep(['design', '--waiting-on', 'shay', '--round', round]);
  } finally {
    process.chdir(prev);
  }
  const header = () => renderHeader({ round, specSha: specShaFor(worktree), urls: devUrlsFor(worktree) });
  const file = join(worktree, 'SPEC-REVIEW.md');
  const t1 = forT1Section(readFileSync(spec, 'utf8'));
  let toAnnotate = spec;
  if (t1) {
    mkdirSync(join(worktree, '.wf'), { recursive: true });
    toAnnotate = join(worktree, '.wf', 'SPEC-T1.md');
    writeFileSync(toAnnotate, `${t1}\n<!-- extracted from SPEC.md § For T1 — the full spec is the worker's; annotate here -->\n`);
  } else console.error('wf design: SPEC.md has no `## For T1` section — annotating the whole file (SPEC-TEMPLATE.md asks for one)');
  if (isPlannotatorPresent()) {
    const line = annotateFile({ worktree, file: toAnnotate, since: new Date().toISOString() });
    appendDatedSection(file, `${header()}${line ? foldFeedbackLine(line) : 'verdict: dismissed'}`);
    console.log(`wrote ${file}`);
    return;
  }
  if (!existsSync(file)) appendDatedSection(file, renderSkeleton({ round, specSha: specShaFor(worktree), urls: devUrlsFor(worktree) }));
  if (!openInEditor([worktree, toAnnotate])) console.log(`fallback: no editor found — annotate by hand:\n  worktree: ${worktree}\n  spec: ${toAnnotate}\n  review file: ${file}`);
  else console.log(`skeleton at ${file} — fill the comments + verdict: line`);
}
