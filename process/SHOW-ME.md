# Decision sheets and views

Use this format for agreements, assessments, reviews, questions and handovers. Lead with what the
person must decide or know. Show relationships as a view; use prose for the reason it matters.

## Read less

Show, don't narrate. Length does not matter: a long diff or long text is fine when it sits behind
one of the forms below. Prose alone is not an accepted handoff.

- **Decision first.** One line: the change, the result or the question. Name the person's next action.
- **Use these forms, not paragraphs:**
  - **Code shape:** call stack (now and after), interfaces, types and signatures, data model, state
    machine, sequence, dependency graph, architecture diagram, file tree of what changes.
  - **Before/after:** side-by-side table, input→output examples, a diff of the contract.
  - **Proof:** command with exact output, red→green pair, test names with results, the key log line
    marked, before/after screenshots, recordings. Write `NOT MEASURED — <why>` where proof is missing.
  - **Visual:** diagram, flow, mockup, annotated screenshot.
  - **Decision:** one question, 2-4 options, a recommendation, the result of each option. Ask a
    product question in product terms (what the user sees), not in code terms.
- **Write in ASD-STE100.** Short sentences. One instruction per sentence. Active voice. Direct
  commands. One word for one meaning, used the same way every time. Put "only" and "not" next to
  the word they change. Make "it", "this" and "they" point at one thing.
- **Do not write:** a story of the work ("I then..."), a summary that repeats the diff, hedged paragraphs.
- **Same authority.** Keep the requester's exact words and the complete agreed scope. Do not drop a
  condition, turn a proposal into proof, or imply approval.

An agreement answers: **Now → Change · Keep/exclude · Choice/why · Proof · Your decision**.
A review answers: **Result · Changed · Evidence · Limits/risks · Your action**.
These are reading prompts, not new headings or workflow state. Keep the existing file sections,
identity headers, comments and verdict syntax. Do not clip content to fit a screen; split a large
decision into named views.

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

## UI changes: required PR images

Every PR that changes UI must show before and after screenshots for each affected view or state.
Capture the base behavior before implementation and the final behavior with matching scenario,
viewport, direction and data. For a new or removed view, show the corresponding baseline or final
state (such as the page without that view), and label it. Use actual product captures.

Keep originals in the round's `proof/` folder as `before-<label>` / `after-<label>`. Record the
pairs under `## UI evidence` in the working document (`TICKET.md` for A, `AGREEMENT.md` for B/C),
with a short caption naming the scenario and conditions:

```markdown
## UI evidence

### <view or state> — <viewport, direction, scenario>
| Before | After |
|---|---|
| ![Before: <view>](<durable image URL>) | ![After: <view>](<durable image URL>) |
```

Use image URLs accessible to the PR's reviewers after the worktree is removed: uploaded attachments
or committed images linked at an immutable revision. Verify that both images render on GitHub.
Local paths and ignored `proof/` files alone do not meet the requirement. `wf deliver` copies this
section into the PR description, including on retry; keep it current in the working document.

The builder supplies the pairs before assessment; the independent reviewer checks their coverage
against the actual UI diff and treats missing, stale or inaccessible images as repair findings.
An unavailable capture or upload capability leaves the requirement unmet: record the limitation
and recovery owner and keep the work pending. Non-UI changes need no image section.

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
