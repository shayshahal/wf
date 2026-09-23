# Agent notes — databases

## Databases (MongoDB Atlas)

Shared cluster — same connection string, different DB name per environment:

| Environment | DB name        |
| ----------- | -------------- |
| QA          | `jewelryx-qa`  |
| Staging     | `jewelryx`     |
| Remote dev  | `jewelryx-dev` |

Local dev uses `mongodb://localhost:27017` / `jewelryx`. The Atlas connection string lives in `packages/backend/.env` (gitignored) — not committed.
