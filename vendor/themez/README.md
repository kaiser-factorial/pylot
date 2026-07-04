# Vendored design-system sources (provenance only — never imported)

Nothing in this directory is compiled into Pylot. These are reference copies of the
material the Pylot theme layer and pane components were ported from, kept in-repo so the
provenance of `app/globals.css` tokens and the `components/ui/` forks stays auditable.

| Source | What | Where it went in Pylot |
|---|---|---|
| **Themez cyber_theme** (owner's design system, `~/Projects/Themes/cyber_theme`) | `CYBER_THEME_GUIDE.md` — palette, CRT effects, typography | `[data-theme="cyber"]` token block in `app/globals.css` |
| **Themez primary_theme** (owner's design system, `~/Projects/Themes/primary_theme`) | `PRIMARY_THEME_GUIDE.md` — Bauhaus palette, border/shadow rules | `[data-theme="primary"]` token block in `app/globals.css` |
| **ccru** by [@lumpenspace](https://github.com/lumpenspace), commit `7c38ad9104` | `ccru/*.tsx` — verbatim component sources (via the Themez vendor archive) | Fork-and-tokenize adaptations in `components/ui/Panel.tsx`, `components/ui/CodeBlock.tsx` |

## ccru license status

ccru has **no published license** as of the vendored commit (all rights reserved by
default); used here with the author's informal blessing. **Before Pylot is ever
distributed**, obtain a real license (MIT upstream, or written permission) and record it
in `ccru/UPSTREAM.md`. Owner plans to raise it with the author in person (July 2026);
tracked in ROADMAP open decisions.

## Fork rules (ROADMAP Phase 1)

- Never edit files under this directory — they are verbatim archives.
- Forks keep upstream structure/behavior but express **all** colors/effects through the
  theme tokens in `globals.css`, so the same component renders neon-on-dark under cyber
  and 3px-black-border Bauhaus under primary.
- Each fork carries an "adapted from ccru `7c38ad9104`" header comment.
