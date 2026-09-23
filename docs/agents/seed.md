# Agent notes — worktree seed data

Every worktree DB is seeded from `packages/backend/scripts/seed_worktree.py`: fixed ids, fixed
numbers, fixed passwords. Cite these in a brief — never create a user, a request or an order by
hand first.

## Logins

| Role                  | Email                  | Password   |
| --------------------- | ---------------------- | ---------- |
| Admin                 | `admin@jewelryx.com`   | `admin123` |
| Seller (supplier)     | `seller@seed.jewelryx` | `seed1234` |
| Buyer (store owner)   | `buyer@seed.jewelryx`  | `seed1234` |

Login is password + OTP for everyone (Q6, not a seed choice). In a worktree `OTP_DEV_EXPOSE=true`
puts the code in the `/api/v1/auth/2fa/send` response as `dev_otp_code`.

The buyer holds **50,000 ILS cash balance**, a **100,000 credit limit** with **25,000 outstanding**
(the platform's only "loan": `balance` + `credit_limit`/`outstanding_credit` on `User`). The seller
owns every product, listing, auction and scrap-gold request below.

## Fixtures

| What                | Ids                                                        |
| ------------------- | ---------------------------------------------------------- |
| Categories          | the 9 fixed slugs (`rings` … `pearls`), from `seed_fixed_categories` |
| Products            | `SEED-RNG-001` `SEED-RNG-002` `SEED-NCK-001` `SEED-NCK-002` `SEED-BRC-001` `SEED-EAR-001` `SEED-PND-001` `SEED-DIA-001` `SEED-GEM-001` `SEED-PRL-001` — one per category, all `active` |
| Stone               | one standalone GIA-certificated pear diamond, 0.80 ct      |
| Marketplace listing | `MKT-0001`, fixed price 14,000, `active`, on `SEED-RNG-001` |
| Auction             | `AUC-0001` on `SEED-RNG-002`, `active`, one bid of 9,000 from the buyer |
| Scrap gold          | `SG-0001` … `SG-0005` — one per `ScrapGoldStatus`: pending · rejected · in_handling · collected_and_approved · cancelled |
| Orders              | `ORD-0001` … `ORD-0009` — one per `OrderStatus`: pending · confirmed · processing · ready_for_pickup · shipped · delivered · completed · cancelled · refunded |

Names are Latin on purpose (the verification suite's rule): Sonia Seller / Seed Gold Supply,
Bruno Buyer / Seed Jewelry Store.

## How it gets there

`wt switch --create` runs `scripts/worktree-db.mjs seed <slug>`, which restores a cached
`mongodump`:

```
~/.cache/jewelryx-seed/<sha256 of seed_worktree.py + packages/backend/app/models/*.py>.archive
```

Cache hit → `mongorestore` only (~5 s). Miss → run the seeder into the scratch DB `jewelryx_seed`
inside the worktree's own mongo container, `mongodump` it to the cache, then restore (~11 s). The key
covers the seeder and every model, so editing either re-seeds on the next worktree; a stale archive
cannot exist. `mongodump`/`mongorestore` are not on the host PATH — both run via `docker exec` in
`jewelryx-mongo-<slug>`.

```bash
pnpm wf seed            # restore over the current worktree's DB
pnpm wf seed --reset    # drop the DB first — after a repro dirtied the data
uv run --directory packages/backend python -m scripts.seed_worktree --check   # seed twice, assert nothing moved
```

`packages/backend/scripts/seed_database.py` is the older random demo seeder and is not used by any
worktree.
