#!/usr/bin/env node
// step.ts — wf step <name> [--waiting-on user|<the project's people>|ci] [--round TJEW-xxx] [--base <ref>] [--class A|B|C]
// `step classify` runs classify.ts; the measured class can only UPGRADE the stored one
// (A→B→C). A class asserted by --class (wf new --class B, or the orchestrator setting C)
// is sticky: a design-first round has no committed code to measure, so the path
// measurement is noise exactly when T1 matters (BJEW-585 pilot notes 3, 5).
// `step design` requires SPEC.md and parks the round on shay unless told otherwise (notes 8, 9).
// `step implement` on a B/C round requires SPEC-REVIEW.md to approve the CURRENT SPEC.md sha:
// a re-spec is a re-T1 (BJEW-586: rev 2 went to implementation on a chat question).
// Writes <git-toplevel>/.wf/state.json = { round, class, base, step, waiting_on, since }.
// `base` is set once by `wf new --base` and reused by every later `step classify`.
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { refuseCaller } from '../refusal.ts';
import { CLASSIFY } from '../paths.ts';
import { lastField, readVerdict, specShaFor } from '../gates/review-format.ts';
import { people } from '../project.ts';
import { seams } from '../seams.ts';
import { roundFile, readState, writeState } from './state.ts';
import type { RoundClass, State } from './state.ts';
import { stepHistory } from './friction.ts';

