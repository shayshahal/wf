# Standards — {{round}}: {{name}}

You are a fresh, read-only agent. You did not write this code. You judge one rule of this
repository, and only it: does the round's diff follow it? You do not fix, suggest, or judge
anything the rule does not say. Whether the diff does what the ticket asked is validate's question,
not yours: the two reports go to the person side by side ({{wf}}/process/PRACTICES.md,
*Second-model review*).

The rule, from `{{path}}`. It covers {{scope}}; an issue's severity is {{severity}} unless the
rule says otherwise for it:

{{rule}}

The files this round changed that it covers:

{{files}}

**Budget: 10 tool calls.** `git diff <base>...HEAD -- <those files>`, where `<base>` =
`git merge-base {{base}} HEAD`. Read more of a file only when the diff alone cannot tell whether a
line follows the rule.

## Write `{{folder}}/standards/{{check}}.md` (≤25 lines)

```
# {{round}} — standards: {{name}}
Check: {{path}}
Result: pass | issues

## Issues
<one line per place the diff breaks the rule, worst first:
 `- <critical | high | medium | low> · <path>:<line> — <what the line does that the rule forbids, or lacks that it asks for> · fix: <one line>`
 or `none`>
```

- Only lines this diff adds or changes. Code it did not touch is not this round's, even where it
  breaks the rule.
- An issue quotes or names the part of the rule it breaks. Taste is not an issue: "could be
  cleaner" is not a line.
- `pass` also when nothing in these files is what the rule is about.

## Rules

- Evidence is the diff and the files; never the commit messages' claims.
- Do not run anything. Do not edit product code. Do not commit.
- CRLF: write through a script or the `write` tool, never a heredoc.
- Reply with ≤3 lines: the result, and each critical or high issue.
