# Bloom — Design System

A task management SaaS for flower farms. Web portal for owners, farm managers, and office staff. Mobile app for field workers, harvest leads, and roving managers.

> Working product name: **Bloom**. Replace if the team lands on a different one — all token names stay the same.

---

## 1. Product context

**Who uses this, where, and how it shapes the design**

| User | Primary surface | Conditions | Implication |
|---|---|---|---|
| Farm owner / GM | Web portal | Office, desktop | Dense dashboards, exports, reporting |
| Farm manager | Web + mobile | Office + field | Parity between surfaces; quick switching |
| Crew lead | Mobile | Outdoors, gloved hands, bright sun | Large hit targets, high-contrast, offline-first |
| Field worker | Mobile | Outdoors, intermittent connectivity, often a shared device | Minimal text input, photo and voice capture, simple flows |
| Office / sales | Web | Desktop | Order pipeline, customer view, harvest forecasts |

Every component below is reviewed against three questions: *Does it work with gloves? Does it work in bright sun? Does it work offline?* If a component fails one, the spec says so and offers an alternate.

---

## 2. Design principles

1. **Calm by default, urgent when it matters.** A flower farm is loud, hot, and chaotic. The interface should not add to that. Reserve color saturation and motion for things that actually need attention (overdue harvest, weather alert, missed handoff).
2. **The content is the color.** Flowers and crops bring their own palette through photography. The UI stays in cool, neutral blues so product imagery, status colors, and chart data read clearly without competing.
3. **Field-first, not field-last.** Mobile is not a stripped-down web view. Mobile is where the work happens; web is where the work is planned and reviewed. Design mobile flows first.
4. **One tap to log, one swipe to advance.** A worker pulled away mid-task should be able to log progress in under three seconds without typing.
5. **Forgiving, not fragile.** Undo over confirm. Drafts over forms. Auto-save over save buttons. Field conditions mean dropped taps, dirty screens, and dying batteries.
6. **Show the season.** Time is the core unit of a flower farm — every screen should make it obvious where we are in the week, the bloom cycle, and the year.

---

## 3. Brand & voice

**Tone.** Practical, warm, knowledgeable. We sound like the experienced farm manager who has been doing this for fifteen years and is happy to show you the ropes — not a chirpy app and not a cold enterprise tool.

**Do**
- Use real farm vocabulary: *bed, row, succession, flush, stems, bunches, cooler, post-harvest*
- Keep labels short and direct: "Log harvest", "Mark bed cleared", "Assign to crew"
- Use the worker's name in confirmations: "Logged for Maria"

**Don't**
- Don't gamify the work ("You crushed it! 🎉")
- Don't over-explain ("This action will record a harvest entry which will then be added to your daily harvest log...")
- Don't apologize for the software ("Oops! Something went wrong on our end!"). State what happened and what to do next.

---

## 4. Color system

### 4.1 Core palette — *Ocean Breeze*

| Token | Hex | Role |
|---|---|---|
| `--blue-900` | `#03045E` | Deep navy. Primary text on light, brand mark, headers |
| `--blue-700` | `#0077B6` | Primary action. Buttons, links, selected nav |
| `--blue-500` | `#00B4D8` | Accent. Highlights, focus rings, active indicators, primary chart series |
| `--blue-300` | `#90E0EF` | Subtle accent. Hover surfaces, secondary chart series, info backgrounds |
| `--blue-100` | `#CAF0F8` | Surface tint. Selected row, current-day highlight, light info panel |

**Why this palette for a flower farm.** Most ag tools default to green, which fights with crop imagery and starts feeling muddy at scale. A cool blue system gives photos and chart data room to breathe, reads as professional rather than utilitarian, and provides clear contrast for the warm semantic colors below.

### 4.2 Neutrals

Custom-mixed against `--blue-900` so the grays carry a faint cool cast and tie to the palette.

| Token | Hex (light) | Hex (dark) | Role |
|---|---|---|---|
| `--neutral-0` | `#FFFFFF` | `#0A0F2C` | Page background |
| `--neutral-50` | `#F7F9FC` | `#0F1535` | Elevated background |
| `--neutral-100` | `#EDF1F7` | `#161D40` | Card background |
| `--neutral-200` | `#DCE3ED` | `#1F2750` | Borders, dividers |
| `--neutral-400` | `#8A94A6` | `#6B7494` | Secondary text, icons |
| `--neutral-600` | `#4A5468` | `#A8B0CC` | Body text |
| `--neutral-900` | `#1A1F36` | `#E8ECF7` | Primary text |

