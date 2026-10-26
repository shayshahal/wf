# Call-stack format

This file says how to write a call stack. A call stack appears in these places:
- `AGREEMENT.md`, `## Observed` (the as-is stack)
- `AGREEMENT.md`, a candidate view under `## Agreed`
- the `## Design` of the assessment

**Write a stack in diff syntax.** What changes is the important part. An unchanged hop is context.
It is not content.

Some changes are not a call path: a data structure, a SQL table, an API contract, a file tree, a
branch that a stack flattens. Show these as one of the views in `SHOW-ME.md`. Use the same `+ ~ -`
grammar. Put the view beside the stack. The stack is the default. It is not the only view.

## Grammar

```
  entrypoint                          unmarked = unchanged, indent = one call deeper
    runCommand
 +    handleCreateResource            ← In → Out
 +      ResourceClient.create()       ✗ ErrorKind → lands: 302 / notice / skip / raise   (ruled | proposed | assumed)
 ~    existingHop                     changed body, same signature
 -    legacyCreateFlow                removed
```

| token | means |
|---|---|
| `+` `-` `~` | added · removed · changed. No marker = unchanged, shown for context |
| `← In → Out` | the hop's argument and return types, when they are not obvious from the name |
| `✗ Kind` | an error arm. **Each `✗` names where it lands**: `→ lands: <the next hop, the status, the screen>`. This also applies in `## As-is`. A raise site without its landing is half a measurement |
| `(ruled \| proposed \| assumed)` | the standing of a landing that a human decided: a decision record · an open ASK · built anyway, recorded `status: assumed` |
| `·` | a note about a hop that does not change: "unchanged, already raises", "one caller only" |
| `✓` | an outcome that the shape makes impossible. Use it in the `## Design` of an assessment, and in candidates that remove a defect class |

**File-tree diff.** Use it when a candidate adds or removes files:

```
+ resource-client.ts NEW · ~ resource-route.ts MODIFIED · - legacy-flow.ts DELETED
```

**Signature block.** Write one for each new or changed function. The bodies may throw:

```python
@staticmethod
async def sweep_orphan_stones(*, limit: int | None = None) -> int: ...   # returns rows removed
```

"No diff" is a valid stack. Example: the operational candidate of BJEW-585 changed zero lines of
application code. It wrote `**Call stack** — no diff.` above the hops of the script.

## Backend variant

Write each hop as `file:line` + the real function name. The types that matter are the types that a
failure travels through. Excerpt: BJEW-586 candidate A (`SPEC.md` rev 2, `## Candidates`):

```
  POST /api/v1/auth/2fa/send
    ~ auth.py:599          bool CAPTURED instead of discarded
    + auth.py:600-601      ✗ send failed + not dev-expose → ValidationError
                              ✗ lands: main.py:296 → 400 {detail} → auth.remote.ts:153 throws
                              ✗ lands: +page.svelte:51 otpSendError → :271 red box
    ~ auth.py:604          success=True now only reachable when sent (or dev-expose)
    · sms arm              UNCHANGED — already raises at auth_service.py:641
```

The excerpt does two things. Each backend stack must do them:
1. Follow an error arm all the way to what the user sees. Do not stop at the exception type.
2. Name a path that does **not** change, when a reader can assume that it did.

A candidate can also record a **measured negative** inside the stack: a thing that does not happen.
Example: BJEW-585 candidate C:

```
  ProductRepository.delete_many(ids)
      await Product.find({"_id": {"$in": ids}}).delete()
      ✗ NO document event fires here — measured: @wrap_with_actions(EventTypes.DELETE) sits on
        beanie/odm/documents.py:873 (Document.delete) and on nothing in odm/queries/*, so the
        bulk path STILL needs its explicit delete_stones_of call
```

## Frontend variant

The chain is `<Page>` → handler → `*.remote.ts` → invalidate.
- Write each hop as `file:line` with the rune or the export name.
- **State is a union. It is not a set of booleans.** Write `step: 'creds' | 'otp'`. Do not write
  `isOtp` + `isSending`.
- Write a child as `<Child prop: T onEvent>`.

Excerpt: BJEW-586 candidate D (`SPEC.md` rev 2). It shows the shape that goes away and the shape
that replaces it:

```svelte
- :23   let handledResult = $state.raw(login_form.result)   # the BJEW-292 guard, deleted
- :33   $effect(() => { … step = 'otp'; void sendCode() })  # whole effect removed
+ :33   const submitLogin = login_form.enhance(async ({ submit }) => {
+           await submit();                                 # sequential — no reactive read
+           pendingToken = result.pending;
+           await sendCode();                               # awaited — the step follows the outcome
+       });
~ :102  <form {...submitLogin} class="…">                    # was <form {...login_form}>
```

```
    - +page.svelte:33-39   the $effect, and with it 3 forbidden $state-in-effect writes
    ✓ cause 2 by construction   there is no longer a statement that CAN set step before the send
    ✗ send fails           → step stays 'creds'; otpSendError renders where ASK-2 says
                             ⚠ THE ERROR BOX AT :271 IS INSIDE THE step==='otp' BRANCH —
                               a creds-step error needs its own render site.
    · no-JS                method/action retained by enhance — no worse than today (NOT MEASURED)
```

That block does the job of the format:
- The `✗` arm found the missing render site *before* it was built.
- The `·` line marks a claim that is not measured. It does not assert it.

**A presentation-only change has no call stack. It is Class A.** It needs no agreement session.

## In the assessment

- The `## Observed` of the agreement is the as-is stack. The build works from it.
- The `## Design` of an assessment uses this format again for what was built, when a call path is
  the right view.
- It names the agreement sha that it judged. It lists what was left out.
- Draw a view only when it resolves the expensive uncertainty of the task. Never draw one for
  completeness.
