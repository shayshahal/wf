#!/usr/bin/env node
// step.mjs — wf step <name> [--waiting-on shay|<the project's people>|ci] [--round TJEW-xxx] [--base <ref>] [--class A|B|C]
// `step classify` runs classify.mjs; the measured class can only UPGRADE the stored one
// (A→B→C). A class asserted by --class (wf new --class B, or the orchestrator setting C)
// is sticky: a design-first round has no committed code to measure, so the path
// measurement is noise exactly when T1 matters (BJEW-585 pilot notes 3, 5).
// `step design` requires SPEC.md and parks the round on shay unless told otherwise (notes 8, 9).
// `step implement` on a B/C round requires SPEC-REVIEW.md to approve the CURRENT SPEC.md sha:
// a re-spec is a re-T1 (BJEW-586: rev 2 went to implementation on a chat question).
// Writes <git-toplevel>/.wf/state.json = { round, class, base, step, waiting_on, since }.
// `base` is set once by `wf new --base` and reused by every later `step classify`.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { lastField, readVerdict, specShaFor } from './review-format.mjs';
import { people } from './project.mjs';
import { roundFile } from './state.mjs';

export const STEPS = ['classify', 'research', 'plan', 'design', 'implement', 'review', 'pr', 'merged', 'held'];
const WAITING = ['shay', ...people, 'ci'];
const CLASSES = ['A', 'B', 'C'];
// null = T1 approved the current SPEC.md; otherwise the one-line reason it did not.
export function t1Gap(toplevel) {
  const current = specShaFor(toplevel);
  if (!current) return 'no SPEC.md';
  let text;
  try { text = readFileSync(roundFile(toplevel, 'SPEC-REVIEW.md'), 'utf8'); } catch { return 'no SPEC-REVIEW.md'; }
  const reviewed = lastField(text, 'spec-sha');
  if (reviewed !== current) return `SPEC-REVIEW.md is of ${reviewed ?? 'no sha'}, SPEC.md is now ${current}`;
  const verdict = readVerdict(text);
  if (verdict !== 'approved') return `SPEC-REVIEW.md verdict is ${verdict ?? 'pending'}`;
  return null;
}
export const higherClass = (a, b) => (CLASSES.indexOf(a ?? 'A') >= CLASSES.indexOf(b ?? 'A') ? a ?? 'A' : b);

const sh = (args) => execFileSync('git', args, { encoding: 'utf8' }).trim();

export const planPath = (toplevel, state) => join(toplevel, state?.folder ?? '', 'PLAN.md');

// `wf decide` (ask.mjs) writes an answer Shay gave where the implementer will read it.
export function appendDecision(planText, text, date = new Date().toISOString().slice(0, 10)) {
  const line = `- ${date} ${text.trim()}`;
  const body = planText.replace(/\r\n/g, '\n');
  if (!/^## Decisions[ \t]*$/m.test(body)) return `${body.trimEnd()}\n\n## Decisions\n${line}\n`;
  return body.replace(/^## Decisions[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m, (m, section) => `## Decisions\n${section.trimEnd() ? `${section.trimEnd()}\n` : ''}${line}\n\n`).trimEnd() + '\n';
}

export async function runStep(argv) {
  const flag = (name) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : null;
  };
  const positionals = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--waiting-on' || argv[i] === '--round' || argv[i] === '--base' || argv[i] === '--class') i++;
    else if (!argv[i].startsWith('-')) positionals.push(argv[i]);
  }
  const step = positionals[0];
  if (!STEPS.includes(step)) {
    console.error(`invalid step "${step ?? ''}" — one of: ${STEPS.join(' ')}`);
    process.exit(2);
  }
  const waitingOn = flag('waiting-on') ?? (step === 'design' ? 'shay' : null);
  if (waitingOn && !WAITING.includes(waitingOn)) {
    console.error(`invalid --waiting-on "${waitingOn}" — one of: ${WAITING.join(' ')}`);
    process.exit(2);
  }
  const asserted = flag('class');
  if (asserted && !CLASSES.includes(asserted)) {
    console.error(`invalid --class "${asserted}" — one of: ${CLASSES.join(' ')}`);
    process.exit(2);
  }
  const toplevel = sh(['rev-parse', '--show-toplevel']);
  // research and plan are ungated: they are the steps that produce the gates.
  if (step === 'design' && !existsSync(roundFile(toplevel, 'SPEC.md'))) {
    console.error('wf step design: no SPEC.md in the round folder — the design phase writes it before exiting');
    process.exit(2);
  }
  const round = flag('round') ?? sh(['rev-parse', '--abbrev-ref', 'HEAD']);
  const file = join(toplevel, '.wf', 'state.json');
  let prev = {};
  try {
    prev = JSON.parse(readFileSync(file, 'utf8'));
  } catch { /* first step in this worktree */ }
  // --class is an assertion and wins outright; a measurement can only upgrade what is stored.
  let klass = asserted ?? prev.class ?? null;
  if (step === 'implement' && (klass === 'B' || klass === 'C')) {
    const reason = t1Gap(toplevel);
    if (reason) {
      console.error(`wf step implement: class ${klass} round, ${reason} — T1 (wf design) must approve the SPEC.md that is about to be built`);
      process.exit(2);
    }
  }
  // Class A needs no SPEC.md, but it still needs the plan the implementer is fenced to.
  if (step === 'implement' && klass !== 'B' && klass !== 'C' && !existsSync(planPath(toplevel, prev))) {
    console.error(`wf step implement: no ${prev.folder ? `${prev.folder}/` : ''}PLAN.md — the plan phase writes it before implementation starts`);
    process.exit(2);
  }
  const base = flag('base') ?? prev.base ?? null;
  if (step === 'classify') {
    const out = execFileSync('node', [join(dirname(fileURLToPath(import.meta.url)), 'classify.mjs'), '--json', ...(base ? ['--base', base] : [])], { encoding: 'utf8' });
    const measured = JSON.parse(out).class;
    const kept = higherClass(klass, measured);
    if (klass && kept !== measured) console.error(`wf step classify: paths measure ${measured}, keeping asserted ${kept} (a class never downgrades)`);
    klass = kept;
  }
  // Spread prev: id/folder (wf new) and commit (wf prompt implement) are not this step's to drop.
  // An open question (wf ask) keeps the round waiting on its person until `wf decide` closes it.
  const state = { ...prev, round, class: klass, base, step, waiting_on: waitingOn ?? prev.questions?.[0]?.to ?? null, since: new Date().toISOString() };
  mkdirSync(join(toplevel, '.wf'), { recursive: true });
  writeFileSync(file, JSON.stringify(state, null, 2) + '\n');
  console.log(JSON.stringify(state));
  await notifyAdapters(state);
}

// Notify every adapter whose is<Name>Present() is true — a failing adapter never fails the command.
export async function notifyAdapters(state) {
  const dir = join(dirname(fileURLToPath(import.meta.url)), 'adapters');
  let names = [];
  try {
    names = readdirSync(dir).filter((n) => n.endsWith('.mjs'));
  } catch { /* no adapters yet */ }
  for (const n of names) {
    try {
      const adapter = await import(`./adapters/${n}`);
      const present = Object.entries(adapter).find(([k]) => /^is\w+Present$/.test(k))?.[1];
      const report = Object.entries(adapter).find(([k]) => /^reportStepTo\w+$/.test(k))?.[1];
      if (present?.() === true) await report?.(state);
    } catch { /* adapters are best-effort */ }
  }
}
