# Vendored: CCRU component library

**These files are NOT part of the Themez design systems and were NOT written by the
Themez author.** They are verbatim copies from an upstream project, archived here for
stability and reuse.

| | |
|---|---|
| **Author** | [@lumpenspace](https://github.com/lumpenspace) |
| **Upstream repo** | https://github.com/lumpenspace/ccru |
| **Showcase** | https://qliphoth.systems/components |
| **Commit vendored** | `7c38ad910410c3f5744b961eb97adf58ff00d41f` |
| **Date vendored** | 2026-07-03 |
| **License** | ⚠️ **None published as of the vendored commit** (no LICENSE file, no `license` field in package.json) — i.e. all rights reserved by default. Used here with the author's informal blessing (friend of the Themez author). **Before any redistribution of these files or products embedding them, obtain a real license** (ask upstream to add MIT, or get written permission) and record it here. |

## What is vendored

The full `component-library` export surface and its source tree, laid out exactly as in
the upstream repo so all relative imports remain valid:

- `component-library/index.ts` — the barrel (entry point of the `ccru` npm package)
- `app/components/ui/` — all UI components (CyberButton, CyberCodeBlock, CyberContainer,
  CyberPanel, CyberPanelHeader, CyberGridGroup, CyberStackGroup, GlitchText, NeonDivider,
  SectionFrame, StatusDot, …)
- `app/components/cyphers/`, `app/cyphers/` — CypherHoverText + CCRU cipher data/gematria
- `app/lib/` — small helpers imported by the above

External deps required by some components: `prism-react-renderer` (CyberCodeBlock),
`next/link` (HomeLink). React + Tailwind assumed.

## Rules for this directory

1. **Never edit these files.** Fixes and adaptations (e.g. tokenized theming forks) live
   in the consuming project, marked as "adapted from ccru <commit>".
2. To update, re-vendor from a newer upstream commit and change the commit hash above.
3. Anything in `cyber_theme/components/` (sibling directory) is Themez-original work by
   Corina Kaiser; the boundary between the two is this `vendor/` directory. Some
   Themez-original components were *designed to visually harmonize* with CCRU (see
   `../../CCRU_CREDITS.md`) but share no code with it.
