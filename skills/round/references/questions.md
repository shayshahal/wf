# Questions and blockers

Use the entry and cwd rules in `../SKILL.md`. A decision lives in the task record, not only in chat
or an Inbox message.

## Record, ask, resume

1. For a new unresolved decision, use `wf ask` (`--to <person>` when it belongs to someone else).
   A builder that cannot proceed writes the brief's `BLOCKED.md` with a `Question:` line; register
   that question with `wf ask --blocked` before handing it over. Existing `q<n>` questions stay mapped
   to that same question; do not create duplicates on resume.
2. For user questions, run `wf inbox`. It sends through the configured optional transport and saves
   replies. If unavailable, ask with this harness's question tool or directly in chat, quoting the
   question with its round id. A transport failure does not authorize the default answer.
3. While awaiting a reply, do only independent authorized work that needs no such ruling, such as
   read-only investigation or separately authorized tasks. The round's open-question gates still apply;
   do not force a blocked brief or handoff. Save the handover and end the turn when nothing useful remains. Wakeups are optional: on any later resume,
   run `wf inbox` again to retrieve replies before `wf next`.
4. Record the person's clear ruling with `wf decide --q <n> "<their words>"`, then `wf next`. A skipped,
   ambiguous or conflicting answer remains open; ask for clarification in the same thread.

Done when the actual ruling is saved against its original question and the task's next action
reflects it. An Inbox reply alone is neither a decision record nor T1/T2 approval.

## Changed agreement

An answer changing scope or agreed behavior uses `wf decide --revise --q <n> "<renewed behavior>"`.
An unsolicited agreement change uses the same command without `--q`. Rework and approve changed
agreed material before dependent implementation. Accepting an unmet agreed behavior is an agreement
change, not a chat-only exception.

For a `fix or accept` ruling, record the person's `fix …` or `accept …` answer, not the transport's
headings. Record `default` only when the person actually chose that default.

## Missing execution capability

Distinguish an engineering decision from a tool, fixture, runtime or permission gap. Record the
exact failed operation, evidence, owner and smallest recovery/rerun action. A product repair is not
charged for an unavailable harness capability. Use `capabilities.md` to choose a real fallback.

Use existing authorized setup where possible. Shared configuration changes, unrelated infrastructure
repair, account changes or a new paid service are separate work requiring authority. Do not expand
the task into fixing every missing prerequisite. Preserve the task so another session can continue.
