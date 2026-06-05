# Design Rules — Impeccable + Taste Skill + Awesome Design MD

These rules are permanently active. Apply them to every UI change, component, and new page without being asked.

---

## 1. THE SLOP TEST (run before shipping anything)

Ask: "Would someone look at this and immediately know an AI generated it?"  
If yes → restart. The bar is distinctiveness. A visitor should ask *"how was this made?"*, not *"which AI made this?"*

Second test: Name the specific aesthetic reference before committing to any design direction (e.g., "Stripe-minimal restrained", "Vercel pure-black monochrome", "Mailchimp yellow full palette"). Unnamed ambition becomes beige.

---

## 2. ABSOLUTE BANS (never produce these)

These patterns are instant AI tells. Never use them:

- Side-stripe / left-border accent cards
- Gradient text (`background-clip: text`)
- Default glassmorphism (blur + semi-transparent card without a specific brand reason)
- Hero sections with big metric numbers (e.g., "10M users · 99.9% uptime · 150+ countries")
- Identical three-up feature card grids with icon + heading + body
- Tiny uppercase tracked labels (`FEATURES`, `WHY US`, `TESTIMONIALS`) above every section heading — if you use a kicker, use it once as a deliberate system, not as structural scaffolding
- Numbered section markers (`01 · 02 · 03`) as decorative scaffolding
- Bounce / elastic CSS easing (`cubic-bezier` with overshoot)
- Dark glows on dark backgrounds
- Em-dash (`—`) as punctuation in UI copy
- Beige + brass / warm-sand "premium consumer" palette when that isn't the explicit brief
- Cards nested inside cards
- Text overflow at any breakpoint (test every headline at 320px)

---

## 3. FONT RULES

### Hard reject list — never pick these as the default/display font

`Inter` · `Fraunces` · `Newsreader` · `Lora` · `Crimson` · `Crimson Pro` · `Crimson Text` · `Playfair Display` · `Cormorant` · `Cormorant Garamond` · `Syne` · `IBM Plex Mono` · `IBM Plex Sans` · `Space Mono` · `Space Grotesk` · `DM Sans` · `DM Serif Display` · `Outfit` · `Plus Jakarta Sans` · `Instrument Sans` · `Instrument Serif`

> Exception: if the existing project has already shipped with one of these as its brand font, preserve it — the ban applies to new design decisions, not overriding live brand identity.

### Font selection procedure (required for any new type decision)

1. Write three concrete brand-voice words — not "modern" or "elegant", but something physical: *"warm and mechanical and opinionated"*, *"calm and clinical"*.
2. List the three fonts you'd reach for by reflex. If any are on the reject list, discard them.
3. Browse a real catalog (Google Fonts, Pangram Pangram, Future Fonts, Adobe Fonts) with those words. Find the font as a *physical object*: a museum caption, a 1970s terminal manual, a mid-century receipt.
4. Cross-check: "elegant" is not necessarily serif. "Technical" is not necessarily mono. If the final pick matches your original reflex, start over.

### Type scale

- Minimum body size: **16px**
- Hierarchy ratio: **≥1.25×** between steps (avoid flat 1.05–1.1 scales)
- Use `clamp()` for fluid headings on marketing pages; fixed rem scales for app UIs
- Max line length: **65ch** (`max-width: 65ch` on text containers)
- Body line-height: **1.5–1.7**; headings: **1.1–1.2**
- For light text on dark backgrounds: add **0.05–0.1 to line-height** and a subtle letter-spacing bump
- Use `text-wrap: balance` on headings
- Limit font families to **2–3 maximum**
- `tabular-nums` on all currency, data, or numeric content
- Semantic token names (`--text-body`, `--text-heading`) — never value-based names
- Never use `px` for `font-size`; never set body below 16px

---

## 4. COLOR RULES

- Use **OKLCH** throughout (`oklch(L C H)`) — never raw hex for color generation
- Body text contrast: **≥4.5:1** (WCAG AA)
- Large text / UI components: **≥3:1**
- Never pure black (`#000`) or pure gray — always tint neutrals with the brand hue
- Avoid warm-neutral bland backgrounds (`#f5f5f0`) as a lazy default — every canvas choice should be intentional
- Gray text on colored backgrounds is a contrast trap — verify every combination
- **60-30-10 visual weight**: 60% dominant neutral, 30% secondary, 10% accent
- Color strategies for brand surfaces: Committed, Full palette, or Drenched — not timid neutrals unless restraint is a named brand decision
- Dark mode: always provide it or explicitly choose not to; never leave it as an afterthought

---

## 5. LAYOUT & SPACING RULES

- **Base unit: 4px**. All spacing values must be multiples of 4: `4, 8, 12, 16, 24, 32, 48, 64, 96px`
- Use semantic spacing tokens (`--space-sm`, `--space-md`) — never arbitrary values
- Flexbox for 1D arrangements; Grid for 2D structures
- Responsive grids: `grid-template-columns: repeat(auto-fit, minmax(280px, 1fr))`
- Section padding: **96px** top/bottom (modern SaaS rhythm); component internal padding: **32px** for cards, **24px** for compact cards
- Max content width: **~1200px** centered
- Never use identical spacing everywhere — rhythm requires tight groupings (8–12px within a cluster) paired with generous separations (48–96px between sections)
- **Squint test**: blur your eyes at the design; primary, secondary, and grouped elements must still be distinguishable by space and weight alone
- Container queries for component-level adaptation; viewport queries for page-level layout

