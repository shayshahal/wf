# Call-stack format

How a call stack is written in `SPEC.md` (`## As-is`, and one per candidate) and in the
worker's `proof/CALL-STACK-AS-BUILT.md`. **A stack is written in diff syntax, because the
interesting part is what changes** — an unchanged hop is context, not content.

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
| `✗ Kind` | an error arm. **Every `✗` names where it lands** — `→ lands: <the next hop, the status, the screen>`. In `## As-is` too: a raise site listed without its landing is half a measurement |
| `(ruled \| proposed \| assumed)` | the standing of a landing that a human decided: a decision record · an open ASK · built anyway, recorded `status: assumed` |
| `·` | a note about a hop that does not change — "unchanged, already raises", "one caller only" |
| `✓` | an outcome the shape makes impossible; used in as-built and in candidates that remove a defect class |

**File-tree diff**, when a candidate adds or removes files:

```
+ resource-client.ts NEW · ~ resource-route.ts MODIFIED · - legacy-flow.ts DELETED
```

**Signature block** — one per new or changed function, bodies may throw:

```python
@staticmethod
async def sweep_orphan_stones(*, limit: int | None = None) -> int: ...   # returns rows removed
```

"No diff" is a valid stack: BJEW-585's operational candidate changed zero lines of application
code and wrote `**Call stack** — no diff.` above the script's own hops.

## Backend variant

Hops are `file:line` + the real function name; the types that matter are the ones a failure
travels through. Excerpt, BJEW-586 candidate A (`SPEC.md` rev 2, `## Candidates`):

```
  POST /api/v1/auth/2fa/send
    ~ auth.py:599          bool CAPTURED instead of discarded
    + auth.py:600-601      ✗ send failed + not dev-expose → ValidationError
                              ✗ lands: main.py:296 → 400 {detail} → auth.remote.ts:153 throws
                              ✗ lands: +page.svelte:51 otpSendError → :271 red box
    ~ auth.py:604          success=True now only reachable when sent (or dev-expose)
    · sms arm              UNCHANGED — already raises at auth_service.py:641
```

Two things that excerpt does and every backend stack must: an error arm is followed all the way
to what the user sees, not to the exception type; and a path that does **not** change is named
when a reader would otherwise assume it did.

A candidate may also record a **measured negative** inside the stack — the thing that does not
happen. BJEW-585 candidate C:

```
  ProductRepository.delete_many(ids)
      await Product.find({"_id": {"$in": ids}}).delete()
      ✗ NO document event fires here — measured: @wrap_with_actions(EventTypes.DELETE) sits on
        beanie/odm/documents.py:873 (Document.delete) and on nothing in odm/queries/*, so the
        bulk path STILL needs its explicit delete_stones_of call
```

## Frontend variant

The chain is `<Page>` → handler → `*.remote.ts` → invalidate. Hops are `file:line` with the
rune or the export name; **state is a union, not a set of booleans** (`step: 'creds' | 'otp'`,
not `isOtp` + `isSending`), and a child is written `<Child prop: T onEvent>`. Excerpt,
BJEW-586 candidate D (`SPEC.md` rev 2), the shape being replaced and the shape replacing it:

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

That block is doing the job of the format: the `✗` arm found the missing render site *before*
it was built, and the `·` line marks an unmeasured claim instead of asserting it.

**A presentation-only change has no call stack, and is Class A** — no design session.

## As-built

`proof/CALL-STACK-AS-BUILT.md` is this format again, one table per candidate arm: the SPEC
line, what was built, and `✓` or the deviation. It names the SPEC sha it was built against,
lists every **addition** with the line in the SPEC that did not model it, and lists what was
deliberately **not** built. `wf review` refuses a B/C round without it.