### 4.3 Semantic colors

Ocean Breeze is monochrome by intent — semantic colors are introduced as a complementary system, tuned warm so they stand out against the blues.

| Token | Hex | Use |
|---|---|---|
| `--success-500` | `#10B981` | Harvest ready, task complete, healthy stand |
| `--success-100` | `#D1FAE5` | Success backgrounds |
| `--warning-500` | `#F59E0B` | Pending, attention needed, weather watch, low stem count |
| `--warning-100` | `#FEF3C7` | Warning backgrounds |
| `--danger-500` | `#EF4444` | Overdue, pest alert, crop loss, weather warning |
| `--danger-100` | `#FEE2E2` | Danger backgrounds |
| `--info-500` | `var(--blue-500)` | Same as accent — note, tip, informational |

### 4.4 Application rules

- **Primary actions:** `--blue-700` background, white text. One primary per view.
- **Secondary actions:** transparent background, `--blue-700` text, `--neutral-200` border.
- **Destructive:** `--danger-500` text on transparent (preferred), or solid `--danger-500` for high-stakes confirmations only.
- **Selected / active:** `--blue-100` background, `--blue-900` text, 2px `--blue-500` left border on nav items.
- **Focus ring:** 2px `--blue-500` outline at 2px offset. Never removed.
- **Never** use `--blue-500` for long-form text (insufficient contrast). It is an accent, not a body color.

### 4.5 Status colors for crops & tasks

Distinct from semantic colors — these tag *things*, not *messages*.

| Status | Color | Token |
|---|---|---|
| Planted | `--blue-300` | New, not yet productive |
| Growing | `--blue-500` | Active, on schedule |
| Ready to harvest | `--success-500` | Within harvest window |
| Overdue | `--danger-500` | Past peak |
| Cleared | `--neutral-400` | Bed turned over |

---

## 5. Typography

**Family.** `Inter` for UI. `Inter` is open-source, has excellent legibility at small sizes, supports tabular numerals (critical for stem counts and harvest data), and renders well on low-DPI Android devices common in field use.

Fallback stack: `Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif`.

### 5.1 Type scale

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `display` | 32 / 40 | 700 | Dashboard hero numbers, big KPI values |
| `h1` | 24 / 32 | 700 | Page titles |
| `h2` | 20 / 28 | 600 | Section titles, card titles |
| `h3` | 16 / 24 | 600 | Sub-sections, list group headers |
| `body` | 14 / 20 | 400 | Default body text |
| `body-strong` | 14 / 20 | 600 | Emphasis in body |
| `caption` | 12 / 16 | 400 | Metadata, timestamps, helper text |
| `overline` | 11 / 16 | 600, tracking +0.06em, uppercase | Card eyebrows, KPI labels |
| `mono` | 13 / 20 | 500, `JetBrains Mono` | Stem counts, IDs, totals |

### 5.2 Mobile adjustments

Bump body to **16 / 24** on mobile to prevent iOS auto-zoom on inputs and improve outdoor legibility. KPI displays scale up to **40 / 48**. Caption stays at 12 — anything smaller fails in sun.

---

## 6. Spacing, grid & layout

### 6.1 Spacing scale (4px base)

`4, 8, 12, 16, 20, 24, 32, 40, 48, 64`

Component internal padding lives in 8/12/16. Layout gaps live in 16/24/32. Section spacing lives in 32/48/64.

### 6.2 Radius

| Token | Value | Use |
|---|---|---|
| `--radius-sm` | 6px | Inputs, small buttons, badges |
| `--radius-md` | 10px | Buttons, cards on mobile |
| `--radius-lg` | 14px | Cards on web, modals |
| `--radius-xl` | 20px | Hero cards, bottom sheets |
| `--radius-full` | 999px | Pills, avatars |

### 6.3 Elevation

Borders carry most of the visual hierarchy. Shadows are used sparingly, mostly for overlays.

| Token | Value | Use |
|---|---|---|
| `--shadow-none` | 1px solid `--neutral-200` | Default card |
| `--shadow-sm` | `0 1px 2px rgba(3, 4, 94, 0.06)` | Card on hover |
| `--shadow-md` | `0 4px 12px rgba(3, 4, 94, 0.08)` | Dropdowns, popovers |
| `--shadow-lg` | `0 12px 32px rgba(3, 4, 94, 0.12)` | Modals, bottom sheets |

