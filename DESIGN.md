# Youhua MUN — Design System

**Reference:** *the engraved treaty plate.* A brass nameplate bolted to a General
Assembly desk, and the printed roll-call sheet lying beside it. Everything on this
site is either the plate (cut, high-contrast, ceremonial) or the sheet
(institutional, plain, legible at small sizes). Nothing is both.

---

## 1. Visual Theme

A council chamber at depth. The page is a camera moving through a dark blue room:
content rises out of depth, holds flat and crisp while you read it, then passes the
lens on the way out. Depth is literal here, expressed as Z position under a fixed
focal length, never as a drop shadow.

Mood: ceremonial without being ornamental. The page is a register of names, and it
should feel like one that will still be there in ten years.

## 2. Color Semantics

Defined entirely in OKLCH on a single hue axis (262°), so neutrals are tinted with
the brand rather than being grey.

| Token | Value | Role |
|---|---|---|
| `--surface-abyss` | `oklch(12% 0.022 262)` | page ground |
| `--surface-base` | `oklch(15.5% 0.030 262)` | section wash, menu panel |
| `--surface-raised` | `oklch(19% 0.038 262)` | cards, modals |
| `--surface-inset` | `oklch(23% 0.048 262)` | the lead plate, inputs' surround |
| `--accent-deep` | `oklch(36% 0.126 262)` | scrollbar, certificate rule |
| `--accent-core` | `oklch(53% 0.186 262)` | seals and stamps |
| `--accent` | `oklch(66% 0.180 261)` | **primary CTA plate**, active states |
| `--accent-lift` | `oklch(77% 0.118 258)` | links, hover, emphasis |
| `--accent-veil` | `oklch(88.5% 0.056 259)` | text over photography |
| `--text-strong` | `oklch(96.5% 0.012 260)` | headings |
| `--text-body` | `oklch(85% 0.030 262)` | body copy |
| `--text-muted` | `oklch(72% 0.042 262)` | captions, metadata |
| `--text-faint` | `oklch(62% 0.048 262)` | struck labels |
| `--text-ink` | `oklch(12% 0.022 262)` | type **on** an accent plate |
| `--signal` | `oklch(69% 0.200 22)` | destructive only |

Lines and washes come in exactly five sanctioned strengths (`--rim-hair`, `--rim`,
`--rim-strong`, `--wash`, `--wash-lift`). Do not invent a sixth alpha of the same blue.

**Verified:** every text token clears 4.5:1 on every surface (lowest pair is
`--text-faint` on `--surface-inset` at 4.67:1). White on `--accent` fails at 3.16:1,
which is why the CTA plate takes `--text-ink` instead (6.41:1).

**60-30-10:** midnight surfaces dominate, the photograph and raised plates carry the
secondary weight, and the accent appears as one filled plate per visual band.

**Dark mode:** the page has one committed mode. There is no light variant, and that
is a decision, not an omission.

## 3. Typographic Hierarchy

- **Display — `Bodoni Moda`.** A Didone with burin-cut hairlines. Used at 1.5rem and
  above only, where the thin strokes hold on a dark ground. Weight 600, never 400.
- **Text — `Archivo`.** The grotesque of printed forms and signage. Everything below
  1.5rem, all UI, all data.

| Token | Size | Use |
|---|---|---|
| `--text-display` | `clamp(2.75rem, 8vw, 5.25rem)` | hero headline |
| `--text-h2` | `clamp(2rem, 5.2vw, 3.25rem)` | section titles |
| `--text-h3` | `clamp(1.375rem, 2.6vw, 1.75rem)` | card and modal titles |
| `--text-lead` | `clamp(1.0625rem, 1.7vw, 1.25rem)` | ledes, subtitles |
| `--text-base` | `1rem` | **body floor, never go below** |
| `--text-meta` | `0.875rem` | captions and metadata only |
| `--text-label` | `0.75rem` | struck labels, never a sentence |

Ratios are ≥1.25× between steps. Body line-height 1.65 with `0.006em` tracking,
both raised for light-on-dark. Headings 1.12. Measure capped at `65ch`.
`text-wrap: balance` on headings, `pretty` on paragraphs, `tabular-nums` on every
number in the register.

## 4. Component Styling

- **Buttons.** One filled plate per visual band: solid `--accent`, ink `--text-ink`,
  2px radius, no gradient and no sheen sweep. Minimum 48px tall for primary, 40px
  for utility. Hover lifts the plate to `--accent-lift`.
