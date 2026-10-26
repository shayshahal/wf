# Questions and blockers

Use the entry and cwd rules in `../SKILL.md`. A decision lives in the task record. Never keep it
only in chat or in an Inbox message.

## Record, ask, resume

1. **Register the question.**
   - For a new unresolved decision, run `wf ask`. Add `--to <person>` when the decision belongs to
     someone else.
   - A builder that cannot proceed writes the `BLOCKED.md` of the brief with a `Question:` line.
     Before the handover, register that question with `wf ask --blocked`.
   - An existing `q<n>` question stays mapped to the same question. On resume, do not create
     duplicates.
2. **Ask the person.**
   - Run `wf inbox`. It sends through the configured optional transport and saves the replies.
   - If it is not available, use the question tool of this harness, or ask in chat. Quote the
     question with its round id.
   - A transport failure does not authorize the default answer.
3. **Wait.**
   - While you wait, do only independent authorized work that needs no such ruling. Examples:
     read-only investigation, or separately authorized tasks.
   - The open-question gates of the round still apply. Do not force a blocked brief or handoff.
   - When nothing useful remains, save the handover and end the turn.
   - Wakeups are optional. On each later resume, run `wf inbox` to get the replies before `wf next`.
4. **Record the ruling.**
   - Run `wf decide --q <n> "<their words>"`. Then run `wf next`.
   - A skipped, ambiguous or conflicting answer stays open. Ask for clarification in the same thread.

Done when the actual ruling is saved against its original question, and the next action of the
task shows it. An Inbox reply alone is not a decision record. It is not T1 or T2 approval.

## Changed agreement

- An answer that changes the scope or the agreed behavior: run
  `wf decide --revise --q <n> "<renewed behavior>"`.
- An agreement change that nobody asked for: run the same command without `--q`.
- Rework the changed agreed material and get it approved before the dependent implementation.
- To accept an agreed behavior that is not met is an agreement change. It is not an exception that
  lives only in chat.

For a `fix or accept` ruling, record the `fix …` or `accept …` answer of the person. Do not record
the headings of the transport. Record `default` only when the person chose that default.

## Missing execution capability

Separate an engineering decision from a gap in a tool, a fixture, a runtime or a permission.
Record:
- the exact operation that failed
- the evidence
- the owner
- the smallest recovery or rerun action

Do not charge a product repair for a harness capability that is not available. Use `capabilities.md`
to choose a real fallback.

Use the existing authorized setup where possible. These are separate work and need authority:
- a change of shared configuration
- a repair of unrelated infrastructure
- a change to an account
- a new paid service

Do not grow the task into a fix of every missing prerequisite. Keep the task so that another
session can continue.
