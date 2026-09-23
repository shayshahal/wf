# Agent notes — type checking

## Type Checking

```bash
# ✅ Correct
pnpm check:fast                                                          # uses flags already
svelte-check --tsconfig ./tsconfig.json --incremental --tsgo             # manual
svelte-check --tsconfig ./tsconfig.json --threshold error --incremental --tsgo  # errors only

# ❌ Wrong — slow, no caching
svelte-check
npx svelte-check
svelte-check --tsconfig ./tsconfig.json
```
