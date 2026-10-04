// env/models.ts — the model each effort level runs on in pi (src/models.ts), and what pi resolves it
// to. pi takes `provider/pattern[:thinking]`: a pattern that is no model id matches the ids that
// contain it, and pi picks the newest undated one (its core/model-resolver.js tryMatchModel, read at
// 0.73.1, 2026-10-03). So `anthropic/opus` is the newest Opus pi knows, as `opus` is in Claude Code,
// and a new model needs no change here. `wf models` asks pi which models it has (`--list-models`:
// the ones it has credentials for) and prints what each level becomes; pi's own `--model` picks among
// every model it knows, so the two differ only for a provider pi has no key for.
import { spawnSync } from 'node:child_process';
import type { Models } from '../src/models.ts';

export const PI_MODELS: Models = { low: 'anthropic/sonnet', medium: 'anthropic/opus:medium' };

const THINKING = ['off', 'minimal', 'low', 'medium', 'high', 'xhigh'];

// Pure: `pi --list-models` output → [provider, id] rows (its header row and blank lines dropped).
export function listed(text: string): [string, string][] {
	return text.split('\n').map((l) => l.trim().split(/\s+/)).filter((c) => c.length >= 2 && c[0] !== 'provider').map((c) => [c[0], c[1]]);
}

// Pure: the model pi runs for `model` among `rows`, as `provider/id[:thinking]`, or null: an exact
// id first, else the ids that contain the pattern, undated before dated, highest first (pi's order).
export function pickModel(model: string, rows: [string, string][]): string | null {
	const colon = model.lastIndexOf(':');
	const thinking = colon !== -1 && THINKING.includes(model.slice(colon + 1)) ? model.slice(colon + 1) : null;
	const ref = thinking ? model.slice(0, colon) : model;
	const slash = ref.indexOf('/');
	const provider = slash === -1 ? null : ref.slice(0, slash).toLowerCase();
	const pattern = (slash === -1 ? ref : ref.slice(slash + 1)).toLowerCase();
	const pool = rows.filter(([p]) => !provider || p.toLowerCase() === provider);
	const exact = pool.find(([, id]) => id.toLowerCase() === pattern);
	const dated = (id: string) => /-\d{8}$/.test(id) && !id.endsWith('-latest');
	const matches = pool.filter(([, id]) => id.toLowerCase().includes(pattern));
	const undated = matches.filter(([, id]) => !dated(id));
	const pick = exact ?? (undated.length ? undated : matches).sort(([, a], [, b]) => b.localeCompare(a))[0];
	return pick ? `${pick[0]}/${pick[1]}${thinking ? `:${thinking}` : ''}` : null;
}

let rows: [string, string][] | null = null;
// What pi resolves `model` to on this machine, or null when it has no model that matches. pi prints
// the table on stderr (0.73.1, 2026-10-03: read from stdout alone, every level matched nothing).
export function resolvePi(model: string): string | null {
	if (!rows) {
		const r = spawnSync('pi', ['--list-models'], { encoding: 'utf8', shell: process.platform === 'win32' });
		if (r.error) throw new Error(`pi --list-models: ${r.error.message}`);
		rows = listed(`${r.stdout ?? ''}\n${r.stderr ?? ''}`);
	}
	return pickModel(model, rows);
}