export const STEPS = ['classify', 'research', 'plan', 'design', 'implement', 'review', 'pr', 'merged', 'held'];
const WAITING = ['user', ...people, 'ci'];
const CLASSES = ['A', 'B', 'C'];
// A `step` refused by a gate that reads the state under the write lock (class/SPEC/PLAN). Thrown from
// inside the updater so the gate and the write are one decision: the updater does not return a patch,
// nothing is written, and runStep reports it as a refusal (issue #107).
class StepGateError extends Error {}
// null = T1 approved the current SPEC.md; otherwise the one-line reason it did not.
export function t1Gap(toplevel: string): string | null {
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
export const higherClass = (a: RoundClass | null, b: RoundClass): RoundClass => (CLASSES.indexOf(a ?? 'A') >= CLASSES.indexOf(b ?? 'A') ? a ?? 'A' : b);

const sh = (args: string[]) => execFileSync('git', args, { encoding: 'utf8' }).trim();

export const planPath = (toplevel: string, state: State | null) => join(toplevel, state?.folder ?? '', 'PLAN.md');

// `wf decide` (ask.ts) writes an answer Shay gave where the implementer will read it.
export function appendDecision(planText: string, text: string, date = new Date().toISOString().slice(0, 10)) {
  const line = `- ${date} ${text.trim()}`;
  const body = planText.replace(/\r\n/g, '\n');
  if (!/^## Decisions[ \t]*$/m.test(body)) return `${body.trimEnd()}\n\n## Decisions\n${line}\n`;
  return body.replace(/^## Decisions[ \t]*\n([\s\S]*?)(?=^## |(?![\s\S]))/m, (m, section: string) => `## Decisions\n${section.trimEnd() ? `${section.trimEnd()}\n` : ''}${line}\n\n`).trimEnd() + '\n';
}

// `quiet`: wf next steps a round as bookkeeping and prints only its own line.
export async function runStep(argv: string[], { quiet = false } = {}) {
  const flag = (name: string) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 ? argv[i + 1] : null;
  };
  const positionals: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--waiting-on' || argv[i] === '--round' || argv[i] === '--base' || argv[i] === '--class') i++;
    else if (!argv[i].startsWith('-')) positionals.push(argv[i]);
  }
  const step = positionals[0];
  if (!STEPS.includes(step)) {
    console.error(`invalid step "${step ?? ''}" — one of: ${STEPS.join(' ')}`);
    refuseCaller();
  }
  const waitingOn = flag('waiting-on') ?? (step === 'design' ? 'user' : null);
  if (waitingOn && !WAITING.includes(waitingOn)) {
    console.error(`invalid --waiting-on "${waitingOn}" — one of: ${WAITING.join(' ')}`);
    refuseCaller();
  }
  const asserted = flag('class');
  if (asserted && !CLASSES.includes(asserted)) {
    console.error(`invalid --class "${asserted}" — one of: ${CLASSES.join(' ')}`);
    refuseCaller();
  }
  const toplevel = sh(['rev-parse', '--show-toplevel']);
  // research and plan are ungated: they are the steps that produce the gates.
  if (step === 'design' && !existsSync(roundFile(toplevel, 'SPEC.md'))) {
    console.error('wf step design: no SPEC.md in the round folder — the design phase writes it before exiting');
    process.exit(2);
  }
  // `## For T1` is the design T1 approves and the round is built against; the rest is working notes
  // (DESIGN-SESSION.md § 5). A SPEC without it has nothing to bind.
  if (step === 'design' && !/^## For T1[ \t]*\r?$/m.test(readFileSync(roundFile(toplevel, 'SPEC.md'), 'utf8'))) {
    console.error('wf step design: SPEC.md has no `## For T1` section — write it last, at the top (SPEC-TEMPLATE.md)');
    process.exit(2);
  }
  const round = flag('round') ?? sh(['rev-parse', '--abbrev-ref', 'HEAD']);
  const assertedClass = (asserted ?? null) as RoundClass | null;
  const prev = readState(toplevel) ?? {};
  // --class is an assertion and wins outright; a measurement can only upgrade what is stored.
  // `classify` runs before the lock (it spawns git), so it measures against the base read here; the
  // write below merges the measurement with the class on disk under the lock.
  let measured: RoundClass | null = null;
  if (step === 'classify') {
    const measureBase = flag('base') ?? prev.base ?? null;
    const out = execFileSync('node', [CLASSIFY, '--json', ...(measureBase ? ['--base', measureBase] : [])], { encoding: 'utf8' });
    measured = JSON.parse(out).class as RoundClass;
    const kept = higherClass(assertedClass ?? prev.class ?? null, measured);
    if ((assertedClass ?? prev.class) && kept !== measured) console.error(`wf step classify: paths measure ${measured}, keeping asserted ${kept} (a class never downgrades)`);
  }
  // A patch of what this step owns, merged by writeState over the state as it is now: id/folder
  // (wf new), commit (wf prompt implement) and any brief another command recorded while this step
  // ran are kept. Writing `prev` back whole took the file to what was on disk when the command
  // started: JX-252 (2026-10-07) briefed validate 7 times and left the file saying count 1.
  // class and base are merged against the state under the write lock, so a concurrent `wf step
  // classify` upgrade or a `wf new --base` another command wrote is kept (issue #107). The gates that
  // read class/SPEC/PLAN are checked inside the updater too, against that same state: a class that
  // went up to B/C while this command ran cannot be written from a pre-lock snapshot that skipped T1.
  // An open question (wf ask) keeps the round waiting on its person until `wf decide` closes it.
  // waiting_on and history read the state inside the write lock: a question another command opened
  // while this step ran still holds the round (issue #107).
  // history: when each step began, for the line reap prints (friction.ts).
  const since = new Date().toISOString();
  let state: State;
  try {
    state = writeState(toplevel, (current) => {
      const klass: RoundClass | null = step === 'classify'
        ? higherClass(assertedClass ?? current.class ?? null, measured as RoundClass)
        : assertedClass ?? current.class ?? null;
      if (step === 'implement' && (klass === 'B' || klass === 'C')) {
        const reason = t1Gap(toplevel);
        if (reason) throw new StepGateError(`class ${klass} round, ${reason} — T1 (wf design) must approve the SPEC.md that is about to be built`);
      }
      // Class A needs no SPEC.md, but it still needs the plan the implementer is fenced to.
      if (step === 'implement' && klass !== 'B' && klass !== 'C' && !existsSync(planPath(toplevel, current))) {
        throw new StepGateError(`no ${current.folder ? `${current.folder}/` : ''}PLAN.md — the plan phase writes it before implementation starts`);
      }
      const base = flag('base') ?? current.base ?? null;
      return {
        round, class: klass, base, step, since,
        waiting_on: waitingOn ?? current.questions?.[0]?.to ?? null,
        history: stepHistory(current.history, step, since),
      };
    });
  } catch (e) {
    if (!(e instanceof StepGateError)) throw e;
    console.error(`wf step ${step}: ${e.message}`);
    process.exit(2);
  }
  if (!quiet) console.log(JSON.stringify(state));
  await notifyAdapters(state);
}

// Tell whatever the machine plugged in (seams.notify: herdr's pane on Shay's) — a failing one never
// fails the command.
export async function notifyAdapters(state: State) {
  for (const notify of seams.notify) {
    try {
      await notify(state);
    } catch { /* best-effort */ }
  }
}
