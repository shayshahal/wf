# Review — DEMO-1

round: DEMO-1
class: B
base: dev
content-sha: sha256:demo-worktree
head-sha: sha256:demo-head
date: 2026-10-06
admin:  http://localhost:12001
api:    http://127.0.0.1:22001/api/v1

assessment: clean (bug-reports/DEMO-1/ASSESSMENT.md)
manual: case 2 — open /admin/listings, delete a row, the badge above the table drops by one without a reload

files changed (3):
- packages/admin/src/lib/listings.remote.ts
- packages/admin/src/routes/admin/listings/ListingBadge.svelte
- packages/admin/src/routes/admin/listings/listings.test.ts
comments:
(none yet — one `path:line[-end] — text` line per comment)

verdict: pending (set one of: approved | changes-requested | dismissed)
