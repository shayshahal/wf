// env/projects/jewelryx/dev.mjs — node dev.mjs <base-port> --slug <slug>, cwd = the worktree: the
// three dev servers the way Shay's machine serves them (behind portless), as a process of their
// own. `wf stacks` runs its dev stack through this file, and finds its servers again by this
// command line (stacks.mjs DEV_SERVER_PATTERN). A round's worktree is served by `wf hook serve`.
import { runDev } from '../../../projects/jewelryx/dev.mjs';
import { portlessServers } from './index.mjs';

const i = process.argv.indexOf('--slug');
const servers = i >= 0 ? portlessServers(process.argv[i + 1]) : null;
await runDev({ worktree: process.cwd(), basePort: process.argv[2], origins: servers?.origins, wrap: servers?.wrap });