### 6.4 Web grid

- Container max: **1440px**
- Sidebar (expanded): **240px** / collapsed: **72px**
- Main column gutters: 24px between cards
- 12-column grid inside main column at desktop, 8 at tablet, 4 at mobile

### 6.5 Mobile grid

- 16px horizontal padding minimum
- Cards span full width, stacked, 12px vertical gap
- Bottom tab bar: 56px + safe area inset
- FAB: 56px, 16px from edges, raised 24px above tab bar when present

---

## 7. Iconography

**Library.** `Lucide` (open-source, line-style, MIT). Consistent stroke, large library, matches the calm-but-precise feel of the system.

**Sizes.** 16 / 20 / 24 / 32. Default UI icons at 20. Nav icons at 24. Touch-target icons at 24 minimum on mobile.

**Color.** Inherits text color. Active states use `--blue-700`.

**Domain extensions.** A small custom set is needed for things Lucide doesn't cover: *bunch, bed, succession, post-harvest, cooler, bloom-stage*. Match Lucide's 1.5px stroke, 24px optical canvas, rounded line caps.

---

## 8. Motion

Motion should feel like a curtain shifting in a breeze, not a popcorn machine.

| Token | Duration | Easing | Use |
|---|---|---|---|
| `--motion-fast` | 120ms | `ease-out` | Hovers, micro-state changes |
| `--motion-base` | 200ms | `cubic-bezier(0.2, 0, 0, 1)` | Standard transitions |
| `--motion-slow` | 320ms | `cubic-bezier(0.2, 0, 0, 1)` | Bottom sheets, modals, page transitions |
| `--motion-spring` | spring(stiffness 220, damping 26) | — | Drag interactions, swipe-to-complete |

**Reduced motion.** All non-essential motion respects `prefers-reduced-motion: reduce` — transforms collapse to opacity-only, springs become 100ms linear fades.

---

## 9. Core components

### 9.1 Button

| Variant | Background | Text | Border |
|---|---|---|---|
| Primary | `--blue-700` | white | none |
| Secondary | transparent | `--blue-700` | 1px `--neutral-200` |
| Tertiary | transparent | `--blue-700` | none |
| Destructive | `--danger-500` | white | none |
| Ghost (dark surfaces) | `rgba(255,255,255,0.08)` | white | none |

**Sizes.** sm 32px / md 40px / lg 48px. **Mobile default is lg.** Web default is md. Minimum 44×44 hit target enforced on mobile regardless of visual size.

States: hover (–4% brightness), active (–8%), disabled (40% opacity, no pointer events), loading (spinner replaces icon, label dims).

### 9.2 Input

- Height: 40 (web), 48 (mobile)
- Border: 1px `--neutral-200`, → `--blue-500` on focus, → `--danger-500` on error
- Label above, helper text below
- Inline validation, never on submit only
- **Numeric inputs use mono font** for harvest counts, prices, IDs
- Stepper buttons (±) flanking numeric inputs on mobile for gloved entry

### 9.3 Card

Default: `--neutral-0` background, 1px `--neutral-200` border, `--radius-lg`, 20px padding (web) / 16px padding (mobile).

Hover (web only): translate up 2px, `--shadow-sm`.

### 9.4 Badge / pill

20px tall, 8px horizontal padding, 11px overline-cased label, full-rounded. Uses status colors at 100/500 pair (100 background, 500 text).

### 9.5 Avatar

Circle, four sizes: 24 / 32 / 40 / 56. Initials fallback uses `--blue-100` background, `--blue-900` text, 600 weight. Group stack overlaps at 25%, max 4 visible + "+N" pill.

### 9.6 Toast

Bottom-center on mobile (above tab bar), top-right on web. Auto-dismiss 4s, persistent for errors. Single action allowed. Slides in `--motion-base`.

### 9.7 Bottom sheet (mobile)

Primary modal surface on mobile. Drag handle at top, `--radius-xl` top corners, `--shadow-lg`. Three snap points: peek (25%), half (50%), full. Use for task detail, photo capture, assignment.

### 9.8 Empty / loading / error states

