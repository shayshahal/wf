# Decision sheets and views

Use this format for agreements, assessments, reviews, questions and handovers. Lead with what the
person must decide or know. Show relationships as a view; use prose for the reason it matters.

## Read less

- **Decision first.** One line: proposed change, result, or question. Name the person's next action.
- **Plain language.** Explain what the person sees or what changes, then the engineering reason
  only where it affects their decision. Keep file names, workflow bookkeeping and logs in supporting
  references.
- **One claim per bullet.** Concrete subject + action. Use short labels and ordinary words; no new
  controlled-language parser or mandatory response tokens.
- **Change, proof, limits.** A small before/after or evidence table beats a narrative of the work.
  Link commands, logs and captures; say `NOT MEASURED — <why>` where evidence is missing.
- **Progressive detail.** Put supporting logs and routine implementation detail behind references or
  expandable sections. Keep behavior, exclusions, consequential choices, unrequested additions,
  material risks and the approval question visible.
- **Same authority.** Preserve the requester's exact words and the complete agreed scope. A shorter
  presentation must not silently drop a condition, turn a proposal into proof, or imply approval.

An agreement answers: **Now → Change · Keep/exclude · Choice/why · Proof · Your decision**.
A review answers: **Result · Changed · Evidence · Limits/risks · Your action**.
These are reading prompts, not new headings or workflow state. Keep the existing file sections,
identity headers, comments and verdict syntax. Aim for one screen of decision material; split a
large decision into named views rather than clipping it to fit.

## Choose a view

For each human-facing handoff, choose the smallest form that makes the decision clear. Prefer a
view over a paragraph describing a relationship; a simple fact may remain one line.

| Question | View |
|---|---|
| What changes, and what stays? | Before/after table or shape diff |
| Where does behavior travel? | Call stack (`CALL-STACK-FORMAT.md`) |
| Who owns which files? | File-tree diff |
| What contract or data shape changes? | Request/response, fields or function signatures in a diff |
| Which branches or dependencies matter? | Mermaid flow or sequence |
| What does the person see? | Current capture beside a proposed screen, with widths and directions |
| What depends on a selection, width or state? | One generated HTML view with useful controls |

## Generated UI

Use generated UI beyond screen mockups: compare alternatives, reveal a dependency path, switch
before/after states, or inspect evidence. Each control should answer a real reading question.

- Save one focused HTML artifact in the round folder. The markdown records every agreed condition;
  the view explains it. `wf agree` and `wf review` embed these artifacts beside the agreement.
- Start with the decision and relevant state visible. Use controls for exploration and supporting
  detail, not for hiding exclusions or risks.
- Label **observed**, **proposed**, and **not measured** distinctly. A simulated interaction is not
  evidence that the product implements it. A runtime capture names revision, setup and conditions.
- Keep prototypes local and side-effect-free. Interactive controls change the view, not product
  data, approval records or workflow state. The person's actual ruling uses the normal review path.
- Check the widths, direction, console and interactions relevant to the claim. Report failures or
  limitations; a tool returning successfully does not prove the view is readable.

## Deliver the view

Use the session's native rendering, document, diff or browser tools when available; the configured
presentation adapter supplies their guidance. Discover the actual tools and schemas in that session.
Show the saved artifact faithfully, resolving local images/views or showing them separately. Verify
file-link targets and retain absolute paths in handoffs. If the native surface cannot carry it, show
the exact markdown and verified paths and name the limitation.
External UI is the fallback. A printed handoff is an instruction to present, not evidence it opened.

At T1 show the complete `## Observed` + `## Agreed` material; at T2 show what changed against it,
the assessment, evidence and remaining limits. Keep the current content identity and the person's
actual comments/verdict in the existing review record. Generated UI adds no approval authority.

## View notation

`diff`: `+` added, `-` removed, `~` changed, leading space unchanged. Keep only relevant paths and
fields. One view per point; one line of prose connects it to the next. A consequential control/layout
change needs the proposed screen beside the current capture: textual placement hid JX-1239's narrowed
pickers until T2 (2026-10-12).
