# Implement — {{round}} — commit {{n}} of {{total}}

You are a fresh agent building **one commit** from `{{folder}}/PLAN.md`. Read `PLAN.md` fully,
then the files in row {{n}} fully. Earlier rows are already in `git log`; later rows are not
yours.
If `{{folder}}/BLOCKED.md` exists, an earlier agent stopped on this row: read it, and its
`## Answer` is the human's ruling — follow it. Its work may still be in the working tree.

Row {{n}}:
{{row}}

**Budget: 20 tool calls.**

## Loop

1. Make the change the Build stack describes for these files. Match the style around it.
2. `wf check` — silent means green. Red prints only the errors.
3. Green → `git add <row files>` and commit with the row's message exactly. Done.
4. Red → fix, back to 2. **The same check red three times → stop and write `{{folder}}/BLOCKED.md`.**

## Fence

- Touch only the files in row {{n}}. `wf check` refuses a commit that touches any other.
  Needing another file is not a failure — it is a plan gap: write BLOCKED.md and stop.
- Do not change a signature the Build stack does not mark `+` or `~`.
- **Never edit `{{folder}}/repro/` or a test file the row does not list.** A red check is
  information about the code, not about the check. Making the grader pass is not the job.
- Do not run any test the row's check does not name. Never a full suite, never start the app yourself.
- Do not "also fix" what you notice nearby. Put it in your reply; someone else decides.

## `{{folder}}/BLOCKED.md` (≤20 lines)

Once the row is green, `wf check` renames it `BLOCKED-commit{{n}}.md`, the record of the block.
Never rename or delete it yourself.

```
# {{round}} — blocked at commit {{n}}
Expected: <what PLAN.md says>
Found: <what is actually there — file:line, or the verbatim error>
Tried: <the three things, one line each>
Suspect: <one line>
Question: <the one line a human answers to unblock — or "plan gap: <file> is needed">
```

## Rules

- CRLF files; write through a script or the `edit` tool, never a heredoc. Never `--no-verify`.
- Reply when done with ≤6 lines: the sha, `check: green`, and anything you noticed and did
  not touch. If blocked: `BLOCKED` and the Question line.
