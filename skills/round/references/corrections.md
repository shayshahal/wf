# Authored corrections

Use the entry and cwd rules in `../SKILL.md`.

A clear round-linked instruction that arrives from the person in chat, review, Inbox,
ticket or PR feedback is recorded once with
`wf correct --source "<actual message/event reference>" --author "<original author>" --scope "<intended scope>" --reason "<why it applies>" "<instruction, verbatim>"`.
Preserve attribution; ordinary discussion, non-directive approval notes and third-party suggestions
are not new assignments. A clear instruction is still actionable when delivered beside an approval:
classify its meaning, not just the review's verdict. If intent is ambiguous, retain the words and ask
only what is missing. Reuse the exact source identity on retry; explicit replacement uses
`--supersedes <id,...>`, never timestamps or a rewritten review verdict. Run `wf next`: the build and
assessment context carries the instruction until it is addressed, blocked or explicitly replaced, and
an outstanding instruction blocks delivery even when file bytes have not changed. A builder records
disposition through the command in its brief. When a concrete blocker clears, record
`wf correct --unblock <id> --note "<what cleared it/source>"`; unblocking is not application. Transport
or dispatch acknowledgement is not application. After disposition, `wf next` may resume unchanged
approved delivery; a changed subject follows fresh assessment and T2. A recorded uncertain merge is
reconciled before repair or follow-up.