Every list, table, and chart has three explicit states. Empty states use a domain illustration, one sentence, one action ("No tasks today — *Plan tomorrow's harvest*"). Loading uses skeleton blocks, never spinners on full pages. Errors state what failed and what to do, never just "Something went wrong".

---

## 10. Navigation patterns

### 10.1 Web — left sidebar

use our current  layout. 240px expanded, 72px collapsed (icons only with tooltips).



Active item: `--blue-100` background, 2px `--blue-500` left border, `--blue-900` text. Top: brand mark + collapse toggle. Bottom: profile + logout.

### 10.2 Mobile — bottom tab bar

Active tab: `--blue-700` icon and label, others `--neutral-400`. Labels always visible (icon-only fails for new workers).



### 10.3 Top bar

Web: search (cmd-K), theme toggle, language switcher, notifications, profile — mirrors the reference. Mobile: page title left, contextual action right (filter, search, or scan).

---

## 11. Data visualization

### 11.1 Chart palette

Charts use a curated subset of the palette plus warm accents so series stay distinguishable. Series order:

1. `--blue-700` (primary)
2. `--warning-500` (secondary — comparison)
3. `--blue-300` (tertiary)
4. `--success-500`
5. `--blue-900`
6. `--danger-500`

This mirrors the blue + warm-accent pairing in the reference dashboards.

### 11.2 Chart types

| Chart | Use |
|---|---|
| Vertical bar | Daily/weekly harvest counts, expense vs revenue |
| Stacked bar | Stem counts by variety per day |
| Line | Bloom forecasts, demand vs supply over season |
| Donut | Bed status mix, order fulfillment % |
| Heatmap calendar | Bloom cycles across the year, harvest density |
| Sparkline | Inline KPI trend (last 14 days) |

### 11.3 Chart rules

- Axes use `--neutral-400` text, `--neutral-200` gridlines
- Tooltips on hover (web) / long-press (mobile), `--shadow-md`, `--radius-md`
- Always show units (stems, bunches, $, %)
- Tabular numerals everywhere — numbers must align column-wise
- Donut/pie limited to 5 segments; remainder grouped as "Other"

---

## 12. Domain components

These are the components that make this app a *flower farm* tool and not a generic SaaS.

### 12.1 Bed card

Represents one bed/row in production. Always shows: variety photo (or color block), variety name, bed ID, current stage (planted/growing/ready/overdue/cleared), days-since-planting, expected harvest window, assigned crew. Tappable to open bed detail.

### 12.2 Task card

Title, due window (today / morning / afternoon / specific time), assignee avatars, location (bed or area), priority dot, status. Swipe right to complete, swipe left to reassign. Long-press to drag (web: native drag).



### 12.4 Crew card

Avatar, name, role, today's assignment, check-in status (badge: on-site, off, break), tasks completed today. Manager view adds productivity sparkline.


---

## 13. Web portal specifics

### 13.1 Layout

Dashboard layout follows the reference: sidebar + top bar + main content. Main content uses a 12-column grid with KPI cards in a row of 4, primary chart spanning 8 columns + secondary card spanning 4, then a section of equal cards below.

### 13.2 Density

Power users (managers, owners) need density. Provide a compact mode toggle that drops vertical padding by 25% across cards and lists for desktop reporting work.

### 13.3 Keyboard

- `cmd/ctrl + K` — global search and quick actions
- `g` then letter — navigate (`g t` = tasks, `g h` = harvest, etc.)
- `n` — new (context-aware)
- `?` — show shortcut sheet

### 13.4 Tables

Sortable headers, sticky first column and header row, inline edit on double-click, multi-row selection with bulk actions toolbar. Tabular numerals always.

### 13.5 Breakpoints

| Name | Min width | Behavior |
|---|---|---|
| `sm` | 640px | Mobile patterns, single column |
| `md` | 768px | 2-column grids, persistent top bar |
| `lg` | 1024px | Sidebar appears (collapsed), full grid |
| `xl` | 1280px | Sidebar expanded by default |
| `2xl` | 1536px | Max container reached, centered |

---

## 14. Mobile app specifics

### 14.1 Outdoor visibility

- Minimum body text contrast: **AA Large** (3:1) for body, **AAA** (7:1) for critical labels (stem counts, due times)
- Avoid `--blue-300` and `--blue-100` as foregrounds against white — they wash out in sun
- High-contrast mode toggle in settings forces `--neutral-900` on `--neutral-0` everywhere, drops shadows, raises border weight to 2px

