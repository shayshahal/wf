# DEMO-1 — plan
Class: B     <paths measure B: the delete command changes a `*.remote.ts` contract and the stats payload.
              Values: every value has a source — the badge reads the count the payload already carries>
Cause: `listings.remote.ts:31` invalidates `listings`, and the badge reads `stats` (RESEARCH.md "Diverges at")
Approach: invalidate both keys in the delete command and let the badge read the count the payload already
carries — one call site, no new client state, and the guarantee stays where the count is produced.

## Build
<what changes, as views: the call stack against RESEARCH.md As-is, and the shapes a stack cannot carry>

```
  /admin/listings +page.svelte
    deleteListing                    ← id → void
      ~ listings.remote.ts:31        invalidate('listings', 'stats')   one call, both keys
      ✗ the API refuses the delete   → lands: +page.svelte:52 deleteError (unchanged)
    + ListingBadge.svelte:12         reads stats.filtered ?? stats.total
    ✓ no screen reads a stale total   there is no path that reads `stats` without the delete invalidating it
```

```diff
 type ListingStats
   total: number
+  filtered: number        ~ the badge reads this when a filter chip is on
```

```diff
 GET /listings
 response
   stats
     total: number
+    filtered: number      ~ counted in the same request, no extra round trip
```

## Commits
| # | message | files | check |
| 1 | `fix(admin): invalidate the stats key with the list on delete` | packages/admin/src/lib/listings.remote.ts | `pnpm --filter admin vitest run src/lib/listings.remote.test.ts` |
| 2 | `fix(admin): the badge reads the count the payload carries` | packages/admin/src/routes/admin/listings/ListingBadge.svelte | manual: open /admin/listings, delete a row, the badge above the table drops by one without a reload |
| 3 | `test(admin): delete, then the count` | packages/admin/src/routes/admin/listings/listings.test.ts | repro |

## Not doing
- the bulk delete path (`deleteMany`, `listings.remote.ts:64`) — it does not invalidate anything today; RESEARCH.md names it and the ticket does not
- the filter chip's own count — it reads `listings.length` and is right
- a `COUNT` round trip for `filtered` — it rides the payload the list already returns

## T2 walk
open: /admin/listings on this worktree's admin app
setup: `wf seed` when the table is empty, so there is a row to delete
Delete the first row: the badge above the table drops by one, and no reload is needed.

## Asks
none
