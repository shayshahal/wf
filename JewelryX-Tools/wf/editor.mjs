// editor.mjs — $VISUAL → $EDITOR → code fallback. Returns true when an editor was spawned.
import { execFileSync, spawnSync } from 'node:child_process';
function resolvable(bin) {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [bin], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}
export function openInEditor(paths) {
  for (const raw of [process.env.VISUAL, process.env.EDITOR, 'code']) {
    if (!raw) continue;
    const [bin, ...rest] = raw.split(/\s+/);
    if (!resolvable(bin)) continue;
    spawnSync(bin, [...rest, ...paths], { stdio: 'inherit' });
    return true;
  }
  return false;
}