### 14.2 Touch & glove

- 44×44 minimum hit target, 48×48 preferred
- Primary actions sized 56×56 on critical paths (harvest log, task complete)
- Avoid swipe-only actions for destructive flows — always provide an explicit button alternative
- Buttons separated by at least 8px (preferably 12) to avoid mistapped neighbors

### 14.3 Input alternatives

- Camera capture on every form that accepts notes
- Voice memo capture on task notes, pest reports, quality issues
- Barcode/QR scan for bed and order identification
- Numeric steppers wherever possible — typing is the last resort

### 14.4 Offline

The app must work for an entire shift without connectivity. Strategy:

1. Today's tasks, beds, and crew are cached on login
2. Harvest entries, task updates, and photos queue locally
3. A persistent banner shows sync state: "All synced" / "3 entries pending" / "Offline — working from cache"
4. Conflict resolution: server wins on assignments, client wins on harvest counts (worker on the ground is the source of truth)

### 14.5 Performance budgets

- Cold start to interactive: under 2s on a mid-range Android (Pixel 6a class)
- Harvest log open to ready-for-entry: under 400ms
- Photos compressed to 1600px long edge before queueing

---

## 15. Dark mode

Both surfaces support dark mode. It is not a recolored light mode — saturation is lowered on accents to prevent retina burn, and the neutral scale is custom-built (see §4.2), not inverted.

- Page background: `--neutral-0` (`#0A0F2C`) — a near-black with a faint blue cast that ties to `--blue-900`
- Cards: `--neutral-100` (`#161D40`)
- Borders: `--neutral-200` (`#1F2750`)
- Primary action: `--blue-500` (lifted from 700 — 700 sits too dark on dark surfaces)
- Shadows: replaced with 1px highlight border on top edge for separation

Charts in dark mode: same series colors but at 90% brightness; gridlines drop to 10% opacity white.

System preference is respected on first launch; an explicit toggle in settings overrides. Mobile additionally exposes "auto by time" — switches at sunrise/sunset based on device location.

---

## 16. Accessibility

Non-negotiable, not a phase-2 item.

- **Contrast:** all body text and UI controls meet WCAG 2.1 AA. Critical numerics meet AAA.
- **Focus:** visible focus ring on every interactive element, never removed
- **Keyboard:** full keyboard operability on web, including drag-and-drop alternatives
- **Screen reader:** semantic HTML on web, accessibility labels on every interactive element on mobile. Charts include a `aria-describedby` summary and a "view as table" toggle.
- **Touch targets:** 44×44 minimum
- **Language:** the app ships in English and Spanish at launch — a large share of US flower farm crews are Spanish-speaking. Strings are externalized from day one. No baked-in copy in components.
- **Reduced motion** and **high contrast** modes both supported

---

## 17. Voice & microcopy

A small dictionary that keeps the product sounding like one product.

| Avoid | Prefer |
|---|---|
| Are you sure? | Confirm or undo? |
| Submit | Save / Log / Assign |
| Items | Use the actual noun: tasks, beds, harvests |
| User | Worker, crew member, manager — be specific |
| Awesome! | Done. |

**Empty states** lead with a fact and offer the next action:
> *No harvests logged yet today. **Log the first**.*

**Errors** state what happened, why if known, and what to try:
> *Couldn't sync 3 harvests — they're saved on this device. Try again when you have signal, or **retry now**.*

**Confirmations** use the worker's name and the noun:
> *Logged 240 stems for Maria.*

---

## 18. Token export

All tokens above are maintained in a single source-of-truth file (`tokens.json`, Style Dictionary format) and exported to:

- CSS custom properties (web)
- Tailwind config (web)
- Swift (iOS)
- Kotlin (Android)
- Figma variables (design)

Anything not in the token file is not in the system. If you find yourself reaching for a one-off color or spacing value, that's a signal to either expand the system or rework the design.

---

## 19. What's intentionally not in this document

- Specific page layouts — those live in Figma; this doc defines the rules they follow
- Marketing site design — separate system, looser brand expression
- Print/export styling for reports — addendum, not core
- Notification copy library — owned by content design, references the voice rules in §17

---

*Living document. Last updated to match the Ocean Breeze palette and the dashboard reference layout. Open a design review request before adding components, tokens, or principles.*