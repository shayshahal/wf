---
id: TJEW-100#2026-09-01-a
feature: cart
kind: ADR
who: Shay
date: 2026-09-01
status: accepted
provenance:
  pr: 42
hash: sha256:2d56124d7d65665dceb75f80783b294b0873fdf641444ebd11bea8f20159be9b
enforced:
  - cart-share.spec.ts#CART-071
scope:
  - packages/backend/app/services/cart_service.py
supersedes: null
alternatives:
  - delete the product row silently
  - fail the whole checkout
---
## Context

A product removed from the catalog can still sit in a saved cart.

## Decision

Skip the missing product and keep the rest of the cart.

## Consequences

Checkout never blocks on stale rows; the buyer sees a notice instead.
