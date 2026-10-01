// Plannotator adapter: browser annotation for T1 (annotate) and T2 (review).
// Spiked 17 Sep (v0.27.15): stdout carries only {decision,message}; the structured
// annotations[] land in {PLANNOTATOR_DATA_DIR}/feedback/<project>/index.jsonl on submit.
import { execFileSync, spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
export const dataDir = (worktree) => join(worktree, '.wf', 'plannotator');
// The binary: PATH first; else the Windows installer's dir, because a harness started
// before the install (pi, herdr) keeps its old PATH and would otherwise fall back to $EDITOR.
const installedExe = () => (process.env.LOCALAPPDATA ? join(process.env.LOCALAPPDATA, 'plannotator', 'plannotator.exe') : null);
function plannotatorBin() {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', ['plannotator'], { stdio: 'ignore' });
    return 'plannotator';
  } catch { /* not on this process's PATH */ }
  const exe = installedExe();
  return exe && existsSync(exe) ? exe : null;
}
export function isPlannotatorPresent() {
  if (process.env.PLANNOTATOR_DISABLE === '1') return false;
  return plannotatorBin() !== null;
}
function newestLine(dir, surface, since) {
  let best = null;
  const fb = join(dir, 'feedback');
  for (const proj of existsSync(fb) ? readdirSync(fb) : []) {
    const f = join(fb, proj, 'index.jsonl');
    if (!existsSync(f)) continue;
    for (const raw of readFileSync(f, 'utf8').split('\n')) {
      if (!raw.trim()) continue;
      try {
        const line = JSON.parse(raw); // partial write on submit throws — skipped
        if (line.surface === surface && (!since || line.ts >= since) && (!best || line.ts > best.ts)) best = line;
      } catch { /* skip */ }
    }
  }
  return best;
}
// Blocking spawn (human submits in the browser); fold the newest line. Null = dismissed/none.
function runAndFold({ worktree, args, surface, since }) {
  spawnSync(plannotatorBin(), args, { cwd: worktree, env: { ...process.env, PLANNOTATOR_DATA_DIR: dataDir(worktree) }, stdio: 'inherit' });
  const line = newestLine(dataDir(worktree), surface, since);
  return !line || line.decision === 'dismissed' ? null : line;
}
export const annotateFile = ({ worktree, file, since }) =>
  runAndFold({ worktree, args: ['annotate', file, '--gate', '--json', '--require-approval'], surface: 'annotate', since });
export const reviewDiff = ({ worktree, base, diffType = 'branch', since }) =>
  runAndFold({ worktree, args: ['review', '--base', base, '--diff-type', diffType, '--json'], surface: 'review', since });
