# Youhua MUN · Design System: "The Charter"

## 1. Visual Theme

The site borrows the United Nations' own visual language and sets it with editorial restraint. Reference points: the UN emblem's azimuthal world map, the flat UN-blue field of the flag, the typeset look of a real draft resolution, and a passport's data page. On the craft side, it follows award-winning studio sites (Lusion, Igloo Inc): one signature WebGL piece, weighted smooth scroll, and quiet everything else.

Mood: ceremonial, typeset, deliberate. Nothing glows. Depth comes from type scale, surface changes and one 3D moment.

Page rhythm, top to bottom:

| Section | Surface | Idea |
| --- | --- | --- |
| Intro curtain | ink | A document symbol `YH/MUN/2026/1` is set, a rule is drawn, the curtain lifts (first visit per session only) |
| Hero | ink | WebGL emblem map. 15 seat markers in place of the olive wreath; claimed seats light up from live data. On scroll the map tilts down into a chamber floor |
| Manifesto | UN blue | Words light up as they are read (scroll-scrubbed) |
| Resolution | paper | "What a founding seat means", written as a MUN draft resolution with preambular and operative clauses |
| Hall of Founders | ink | The U-shaped council table draws itself, then seats arrive |
| Delegation | ink | A roll call register. Each delegate is "Present" |
| Assembly | photo | The General Assembly photo opens from a small window to full bleed (pinned, desktop only) |
| Lexicon + quote | ink | Debate / Diplomacy / Impact as dictionary entries |
| Closing | UN blue | One decision: claim a seat or join the delegation |
| Footer | ink | Names on the record (marquee), full-width wordmark |

## 2. Color Semantics

All colours are OKLCH. Tokens live in `src/index.css`.

| Token | Value | Role |
| --- | --- | --- |
| `--ink` | `oklch(0.165 0.028 258)` | Dominant surface (about 60%) |
| `--ink-2`, `--ink-3` | `0.205`, `0.27` L | Menu surface, monogram fill |
| `--ink-line` | `oklch(0.34 0.035 255)` | Hairlines on ink |
| `--paper` | `oklch(0.965 0.006 240)` | Resolution section, dialogs (cool paper, not beige) |
| `--paper-2`, `--paper-line` | | Inset fills and hairlines on paper |
| `--un` | `oklch(0.67 0.14 237)` | UN blue. The one committed colour: drenched sections, primary buttons, seat markers |
| `--un-deep` | `oklch(0.46 0.13 248)` | Blue for text and rules on paper |
| `--vermilion` | `oklch(0.53 0.19 31)` | Ink stamps and destructive actions only |

Surfaces are declared with `data-theme="ink" | "blue" | "paper"` (or `.tone-paper` / `.tone-ink` on dialogs). Each sets `--bg --fg --fg-muted --line --accent --focus` and the button variables, so components never hard-code a colour.

Contrast: body text on ink is `--on-ink` (L 0.95) and `--on-ink-muted` (L 0.75), both well above 4.5:1. On UN blue, text is ink (about 6:1); white text on UN blue is not allowed. On paper, muted text is L 0.44 (about 7:1).

Dark mode: the site is ink-first by design, with blue and paper as deliberate section changes. There is no light/dark toggle; this is an explicit decision.

## 3. Typographic Hierarchy

Self-hosted through `@fontsource-variable` (no Google Fonts request).

| Family | Use |
| --- | --- |
| **Bodoni Moda** (variable, opsz) | Display, headings, names, resolution clauses. High-contrast Didone, like an engraved treaty header. Italic carries emphasis. Always set its optical size explicitly: `--opsz-display` (28) for headings, `--opsz-text` (11) for anything read at small or body sizes. Never leave it on automatic: the 96 display cut's hairlines vanish on screen |
| **Schibsted Grotesk** (variable) | Body, UI, buttons. A newspaper grotesk: plain and principled |
| **Martian Mono** (variable, width 90%) | Document symbols, metadata, numbers, the passport's machine-readable line |

Scale (fluid with `clamp()`): hero `3rem → 12.5rem`, display-1 `3rem → 8.5rem`, display-2 `2.5rem → 5.75rem`, lede `1.125 → 1.375rem`, body `1.0625rem`, meta `0.8125rem` (mono only). Each step is at least 1.25× the one below.

Headings: line-height 0.9 to 1.1, `text-wrap: balance`, tracking about −0.02em. Body: line-height 1.5 to 1.6, max about 46ch. All numbers use `tabular-nums`.

## 4. Component Styling