- **Cards.** Surface contrast carries elevation, not shadow. A card is a
  `.value-card` (the camera, holding perspective) wrapping a `.value-card-face`
  (the plate that tilts). Contents sit at their own `translateZ` so tilting shows
  parallax between title and body. Cards are never nested.
- **Inputs.** 40px, 2px radius, 1px hairline. Focus is a colour shift plus a 3px
  outer ring. The ring is never removed.
- **Nav.** 64px minimum. Backdrop blur is used in exactly one place, the scrolled
  navbar, because it sits over a moving photograph.
- **Seats.** A seat is a button standing upright on a rotated floor plane, wrapped
  in `.seat-upright` which counter-rotates the stage's tilt.

## 5. Layout Principles

4px base unit, semantic tokens only (`--space-2xs` 4 → `--space-5xl` 128). Section
padding is `--space-4xl` (96px). Max content width 1160px; the footer matches its
left rail at 1128px + padding.

Rhythm is deliberately uneven: 4–12px inside a cluster, 48–96px between sections.
Grid for 2D structures, flexbox for 1D. The value grid is asymmetric on purpose
(`1.15fr 1fr` with the lead plate spanning both rows) so it never reads as three equals.

## 6. Depth System

There is no shadow scale. Elevation is Z position under `--lens: 1400px`:

| Plane | Z | Meaning |
|---|---|---|
| entering | `-420px` | below the fold, rising, blurred |
| resting | `0` | readable: flat, crisp, unfiltered |
| exiting | `+240px` | past the lens, blurred, gone |

The hall runs its own camera: `--tilt` (a registered `@property` angle) rotates the
stage plane, and scroll scrubs it from 26° to 10° so the room lifts toward eye level.
`--speed` is driven by scroll velocity and tightens the vignette, the way a lens does
when a camera whips between marks.

## 7. Design Constraints

This system forbids:

- Fonts from the reject list as display or brand faces
- Gradient text, side-stripe cards, cards inside cards
- Glassmorphism anywhere except the scrolled navbar over the photograph
- Hero metric strips, and any number the club cannot stand behind
- Three-up identical feature grids
- An uppercase kicker above every section heading. Chapter names live in the scroll
  rail, once, as navigation
- Numbered section decorators (`01 · 02 · 03`)
- Bounce or elastic easing
- Em-dashes in UI copy
- Raw hex for colour generation
- Any spacing value that is not a 4pt multiple
- Body prose below 16px
- Gating content visibility on a transition

## 8. Responsive Strategy

Mobile first in behaviour, verified at 320 / 375 / 414 / 1440.

- `≤640px` or any coarse pointer: perspective is switched off entirely. The chamber
  flattens, `--tilt` goes to 0, and depth blur is dropped, because perspective is
  punishing on a phone held close to the face and blur is the most expensive thing
  on the page.
- `≤640px`: the horseshoe cannot hold a name *and* a grade at that width, so the
  perimeter keeps the name and the grade moves to the dossier. The seat button stays
  over 40px even though the avatar inside it shrinks to 38px.
- `≤720px`: hero top padding grows to clear the fixed login chip.
- `≤480px`: the ambience control drops its caption and becomes its own visualiser.
- `≤1100px`: the scroll rail is hidden.

Touch targets are ≥40×40 everywhere, verified in-browser.

## 9. Agent Prompt Guide

> Build in the "engraved treaty plate" system: Bodoni Moda for display at 1.5rem and
> up, Archivo for everything smaller, on OKLCH midnight-sapphire surfaces tinted to
> hue 262. All colour comes from the `--surface-*`, `--accent-*` and `--text-*`
> tokens; all spacing from the 4pt `--space-*` scale; radius is 2px, with circles
> reserved for faces and status lights. Depth is real: elements carry a Z position
> under a 1400px lens and one scrubbed timeline owns each element for its whole
> journey (rise from `z:-420`, hold flat and crisp at `z:0`, dolly past at `z:+240`),
> so scrolling up is the same move played backwards. Motion is `expo.out` entering
> and `power2.in` leaving, never bounce. One filled accent plate per visual band,
> ink-on-accent, no gradients and no sheen. Body text never goes below 16px, measure
> never exceeds 65ch, every text/background pair clears 4.5:1, and perspective and
> depth blur switch off entirely on coarse pointers.