---

## 6. COMPONENT RULES

### Buttons
- Minimum touch target: **40×40px** on mobile
- Primary CTA: use a committed brand color — never a default blue
- Pill shape (`border-radius: 9999px`) is one valid choice; md radius (8px) is another — commit to one system
- Never more than one filled CTA per visual band

### Cards
- Cards represent distinct, actionable content — if three cards say the same thing with different words, rethink the structure
- Card grid monotony: vary card sizes, column spans, or mix cards with non-card content
- Never nest cards inside cards
- Internal padding: 24–32px; border-radius: 8–16px; prefer surface color contrast over shadows

### Inputs & Forms
- Height: 40px; border-radius: 8px; 1px hairline border
- Focused state must be visually unambiguous (color shift + optional outer ring)
- Never remove the visible focus ring for keyboard users

### Navigation
- Desktop nav: 60–64px height
- Mobile: hamburger at <768px; never let nav overflow viewport

---

## 7. MOTION RULES

- Every animation must have a **semantic purpose** — never "fade-on-scroll for every section"
- Use **exponential easing** (`cubic-bezier(0.16, 1, 0.3, 1)` for entrances); never bounce or elastic
- Always provide `@media (prefers-reduced-motion: reduce)` alternatives
- Never gate content visibility on a transition (content must be accessible even if animation fails)
- **One well-orchestrated page-load sequence beats scattered micro-interactions**
- For a signature hero moment: one committed entrance animation; not scroll-triggered reveals on every element

---

## 8. IMAGERY RULES

- When the brief implies imagery (restaurant, hotel, travel, fashion, product, photography) — **zero images is a bug, not restraint**
- One decisive photo beats five mediocre ones
- Alt text must carry brand voice: `"handmade pasta on a scratched wooden table"` not `"pasta dish"`
- Never use a colored `<div>` placeholder where a photo belongs
- For stock imagery: use Unsplash (`https://images.unsplash.com/photo-{id}?auto=format&fit=crop&w=1600&q=80`) — only use IDs you have verified; never guess an ID

---

## 9. ACCESSIBILITY RULES

- Semantic HTML first: `<nav>`, `<main>`, `<article>`, `<section>`, `<button>` — never `<div>` for interactive elements
- All interactive elements must be keyboard-navigable
- Never skip heading levels (`h1` → `h3`)
- ARIA labels required on icon-only buttons
- Verify contrast on every text/background pair, including hover states
- Screen-reader testing: use `aria-live` for dynamic content

---

## 10. ANTI-SLOP CHECKLIST (run before declaring any UI work done)

Before shipping, verify:

- [ ] No font from the reject list used as display/brand font
- [ ] No gradient text
- [ ] No side-stripe cards
- [ ] No glassmorphism without explicit brand reason
- [ ] No hero metric section (`"10M users"`)
- [ ] No three-up identical feature cards
- [ ] No repeated uppercase kicker labels on every section
- [ ] No numbered section decorators
- [ ] No bounce easing
- [ ] No em-dash in UI copy
- [ ] No text overflow at 320px
- [ ] No arbitrary spacing values (all are 4pt multiples)
- [ ] No pure black or untinted neutrals
- [ ] Contrast ≥4.5:1 on all body text pairs
- [ ] Focus ring visible on all interactive elements
- [ ] `prefers-reduced-motion` handled
- [ ] Mobile layout verified at 375px and 320px
- [ ] Touch targets ≥40×40px

---

## 11. DESIGN.MD STANDARD (from VoltAgent/awesome-design-md)

When starting a new project or documenting an existing design system, create a `DESIGN.md` in the project root with these nine sections:

1. **Visual Theme** — overall aesthetic, mood, tone
2. **Color Semantics** — full palette with roles (primary, surface, text, semantic states)
3. **Typographic Hierarchy** — families, weights, sizes, scale, line-heights
4. **Component Styling** — buttons, cards, inputs, nav, badges
5. **Layout Principles** — grid system, spacing scale, max-widths, breakpoints
6. **Depth System** — shadow scale, elevation levels, or color-contrast-based depth
7. **Design Constraints** — what this design system explicitly forbids
8. **Responsive Strategy** — mobile-first breakpoints, touch targets, responsive behavior
9. **Agent Prompt Guide** — a one-paragraph brief an AI agent can paste directly to reproduce this design

---

## 12. SOURCES

These rules are compiled from:
- **Impeccable v3.5** (pbakaus/impeccable) — Typography, spacing, motion, audit, anti-patterns
- **Taste Skill v2** (Leonxlnx/taste-skill) — Anti-slop framework, design system dials, pre-flight check
- **Awesome Design MD** (VoltAgent/awesome-design-md) — DESIGN.md standard format and brand reference system