- **Buttons**: one pill system (`--radius-full`), 48px tall (56px for `btn-lg`), sentence case, weight 600. `btn-primary` is UN blue with ink text on ink surfaces. `btn-ink` inverts the current surface. `btn-ghost` is a hairline outline. Only one filled button per visual band.
- **Inputs**: 48px, 8px radius, 1px hairline, focus shows a colour shift plus a 3px ring.
- **Dialogs**: paper sheets with a 16px radius. Each opens with a mono document symbol (`YH/MUN/ID`, `Seat 4 of 15`). Escape closes; focus moves in on open and returns on close.
- **Credential**: the seat-claim confirmation is a passport data page with guilloche print, a vermilion rotary stamp carrying the seat number, and a real two-line MRZ built from the member's name.
- **Seats**: 56px portrait or italic monogram inside a hairline ring on ink. The Head of Council gets an 80px portrait with a UN-blue ring. Bestie pairs share a coloured ring and badge.
- **Roll call rows**: number, portrait, name in Bodoni, grade and class in mono, "Present". On hover the row fills UN blue.
- **Nav**: 64px tall, transparent at the top. Once scrolled it takes the colour of the section underneath.

## 5. Layout Principles

- Container max width 1200px; gutter `clamp(16px, 4vw, 48px)`.
- Spacing tokens on a 4pt grid: `--space-1` (4px) through `--space-10` (128px). Sections use 96 to 128px vertically; clusters use 8 to 12px.
- Asymmetric editorial grids: 5/7 splits (resolution, delegation), 1.7/1 (closing), with sticky left headers on desktop.
- The hero is 185svh tall with a sticky 100svh stage, which gives the map room to tilt.

## 6. Depth System

There are no drop shadows and no glows. Depth comes from:
1. Surface changes (ink, UN blue, paper).
2. Hairline rings and rules.
3. One real 3D element: the WebGL emblem map (perspective projection, cursor parallax, scroll tilt).
4. Masked type that rises into place.

## 7. Design Constraints

Forbidden here (in addition to CLAUDE.md):
- Blur filters, animated `filter`, `backdrop-filter`, glowing orbs. These caused the old site's jank.
- White text on UN blue.
- Gradient text, glass cards, three-up feature cards, stat rows ("193 nations · 400K+ delegates").
- Uppercase tracked kicker labels. Mono document symbols are the one labelling system, used where a real document would have them.
- Em dashes in UI copy.
- Scroll animations that fade content out as it leaves. Reveals play once and content stays visible.
- Animating `clip-path`, `filter` or layout properties on scroll. Scroll-linked motion uses transforms and opacity only (the photo reveal scales a frame and counter-scales the image), and scrub values stay at or under 0.4 because Lenis already smooths.
- More than one easing family. Use `--ease-out` (`cubic-bezier(0.16, 1, 0.3, 1)`) and `--ease-inout` for curtains only. No overshoot.

## 8. Responsive Strategy

- Below 900px: the hero stacks (map above the headline), the headline scales `clamp(3rem, 17vw, 6.5rem)`, and sticky side headers become static.
- Below 768px: nav collapses to icon buttons (40×40 targets); the status pill is hidden.
- Below 720px: the Assembly photo is not pinned; it shows at 80svh with its caption.
- Below 640px: the council becomes a taller 3:5 chamber, seat grades hide, and dialogs stack their preview above the fields.
- Verified at 1440, 800, 375 and 320px with no horizontal overflow.
- `prefers-reduced-motion`: no curtain, no smooth scroll, no GSAP. The map renders one static frame, the marquee becomes a wrapped list, and all content is visible.

## 9. Agent Prompt Guide

> Design in the "Charter" system: the United Nations' own visual language set with editorial restraint. Surfaces alternate between ink `oklch(0.165 0.028 258)`, flat UN blue `oklch(0.67 0.14 237)` with ink text, and cool paper `oklch(0.965 0.006 240)`. Declare them with `data-theme`. Type is Bodoni Moda for display (italic for emphasis, tight tracking, balanced lines), Schibsted Grotesk for body and UI, and Martian Mono for document symbols, metadata and numbers. Buttons are pills; there is one filled button per band. Nothing glows, blurs or casts shadows: depth comes from surface changes, hairlines, masked type and the single WebGL emblem map. Motion uses `cubic-bezier(0.16, 1, 0.3, 1)`, gives every effect one job, plays reveals once, and always respects `prefers-reduced-motion`. Copy borrows real MUN and UN conventions (document symbols like `YH/MUN/2026/L.1`, preambular and operative clauses, "Present" at roll call) and never uses em dashes.
