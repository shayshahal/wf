---
id: TJEW-101#2026-09-02-a
feature: notifications
kind: ADR
who: agent
date: 2026-09-02
status: assumed
ratified_by: Shay
provenance:
  round: fix/tjew101
hash: sha256:968253b1cb58e09b4e1130ffbf230ca7515c8c7405ce21e94cc99fcb77b989e2
enforced: []
scope:
  - packages/backend/app/services/notification_service.py
supersedes: null
alternatives:
  - unbounded retries
---
## Context
The worker needed a retry policy for the notification queue; no ruling existed.

## Assumption built on
Three attempts, exponential backoff, drop after the third.

## Ratify
Shay confirms or supersedes.
