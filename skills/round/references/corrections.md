# Authored corrections

Use the entry and cwd rules in `../SKILL.md`.

## When to record

A person can give a clear instruction that is linked to the round. It can come in chat, review,
Inbox, ticket or PR feedback. Record it one time:

`wf correct --source "<actual message/event reference>" --author "<original author>" --scope "<intended scope>" --reason "<why it applies>" "<instruction, verbatim>"`

- Keep the attribution.
- These are not new assignments: ordinary discussion, approval notes that are not directives, and
  suggestions from third parties.
- An instruction that arrives beside an approval is still actionable. Classify its meaning. Do not
  classify only the verdict of the review.
- If the intent is not clear, keep the words. Ask only for what is missing.

## Retry and replace

- On retry, use the same source identity.
- To replace an instruction, use `--supersedes <id,...>`. Never use timestamps. Never rewrite a
  review verdict.

## After you record it

1. Run `wf next`. The build context and the assessment context carry the instruction until it is
   addressed, blocked or explicitly replaced.
2. An open instruction blocks delivery, also when the file bytes did not change.
3. The builder records the disposition with the command in its brief.
4. When a concrete blocker clears, run
   `wf correct --unblock <id> --note "<what cleared it/source>"`. Unblocking is not application.
5. A transport or dispatch acknowledgement is not application.
6. After the disposition, `wf next` can resume an approved delivery that did not change. If the
   subject changed, it needs a fresh assessment and T2.
7. Reconcile a recorded uncertain merge before you repair or follow up.
