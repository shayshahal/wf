#!/usr/bin/env node
// Shay's machine binding for the same project-owned diagnostic; the portable kit never imports env/.
import { join } from 'node:path';
import { WF_ROOT } from '../src/paths.ts';
import { plug } from '../src/seams.ts';
import { pieces } from './projects/jewelryx/index.ts';
import { createWorktree } from './worktrees.ts';

plug({ project: pieces, createWorktree, entry: join(WF_ROOT, 'env', 'wf.mjs') });
await import('../projects/jewelryx/baseline-example.mjs');
