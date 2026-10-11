# AGREEMENT — DEMO-1

Demo round (not a real ticket) · reporter: demo, 2026-10-06 · Round `demo/DEMO-1`, base `dev`.
Bug/CR folder: `bug-reports/DEMO-1`.

Class: B — the delete command changes a `*.remote.ts` contract and the stats payload.

## Observed

- The delete command invalidates one key and the badge reads another:
  `packages/admin/src/lib/listings.remote.ts:31` calls `invalidate('listings')`, while
  `packages/admin/src/routes/admin/listings/ListingBadge.svelte:12` reads `stats.total`.
- The API payload already carries the count the badge needs, counted in the same request:
  `packages/admin/src/lib/listings.remote.ts:18` (`GET /listings` → `stats`).
- The delete can be refused; that path is unchanged and lands at
  `packages/admin/src/routes/admin/listings/+page.svelte:52` (`deleteError`).
- Measured on `dev`: after a delete the badge keeps the old count until a reload.

```
  /admin/listings +page.svelte
    deleteListing                   ← id → void
      listings.remote.ts:31         invalidate('listings')      ⚠ the badge reads 'stats'
      ✗ the API refuses the delete  → lands: +page.svelte:52 deleteError
    ListingBadge.svelte:12          reads stats.total
```

## Agreed

- Deleting a listing updates the count the badge shows without a reload: the delete command
  invalidates the stats key beside the listings key, so the badge re-reads after a delete. Data and
  action behavior are otherwise unchanged.
- Choice: invalidate both keys at the one delete call site, rather than adding client state or a
  second request for the count. Rejected: a badge watcher on `listings.length`, which duplicates the
  server's count in the client.
- Excluded: the filtered-count debate (ASK-1) and the delete-error path; neither changes here.
- Verification promise: the case below proves a delete drops the badge count, and a person confirms
  the badge on `/admin/listings` after a delete.

```diff
 packages/admin/src/lib/listings.remote.ts
-  export const deleteListing = remoteCommand(async (id) => { await api.delete(id); invalidate('listings'); })
+  export const deleteListing = remoteCommand(async (id) => {
+    await api.delete(id);
+    invalidate('listings', 'stats')     one call, both keys
+  })

 packages/admin/src/routes/admin/listings/ListingBadge.svelte
~  :12  reads stats.total → stats.filtered ?? stats.total
```

## Verification

| # | case | files | check |
|---|---|---|---|
| 1 | `fix(admin): invalidate the stats key with the list on delete` | `packages/admin/src/lib/listings.remote.ts` | `pnpm --filter admin vitest run src/lib/listings.remote.test.ts` |
| 2 | `fix(admin): the badge reads the count the payload carries` | `packages/admin/src/routes/admin/listings/ListingBadge.svelte` | manual: open /admin/listings, delete a row, the badge above the table drops by one without a reload |
| 3 | `test(admin): delete, then the count` | `packages/admin/src/routes/admin/listings/listings.test.ts` | repro |

## Progress

- [x] delete command invalidates both keys
- [ ] badge reads the payload's count
