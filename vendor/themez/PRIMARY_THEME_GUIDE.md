# Primary Theme Guide — Complete Design Reference

The Bauhaus/primary color aesthetic used in CatchFall and the joint-session project.

---

## Color Palette

### Primary Colors
| Name | Hex | RGB | CSS Variable | Usage |
|------|-----|-----|-------------|-------|
| **Red** | `#EB1A26` | 235, 26, 38 | `--p-red` | Secondary accent, errors, fire objects |
| **Blue** | `#0045AD` | 0, 69, 173 | `--p-blue` | Primary actions, links, info alerts |
| **Yellow** | `#FFD600` | 255, 214, 0 | `--p-yellow` | Accent, success, catch objects |
| **Black** | `#111111` | 17, 17, 17 | `--p-black` | Text, borders, structural elements |
| **White** | `#FAFAFA` | 250, 250, 250 | `--p-white` / `--p-bg` | Background, surface |

### Derived Colors
| Name | Hex | Usage |
|------|-----|-------|
| Dark Yellow | `#b89600` | Warning text (readable on white) |
| Dark Green | `#1a7a1a` | Success text |

---

## CSS Variables

```css
:root {
  --p-red: #EB1A26;
  --p-blue: #0045AD;
  --p-yellow: #FFD600;
  --p-black: #111111;
  --p-white: #FAFAFA;
  --p-bg: #FAFAFA;
  --p-surface: #FFFFFF;
  --p-border: #111111;
  --p-font: 'Courier Prime', 'Courier New', monospace;
  --p-shadow: 6px 6px 0px #111111;
  --p-shadow-sm: 4px 4px 0px #111111;
  --p-border-w: 3px;
}
```

---

## Typography

**Font Family:** Courier Prime (monospace)
**Fallback:** Courier New, monospace

| Element | Size | Weight | Transform | Letter-spacing |
|---------|------|--------|-----------|----------------|
| h1 | 2rem | bold | uppercase | -0.02em |
| h2 | 1.3rem | bold | uppercase | 0.05em |
| h3 | 0.95rem | bold | uppercase | 0.1em |
| body | 0.9rem | normal | none | normal |
| code | 0.85rem | normal | none | normal |
| label | 0.65–0.75rem | bold | uppercase | 0.1em |

---

## Spacing Scale

| Name | Value | Usage |
|------|-------|-------|
| xs | 0.25rem (4px) | Dot spacing, tight gaps |
| sm | 0.5rem (8px) | Icon gaps, compact padding |
| md | 1rem (16px) | Standard padding |
| lg | 1.5rem (24px) | Section padding |
| xl | 2rem (32px) | Page margins |
| 2xl | 2.5rem (40px) | Section separators |

---

## Border & Shadow Rules

- **Border radius:** Always 0 (sharp corners)
- **Border width:** 3px for containers, 2px for inputs, 1px for subtle dividers
- **Shadow:** Hard offset only — `6px 6px 0px #111111` (no blur, no spread)
- **Shadow (small):** `4px 4px 0px #111111`
- **Button active:** Shadow disappears, element translates 4px down-right

---

## Geometric Background Patterns

Inspired by the 6 CatchFall level themes in SKETCH.js:

### Mod Stripes (Level 1)
```css
.bg-mod-stripes {
  background-image:
    repeating-linear-gradient(0deg, transparent, transparent 20px, rgba(235,26,38,0.06) 20px, rgba(235,26,38,0.06) 21px),
    repeating-linear-gradient(90deg, transparent, transparent 20px, rgba(0,69,173,0.06) 20px, rgba(0,69,173,0.06) 21px);
}
```

### Primary Grid (Level 6)
```css
.bg-primary-grid {
  background-image:
    linear-gradient(rgba(0,69,173,0.08) 1px, transparent 1px),
    linear-gradient(90deg, rgba(0,69,173,0.08) 1px, transparent 1px);
  background-size: 60px 60px;
}
```

### Halftone (Level 4)
```css
.bg-halftone {
  background-image: radial-gradient(circle, rgba(235,26,38,0.12) 2px, transparent 2px);
  background-size: 24px 24px;
}
```

### Wave Marks (Level 5)
```css
.bg-wave {
  background-image:
    repeating-linear-gradient(90deg, transparent, transparent 10px, rgba(255,214,0,0.08) 10px, rgba(255,214,0,0.08) 11px),
    repeating-linear-gradient(0deg, transparent, transparent 30px, rgba(0,69,173,0.05) 30px, rgba(0,69,173,0.05) 31px);
}
```

---

## Animations

### Button Press
```css
.btn:active {
  transform: translate(4px, 4px);
  box-shadow: 0px 0px 0px var(--p-black);
}
```

### Spinner Ring
```css
@keyframes spin {
  to { transform: rotate(360deg); }
}
```

### Spinner Dots Bounce
```css
@keyframes bounce {
  0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
  30% { transform: translateY(-8px); opacity: 1; }
}
```

### Pulse (for dots and indicators)
```css
@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.4; }
}
```

---

## Component Specifications

### Buttons
- **Default:** Blue background, white text, 3px black border, 4px shadow
- **Red:** Red background, white text
- **Yellow:** Yellow background, black text
- **Black:** Black background, white text
- **Outline:** Transparent background, colored text and border
- **Active state:** Translate 4px, shadow disappears

### Alerts
- **Border:** 3px solid (color varies by severity)
- **Background:** White
- **Shadow:** 4px hard shadow
- **Severities:** info (blue), success (green), warning (dark yellow), error (red), system (black)

### Badges
- **Outline variant:** Transparent bg, colored border and text
- **Solid variant:** Colored bg, white/black text
- **Border:** 2px solid

### Spinners
- **Ring:** Dual rotating rings (opposite directions)
- **Dots:** 3 bouncing dots with staggered delays
- **Sizes:** sm (24px), md (40px), lg (64px)

### Progress Bars
- **Track:** #e0e0e0 background, 2px black border
- **Fill:** Solid color, no gradient
- **Striped:** Optional diagonal stripe pattern
- **Sizes:** sm (6px), md (10px), lg (18px)

---

## Responsive Breakpoints

| Breakpoint | Value | Behavior |
|------------|-------|----------|
| Mobile | < 768px | Single column grids, reduced padding |
| Desktop | >= 768px | Multi-column grids |

---

## Accessibility

- **Contrast:** All text meets WCAG AA on white background
- **Focus:** 2px solid black outline on interactive elements
- **ARIA:** Proper roles on alerts, breadcrumbs, navigation
- **Keyboard:** All interactive elements are focusable

---

## File Manifest

```
primary_theme/
├── README.md                    ← Quick start
├── THEME_GUIDE.md               ← This file
├── COMPONENT_STRATEGY.md        ← Decision tree
├── components/
│   ├── primary-theme.css        ← All styles
│   ├── primary-theme.js         ← Interactions
│   ├── SHOWCASE.html            ← Live demo
│   ├── Alert.html               ← Component docs
│   ├── Badge.html
│   ├── Breadcrumb.html
│   ├── Button.html
│   ├── Spinner.html
│   ├── ProgressIndicator.html
│   ├── StatsDisplay.html
│   ├── TechnicalSchematic.html
│   ├── Timeline.html
│   ├── DialogueMessage.html
│   ├── MissionStatement.html
│   ├── MemoryCard.html
│   ├── BotNameCard.html
│   ├── BotParameterPanel.html
│   ├── AuditLogCard.html
│   ├── LoadingProgress.html
│   ├── INDEX.md
│   └── EXAMPLE_USAGE.html
```
