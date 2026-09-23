# Agent notes — design

## Design Context

Design is managed via the `impeccable` skill. Three source-of-truth files at the project root:

- **`PRODUCT.md`** — strategic (register, users, purpose, brand, anti-references, principles, a11y). Register: `product`; primary focus is the admin.
- **`DESIGN.md`** — visual (YAML frontmatter tokens + 6-section spec: Overview, Colors, Typography, Elevation, Components, Do's and Don'ts). North Star: *"The Jeweler's Atelier"*.
- **`DESIGN.json`** — sidecar carrying tonal ramps, shadows, motion, breakpoints, and self-contained HTML/CSS snippets for signature components (primary button, input, order badges, stat card, sidebar row, gold-price ticker, admin table row).

The customer storefront is **locked to Figma node `291:2079`** — extend (error / empty / loading / onboarding), never override. Admin extends the shared token set with dark-mode and stat typography.
