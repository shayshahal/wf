#!/usr/bin/env node
// Decision-record parser: YAML frontmatter + sha256 body hash + JSON-schema check.
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import Ajv from 'ajv';

const ROOT = dirname(fileURLToPath(import.meta.url));
const SCHEMA = JSON.parse(readFileSync(join(ROOT, '../../../verification/decisions/_schema.json'), 'utf8'));
const validateFrontmatter = new Ajv({ allErrors: true }).compile(SCHEMA);

export function normalizeBody(body) {
  return body.replace(/\r\n?/g, '\n').replace(/[ \t]+$/gm, '');
}

export function hashBody(body) {
  return 'sha256:' + createHash('sha256').update(normalizeBody(body), 'utf8').digest('hex');
}

export function parseRecord(path) {
  const errors = [];
  let frontmatter = null;
  let body = '';
  try {
    const raw = readFileSync(path, 'utf8');
    const m = raw.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
    if (!m) throw new Error('missing YAML frontmatter (--- fences)');
    frontmatter = YAML.parse(m[1]);
    body = m[2];
  } catch (e) {
    return { frontmatter: null, body: '', hash: '', errors: [`${path}: ${e.message}`] };
  }
  if (!validateFrontmatter(frontmatter)) for (const e of validateFrontmatter.errors ?? []) errors.push(`${path}: schema${e.instancePath || '/'} ${e.message}`);
  const hash = hashBody(body);
  if (frontmatter?.hash && frontmatter.hash !== hash) errors.push(`${path}: hash mismatch (want ${hash})`);
  return { frontmatter, body, hash, errors };
}

export function parseAll(dir) {
  const files = [];
  const walk = (d) => {
    for (const f of readdirSync(d)) {
      if (f.startsWith('_') || f.startsWith('.')) continue;
      const p = join(d, f);
      if (statSync(p).isDirectory()) walk(p);
      else if (f.endsWith('.md')) files.push(p);
    }
  };
  walk(resolve(dir));
  const records = new Map();
  for (const f of files) records.set(f, parseRecord(f));
  const ids = new Set([...records.values()].map((r) => r.frontmatter?.id).filter(Boolean));
  for (const [f, r] of records) {
    const s = r.frontmatter?.supersedes;
    if (s && !ids.has(s)) r.errors.push(`${f}: supersedes target ${s} not found`);
  }
  return records;
}

const checkIdx = process.argv.indexOf('--check');
if (checkIdx !== -1) {
  const dirArg = process.argv[checkIdx + 1];
  const dir = resolve(dirArg && !dirArg.startsWith('-') ? dirArg : 'verification/decisions');
  const records = parseAll(dir);
  const errs = [...records.values()].flatMap((r) => r.errors);
  if (errs.length) {
    console.error(errs.join('\n'));
    process.exit(1);
  }
  console.log(`ok: ${records.size} record(s) valid`);
}
