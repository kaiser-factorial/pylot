# Brain.vat Cyber Theme Guide

A comprehensive guide to the dark cyberpunk/terminal aesthetic used in brain.vat. This guide helps you apply the theme to new projects while leveraging reusable components from the `ccru` package and shadcn/ui.

---

## Quick Start

To apply this theme to a new Next.js project:

1. **Install dependencies:**
   ```bash
   npm install ccru@github:lumpenspace/ccru
   npm install -D tailwindcss postcss autoprefixer
   npm install next-themes
   ```

2. **Copy theme variables** from `globals.css` (see CSS Variables section below)

3. **Use ccru components** for common UI elements (see Component Strategy section)

4. **Follow the color palette** for consistent messaging/speaker identification

---

## 🙏 About CCRU Components

This theme is built on top of the excellent **[CCRU](https://github.com/lumpenspace/ccru)** component library created by [@lumpenspace](https://github.com/lumpenspace).

CCRU provides production-ready, cyberpunk-themed React components that are the backbone of this design system:
- **CyberButton** — Themed buttons with neon effects
- **CyberCheckbox** — Themed toggles
- **CyberContainer** — Themed containers
- **CyberButtonGroup** — Button groups
- **CyberGridGroup** / **CyberStackGroup** — Layout helpers
- **NeonDivider** — Glowing dividers
- **GlitchText** — Text with glitch effects
- **StatusDot** — Status indicators

Rather than reinventing these components, this theme leverages CCRU's excellent work and builds custom components (BotParameterPanel, AuditLogCard) for specialized use cases.

**Install CCRU in your project:**
```bash
npm install ccru@github:lumpenspace/ccru
```

**Learn more:** 
- GitHub: https://github.com/lumpenspace/ccru
- Components showcase: https://qliphoth.systems/components

---

## Color Palette

### Core Brand Colors
| Name | Value | Usage | CSS Variable |
|------|-------|-------|--------------|
| **MAUK** | `#03A6A1` | Left sidebar / AI bot A | `--mauk` |
| **ABACI** | `#FF9D23` | Right sidebar / AI bot B | `--abaci` |
| **User/Primary** | `#E63946` | User messages & accents | `--user-color` |
| **System Green** | `#10ff50` | System indicators, status | `--system-green` |
| **Terminal Green** | `oklch(0.6 0.15 145)` | Alternative system color | `--terminal-green` |

### Dark Terminal Base
| Element | Value (oklch) | Usage | CSS Variable |
|---------|---------------|-------|--------------|
| Background | `oklch(0.08 0 0)` | Main background | `--background` |
| Foreground | `oklch(0.75 0.01 80)` | Text color | `--foreground` |
| Card | `oklch(0.1 0 0)` | Card backgrounds | `--card` |
| Input | `oklch(0.12 0 0)` | Input field bg | `--input` |
| Border | `oklch(0.2 0 0)` | Borders | `--border` |
| Primary | `#E63946` | Primary accent | `--primary` |
| Accent | `#E63946` | Accent elements | `--accent` |
| Glow | `oklch(0.55 0.2 25 / 0.3)` | Glow effects | `--glow` |

### Typography (Monospace)
```css
--font-sans: 'JetBrains Mono', 'Geist Mono', 'Courier New', monospace;
--font-mono: 'JetBrains Mono', 'Geist Mono', 'Courier New', monospace;
```

**Why monospace?** Creates a "hacker terminal" aesthetic. All text should use the monospace stack.

---

## CSS Variables Setup

Copy these to your project's CSS file (typically `app/globals.css` or `styles/globals.css`):

```css
:root {
  /* Dark terminal aesthetic - deep black with blood red accents */
  --background: oklch(0.08 0 0);
  --foreground: oklch(0.75 0.01 80);
  --card: oklch(0.1 0 0);
  --card-foreground: oklch(0.75 0.01 80);
  --popover: oklch(0.1 0 0);
  --popover-foreground: oklch(0.75 0.01 80);
  --primary: #E63946;
  --primary-foreground: oklch(0.95 0 0);
  --secondary: oklch(0.15 0 0);
  --secondary-foreground: oklch(0.65 0 0);
  --muted: oklch(0.15 0 0);
  --muted-foreground: oklch(0.5 0 0);
  --accent: #E63946;
  --accent-foreground: oklch(0.95 0 0);
  --destructive: oklch(0.5 0.25 25);
  --destructive-foreground: oklch(0.95 0 0);
  --border: oklch(0.2 0 0);
  --input: oklch(0.12 0 0);
  --ring: #E63946;
  --radius: 0.25rem;

  /* Custom tokens for brain.vat theme */
  --mauk: #03A6A1;        /* Cool cyan */
  --abaci: #FF9D23;       /* Warm orange */
  --user-color: #E63946;  /* Blood red */
  --glow: oklch(0.55 0.2 25 / 0.3);
  --terminal-green: oklch(0.6 0.15 145);
  --system-green: #10ff50;
  --header-bg: oklch(0.08 0 0 / 0.8);
  --nav-hover: oklch(0.55 0.2 25 / 0.15);
}

.dark {
  --background: oklch(0.08 0 0);
  --foreground: oklch(0.75 0.01 80);
  --card: oklch(0.1 0 0);
  --card-foreground: oklch(0.75 0.01 80);
  --popover: oklch(0.1 0 0);
  --popover-foreground: oklch(0.75 0.01 80);
  --primary: #E63946;
  --primary-foreground: oklch(0.95 0 0);
  --secondary: oklch(0.15 0 0);
  --secondary-foreground: oklch(0.65 0 0);
  --muted: oklch(0.15 0 0);
  --muted-foreground: oklch(0.5 0 0);
  --accent: oklch(0.55 0.2 25);
  --accent-foreground: oklch(0.95 0 0);
  --destructive: oklch(0.5 0.25 25);
  --destructive-foreground: oklch(0.95 0 0);
  --border: oklch(0.2 0 0);
  --input: oklch(0.12 0 0);
  --ring: oklch(0.55 0.2 25);
}
```

---

## Animations & Effects

### Glow Effects
Use these for speaker-specific message styling:

```css
/* Apply to MAUK bot messages */
.mauk-glow {
  text-shadow: 0 0 0px var(--mauk), 0 0 12px var(--mauk);
}

/* Apply to ABACI bot messages */
.abaci-glow {
  text-shadow: 0 0 0px var(--abaci), 0 0 12px var(--abaci);
}

/* Apply to user messages */
.user-glow {
  text-shadow: 0 0 0px var(--user-color), 0 0 10px var(--user-color);
}
```

**Use case:** Add these classes to message text elements to create neon glow effects identifying the speaker.

### CRT Effects

```css
/* Scanline overlay - static horizontal lines */
.scanlines::before {
  content: '';
  position: absolute;
  inset: 0;
  background: repeating-linear-gradient(0deg,
      transparent, transparent 2px,
      rgba(0, 0, 0, 0.15) 2px, rgba(0, 0, 0, 0.15) 4px);
  pointer-events: none;
  z-index: 50;
}

/* CRT monitor flicker effect - subtle opacity variation */
@keyframes flicker {
  0%, 100% { opacity: 1; }
  92% { opacity: 1; }
  93% { opacity: 0.8; }
  94% { opacity: 1; }
  97% { opacity: 0.9; }
  98% { opacity: 1; }
}

.crt-flicker {
  animation: flicker 5s infinite;
}

/* Moving scanlines - downward animation */
@keyframes move-scanlines {
  from { transform: translateY(0); }
  to { transform: translateY(100%); }
}

.moving-scanlines::before {
  content: '';
  position: absolute;
  inset: -100% 0;
  background: repeating-linear-gradient(0deg,
      transparent, transparent 2px,
      rgba(0, 0, 0, 0.05) 2px, rgba(0, 0, 0, 0.05) 4px);
  pointer-events: none;
  z-index: 50;
  animation: move-scanlines 20s linear infinite;
}
```

**Use case:** Apply `.moving-scanlines` to a full-screen overlay element for the classic CRT monitor effect.

### Message & Text Animations

```css
/* Fade in and slide up when message appears */
@keyframes fadeInUp {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}

.message-enter {
  animation: fadeInUp 0.3s ease-out;
}

/* Glitch effect - random pixel displacement */
@keyframes glitch {
  0% { transform: translate(0); }
  20% { transform: translate(-2px, 2px); }
  40% { transform: translate(-2px, -2px); }
  60% { transform: translate(2px, 2px); }
  80% { transform: translate(2px, -2px); }
  100% { transform: translate(0); }
}

/* Progressive text reveal with steps */
@keyframes scan-in {
  from { width: 0; }
  to { width: 100%; }
}

.scan-in {
  overflow: hidden;
  white-space: nowrap;
  animation: scan-in 0.5s steps(30, end);
}

/* Typing cursor blink */
@keyframes blink {
  0%, 50% { opacity: 1; }
  51%, 100% { opacity: 0; }
}

.cursor-blink {
  animation: blink 1s infinite;
}
```

### Neon Effects

```css
/* Pulsing glow for branding/logo */
@keyframes branding-pulse {
  0%, 100% { filter: drop-shadow(0 0 2px var(--primary)); opacity: 0.8; }
  50% { filter: drop-shadow(0 0 8px var(--primary)); opacity: 1; }
}

.branding-pulse {
  animation: branding-pulse 4s infinite ease-in-out;
}

/* Neon line/divider pulse */
@keyframes neon-pulse {
  0%, 100% { opacity: 0.4; filter: brightness(1); }
  50% { opacity: 1; filter: brightness(1.5); }
}

.neon-pulse {
  animation: neon-pulse 3s infinite ease-in-out;
}

.vertical-neon-line {
  position: absolute;
  top: 0;
  bottom: 0;
  width: 1px;
  animation: neon-pulse 3s infinite ease-in-out;
  background: linear-gradient(180deg, transparent 0%, var(--line-color, #10ff50) 20%, var(--line-color, #10ff50) 80%, transparent 100%);
  opacity: 0.5;
}
```

**Use case:** Apply `.vertical-neon-line` with a `--line-color` CSS variable to create pulsing glowing dividers between sections.

### Texture Effects

```css
/* Subtle noise texture overlay */
.noise-overlay::before {
  content: "";
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  background: url("data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='noise'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='4' stitchTiles='stitch'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23noise)'/%3E%3C/svg%3E");
  filter: contrast(170%) brightness(100%);
  opacity: 0.05;
  pointer-events: none;
  z-index: 1;
}
```

**Use case:** Apply `.noise-overlay` to add subtle texture to cards or sections.

### Custom Scrollbar

```css
::-webkit-scrollbar {
  width: 6px;
  height: 6px;
}

::-webkit-scrollbar-track {
  background: var(--background);
}

::-webkit-scrollbar-thumb {
  background: var(--border);
  border-radius: 3px;
}

::-webkit-scrollbar-thumb:hover {
  background: var(--muted-foreground);
}
```

---

## Component Strategy

### CCRU Components (Use These First!)

The `ccru` package from your friend provides these themed components. **Always prefer these over creating your own similar components:**

| Component | From ccru | When to Use | Example |
|-----------|-----------|------------|---------|
| **CyberButton** | ✓ | Primary action buttons with cyberpunk styling | Navigation, submissions, CTAs |
| **CyberButtonGroup** | ✓ | Group related buttons (e.g., nav tabs) | Header navigation, option selectors |
| **CyberCheckbox** | ✓ | Checkbox with themed appearance | Toggle options, voice mode, filters |
| **CyberContainer** | ✓ | Layout container with theme styling | Card wrappers, modal content |
| **CyberGridGroup** | ✓ | Grid layout (multiple columns) | Dashboard grids, option displays |
| **CyberStackGroup** | ✓ | Vertical/horizontal stacking | Form layouts, lists |
| **NeonDivider** | ✓ | Glowing separator line | Section dividers, visual breaks |
| **GlitchText** | ✓ | Text with glitch animation | Headers, accents, error states |
| **StatusDot** | ✓ | Status indicator (colored circle) | Connection status, mode indicators |

**Import example:**
```typescript
import { CyberButton, NeonDivider } from 'ccru';

export function MyComponent() {
  return (
    <>
      <CyberButton onClick={handleClick}>Click me</CyberButton>
      <NeonDivider />
    </>
  );
}
```

### Shadcn/ui Components (Secondary Layer)

Use shadcn/ui for base primitives when ccru doesn't have a component. The theme colors will automatically apply via CSS variables:

```bash
# Install shadcn/ui with this project's theme
npx shadcn-ui@latest init --defaults
```

Common shadcn/ui components in brain.vat:
- `Button` (use CyberButton from ccru instead when possible)
- `Input` (text input, auto-themed)
- `Dialog` / `Sheet` (modals)
- `Select` / `Dropdown` (dropdowns)
- `Tabs` (tabbed interfaces)
- `Alert` / `AlertDialog` (notifications)
- `Card` (content containers)
- `Badge` (labels/tags)
- `Tooltip` (hover help)

### Custom Components (Domain-Specific)

Brain.vat has domain-specific components you created. **These are NOT reusable across projects** but document how they use the theme:

| Component | Purpose | Theme Usage |
|-----------|---------|-------------|
| **BrainVat** | Main 3-column layout orchestrator | Uses `--mauk`, `--abaci`, `--user-color` for sidebar/center layout |
| **MessageFeed** | Scrollable conversation history | Uses `moving-scanlines`, `message-enter` animation |
| **MessageBubble** | Individual message with speaker ID | Applies glow (`.mauk-glow`, `.abaci-glow`, `.user-glow`) based on speaker |
| **Header** | Top navigation & status bar | Uses CyberButton, CyberButtonGroup from ccru |
| **SidebarPanel** | Memory concepts display | Uses GlitchText from ccru for animations |
| **MessageInput** | User text input | Uses shadcn/ui Input, styled with theme variables |

**Lesson:** When building similar features in new projects, reuse the animation/color patterns but adapt the component structure to your domain.

---

## Layout Pattern: Three-Column Conversation

The brain.vat layout is a distinctive three-column design. To recreate similar layouts:

```tsx
export function ConversationLayout() {
  return (
    <div className="flex h-screen w-screen">
      {/* Left Sidebar - Bot A */}
      <aside className="w-64 border-r border-border bg-card">
        {/* MAUK content with mauk-glow text */}
      </aside>

      {/* Center - Main content */}
      <main className="flex-1 flex flex-col">
        {/* MessageFeed with moving-scanlines overlay */}
        {/* MessageInput at bottom */}
      </main>

      {/* Right Sidebar - Bot B */}
      <aside className="w-64 border-l border-border bg-card">
        {/* ABACI content with abaci-glow text */}
      </aside>
    </div>
  );
}
```

**Styling notes:**
- Use `border-border` for dividers
- Use `bg-card` for sidebar backgrounds
- Apply `.vertical-neon-line` with `--line-color: var(--mauk)` or `var(--abaci)` to sidebar dividers
- Use `text-mauk` / `text-abaci` for speaker colors

---

## Tailwind Configuration

Ensure your `tailwind.config.ts` includes these theme extensions:

```typescript
import type { Config } from 'tailwindcss'

export default {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        background: 'var(--background)',
        foreground: 'var(--foreground)',
        primary: 'var(--primary)',
        secondary: 'var(--secondary)',
        accent: 'var(--accent)',
        card: 'var(--card)',
        border: 'var(--border)',
        input: 'var(--input)',
        mauk: 'var(--mauk)',
        abaci: 'var(--abaci)',
        'user-color': 'var(--user-color)',
        'system-green': 'var(--system-green)',
      },
      fontFamily: {
        sans: ['JetBrains Mono', 'Geist Mono', 'Courier New', 'monospace'],
        mono: ['JetBrains Mono', 'Geist Mono', 'Courier New', 'monospace'],
      },
    },
  },
} satisfies Config
```

---

## Package.json Dependencies

Minimal set for applying this theme:

```json
{
  "dependencies": {
    "ccru": "github:lumpenspace/ccru",
    "next": "^16.2.0",
    "react": "^19.0.0",
    "next-themes": "^0.3.0",
    "lucide-react": "^0.344.0"
  },
  "devDependencies": {
    "tailwindcss": "^4.2.0",
    "postcss": "^8.4.0",
    "autoprefixer": "^10.4.0",
    "typescript": "^5.7.0"
  }
}
```

---

## Quick Implementation Checklist

- [ ] Copy CSS variables to `globals.css`
- [ ] Copy animation keyframes to `globals.css`
- [ ] Install `ccru` and `next-themes`
- [ ] Set up shadcn/ui with `npx shadcn-ui@latest init`
- [ ] Update `tailwind.config.ts` with theme extensions
- [ ] Apply font stack (monospace) to `<body>`
- [ ] Use `CyberButton`, `NeonDivider`, `CyberCheckbox` from ccru for UI elements
- [ ] Use color classes (`.mauk-glow`, `.abaci-glow`, `.user-glow`) for speaker identification
- [ ] Apply `.moving-scanlines` overlay to full-screen containers
- [ ] Test in dark mode with `next-themes`

---

## Color Reference Examples

**Speaker-identified message display:**
```tsx
<div className={speaker === 'MAUK' ? 'mauk-glow' : speaker === 'ABACI' ? 'abaci-glow' : 'user-glow'}>
  {message.text}
</div>
```

**Sidebar header with neon divider:**
```tsx
<header className="relative p-4 border-b border-mauk">
  <div className="vertical-neon-line" style={{ '--line-color': 'var(--mauk)' } as any} />
  <h2 className="text-mauk">MAUK</h2>
</header>
```

**Theme toggle button:**
```tsx
import { CyberButton } from 'ccru';
import { useTheme } from 'next-themes';

export function ThemeToggle() {
  const { theme, setTheme } = useTheme();
  return (
    <CyberButton onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}>
      {theme === 'dark' ? '☀️' : '🌙'}
    </CyberButton>
  );
}
```

---

## Troubleshooting

**Q: Colors look washed out**
A: Make sure you're using oklch color space in CSS variables. Ensure `@import 'tailwindcss';` is first in globals.css.

**Q: Glow effects not showing**
A: Verify text-shadow is applied. Check that browser DevTools shows the CSS class (`.mauk-glow`, etc.) applied to the element.

**Q: CRT scanlines overlay looks wrong**
A: Make sure `.moving-scanlines` is on a fixed/absolute positioned element with `inset: 0` and `z-index: 50`.

**Q: Font isn't monospace**
A: Ensure you've loaded JetBrains Mono or Geist Mono via `@import` or `<link>` tag. Fallback to system monospace if needed.

**Q: ccru components not styled**
A: Install with `npm install ccru@github:lumpenspace/ccru`. Ensure CSS is loaded before component render.

---

## Next Steps

- **For a new project:** Use the `/brain-vat-theme` Claude Code skill (see SETUP_SKILL.md)
- **For fine-tuning:** Reference the color palette and animations above
- **For component help:** Check COMPONENT_STRATEGY.md to decide ccru vs shadcn vs custom
