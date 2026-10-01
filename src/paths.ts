// paths.ts — where wf's own files are. The modules live under src/; the entry (wf.mjs), the prompts,
// process docs, skills and projects/ at the copy's root (2026-10-01). A module naming one of those
// starts from WF_ROOT, not from its own folder, so moving a module never moves what it reads.
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const WF_ROOT = fileURLToPath(new URL('..', import.meta.url)).replace(/[\\/]$/, '');
// WF_ROOT with forward slashes: what prompts and printed commands name.
export const WF_HOME = WF_ROOT.replace(/\\/g, '/');
// Run as a script by `wf step classify` and the T2 header, not imported: it exits the process.
export const CLASSIFY = join(WF_ROOT, 'src', 'gates', 'classify.ts');
