# Open existing wf checkouts in Herdr

This is an optional machine integration. The portable kit does not need Herdr. Worktrunk/Git still create and remove checkouts. The helper opens a terminal workspace, not a new checkout or agent session.

## Commands

Run the machine entry from a checkout in the repository, inside Herdr:

```sh
wfk herdr list
wfk herdr open "C:/path/to/existing-checkout"
```

Use the entry that owns a round. The normal round-state, configured-entry and native-session guards still apply. A shell `cd` is not a native session rebind. When developing wf itself, test this clone with `node env/wf.mjs herdr …`; do not install an unapproved clone as the live runtime.

| Operation | Effect |
|---|---|
| `list` | JSON with Git-registered paths/branches, Herdr workspace mappings and the repository-parent reference |
| `open <path>` | Reuse an existing workspace or request one background open of that exact registered checkout |
| Missing parent workspace | Refuse; report its path. Open the parent explicitly in Herdr, then retry. |
| Outside Herdr | Refuse without calling the native CLI; ordinary wf commands and the printed checkout path still work. |
| Close a workspace | Does **not** reap, release owned dependencies, clear approvals or complete delivery. |

The repository parent must already be open. The helper sends its explicit workspace ID to native open. It never falls back to a cwd-based open that could create an implicit parent. Both the new workspace and the existing caller retain their focus policy. Repeated open discovers the current mapping instead of opening another terminal workspace.

Normal repositories and the machine's bare layout (`.git` pointing to `.bare`) are verified. Detached checkouts are valid targets. The helper does not migrate layouts or add a `.git` pointer to a repository. Other layouts can be refused by the native CLI; that is not a reason to change their layout automatically.

## Read the result

```json
{"kind":"listed","worktrees":[{"path":"…","branch":"…","detached":false,"bare":false,"workspace":null}],"parent":{"path":"…","workspace":"w…"}}
```

```json
{"kind":"opened","checkout":{"path":"…","branch":"…","detached":false,"bare":false,"workspace":"w…"},"disposition":"opened"}
```

`disposition` is `reused` when discovery already found a workspace. A workspace ID is not proof that an agent session has rebound. `opened_by` pane/session provenance is not rewritten.

A refusal or uncertain outcome exits nonzero. `kind: uncertain` means the native operation might have committed. It is not permission to remove the checkout, close another workspace or retry mutations automatically. Keep the checkout. Inspect discovery, then retry an explicit open; the helper reconciles the mapping first. Unavailable inventory, malformed replies and partial effects never become an empty-as-safe result.

Raw provider stderr is not relayed. Inspect Herdr directly for its detailed error or trust prompt. The helper never grants trust or changes repository configuration. It has no create/remove/reap/focus/session-launch action.

## After wf new

Inside Herdr, the machine entry prints an **inert** handoff with an argv array for the exact existing checkout. It does not run that array or open a workspace automatically. An authenticated T3 handoff remains first when both hosts are present; the Herdr instructions do not replace native session-binding requirements.

## Cleanup

Leave round-bound sessions before reap. Use the recorded wf entry from a surviving checkout. The existing delivery, ownership and recovery rules remain in force. Close acknowledgement from Herdr is not proof that Windows has released every directory handle, or that wf may delete a checkout.
