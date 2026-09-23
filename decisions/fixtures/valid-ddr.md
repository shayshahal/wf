---
id: TJEW-200#2026-09-02-a
feature: marketplace
kind: DDR
who: Einat
date: 2026-09-02
status: accepted
provenance:
  figma:
    file: abc123
    node: 291:2079
hash: sha256:f441b66ede8849a7e1fcacffaefaa7c351ec03fcdf8889ba44cbe183f54da0d8
enforced:
  - marketplace-pixel.spec.ts#MKT-101
scope:
  - packages/frontend/b2b/src/routes/marketplace
supersedes: null
authority: figma@abc123#291:2079
deviates_from: card radius 8px instead of 12px — denser grid tested better with buyers
---
## Deviation

Listing cards use an 8px radius against the 12px system token, to fit the
denser marketplace grid.
