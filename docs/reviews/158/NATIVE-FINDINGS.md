# #158 — The installed native open needs a repository parent

Decision needed: must the repository parent already be open before the helper opens a linked checkout?

## Measured on Herdr 0.9.3

| Native operation on a fresh owned fixture | Result |
|---|---|
| `worktree open --cwd <repository> --path <linked-checkout> --no-focus` | Opens the target **and** creates a repository-parent workspace. Target acknowledgement does not identify that extra parent. |
| Same open with `--cwd <linked-checkout>` | Refuses: `linked_worktree_source` — “New and open worktree actions start from the repo parent workspace.” |
| `workspace create --cwd <linked-checkout> --no-focus` | Creates only the target workspace. No native repository/worktree metadata on its workspace record. `worktree list` still finds its path mapping. |
| Close target workspace | Does not remove the Git checkout or close the separately created parent workspace. |

```text
Native worktree open, repository not yet open
  + repository-parent workspace (implicit)
      + target checkout workspace (reported)

Standalone workspace create
  + target checkout workspace (no repository-parent metadata)
```

Sources: `evidence/native-initial.json`, `evidence/native-leftover-root-workspace.json`, `evidence/probe-target-source.log`, `evidence/native-direct-workspace.json`.

## Proposed safe policy

Keep native worktree open. Discover its repository-parent workspace first. Require that workspace to exist. Open with its explicit workspace ID, not a cwd fallback that could create a new parent. If absent, report the prerequisite without mutation.

This preserves the native repository-linked behavior and prevents an extra implicit parent workspace. A new prerequisite becomes visible to the caller. That needs the person's ruling before implementation continues.

Alternative: permit the implicit parent as part of an explicit open. The command must report both effects, including after an uncertain response.

Alternative: open a standalone directory workspace. This avoids the parent, but changes the native integration shape. The helper must serialize creation to prevent concurrent duplicate workspaces.

## Status and limits

- The existing T1 still approves explicit background opening. This finding adds a decision about a missing parent; it is not authority to change that policy silently.
- Current implementation is provisional. It has not passed final assessment and is not ready for publication.
- Controlled peer checks pass 11 groups. Initial focused tool invocation exceeded its 180-second outer deadline after tsc/ESLint passed; isolated peer checks completed. No cause for the timing variance is claimed.
- Native fixture cleanup exposed Windows read-only Git objects and transient directory handles. Initial failures are preserved. Both exploratory workspace effects were identified and closed; their fixture directories were removed. No user workspace was closed.
- No production timeout, process ownership rule or cleanup gate changed. No main Herdr process was stopped, restarted or killed.
