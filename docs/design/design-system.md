# CreatorHub Design System

**Status:** Active — foundation specification
**Last updated:** 2026-07-27

Companion: [ADR-0011](../adr/0011-own-design-system.md) records why we build our own layer rather
than shipping a component library.

---

## 1. The design thesis

The manifesto asks for software that is *"elegant, calm, confident, professional, beautiful, fast,
reliable, minimal, timeless, original"* and that reduces cognitive effort rather than feature count.

Those pull against each other unless you decide where originality lives. Our decision:

> **The surface is unmistakably ours. The controls behave exactly as expected.**

A user should recognise CreatorHub in three seconds from its typography, colour, spacing, and pace —
and never once wonder how a control works. Originality in *what a button does* is a tax on the user.
Originality in *how the product feels and how few steps it takes* is the product.

### Where we are original

1. **Workflow compression.** The competition is a five-tool setup process. Our distinctive claim is
   the number of steps from nothing to a live paid product. That is a design problem, not just an
   engineering one.
2. **Calm as a visual strategy.** Most creator tools are loud — gradients, badges, confetti,
   celebration modals. Calm is the more original position in this market and the more credible one
   for software people trust with their income.
3. **Money as a first-class typographic subject.** Revenue figures are the most-looked-at content in
   the product. They get their own type treatment, alignment discipline, and precision rules.
4. **State craft.** Loading, empty, and error states are designed artefacts, not afterthoughts. The
   manifesto asks that empty states educate; that is a real design commitment.

### Anti-patterns we will not ship

Recorded explicitly because they are the defaults everything drifts toward:

- Purple-to-blue gradients on white or near-black
- Stock system font stacks (Inter, Roboto, system-ui) as the brand voice
- Decorative illustrations standing in for a designed empty state
- Confetti, celebration modals, gamification badges
- Sidebar chat panel as the AI surface
- Card grids where a table is the honest answer
- Spinners where a skeleton would set the right expectation
- Emoji as interface iconography

---

## 2. Tokens

Tokens are the **only** source of visual truth. A component that reaches for a raw hex value or an
arbitrary pixel spacing fails lint. This rule is what stops a design system decaying into a
suggestion.

Implemented as CSS custom properties so theming, dark mode, and later per-creator storefront themes
are token swaps rather than code changes.

### 2.1 Typography

Two families, chosen for contrast and neutrality of era rather than trend:

| Role | Family | Rationale |
|---|---|---|
| Display and headings | A humanist serif with real optical sizing | Serif in a SaaS dashboard reads as considered and editorial — distinctive without being loud |
| Body and UI | A neutral grotesque with excellent small-size legibility | Carries dense interface text without personality that competes |
| Numerals and code | A monospace with tabular figures | Money and identifiers must align vertically |

Specific typeface selection is a branding exercise pending brand lock (open item 4 in the milestone
scope). The *system* is defined now so screens are not blocked; substituting the family is a
one-token change.

**Scale** — a modular scale rather than arbitrary sizes, so hierarchy is systematic:

```
display-lg   48/52   serif    -0.02em
display      36/40   serif    -0.02em
title-lg     28/34   serif    -0.01em
title        22/28   serif    -0.01em
heading      18/26   sans     -0.005em
body-lg      16/26   sans      0
body         14/22   sans      0        ← interface default
caption      13/18   sans      0.005em
micro        11/16   sans      0.02em   uppercase, for labels only
numeric-lg   32/36   mono      tabular
numeric      15/20   mono      tabular
```

**Rules**

- One display or title per screen region. Competing headings destroy hierarchy.
- Body copy line length capped at ~72 characters.
- Never below 13px for real content. `micro` is for labels only.
- All money and all identifiers use tabular figures — a column of misaligned digits reads as
  imprecision, and imprecision about money reads as untrustworthy.

### 2.2 Spacing

A single 4px-based scale. No arbitrary values, ever.

```
0  4  8  12  16  20  24  32  40  48  64  80  96  128
```

Named semantically at the pattern layer so intent survives refactoring:
`space-inline-tight`, `space-stack-section`, `space-inset-card`.

**Whitespace is the primary tool.** The manifesto says whitespace is valuable; concretely, when a
screen feels cluttered the first move is to increase spacing and remove elements — never to shrink
type or tighten padding.

### 2.3 Colour

Semantic tokens only. A component never names a colour; it names a role. This is what makes dark
mode and storefront theming tractable.

```
surface-base        page background
surface-raised      cards, panels
surface-overlay     dialogs, popovers
surface-sunken      wells, code blocks, table headers

content-primary     body text
content-secondary   supporting text
content-tertiary    metadata, placeholders
content-inverse     on filled surfaces

border-subtle       hairlines, table rules
border-default      inputs, cards
border-strong       focus, emphasis

accent              primary action, brand presence
accent-hover
accent-subtle       tinted backgrounds

positive            revenue up, success, paid
caution             pending, hold, needs attention
critical            refunds, errors, destructive
info                neutral system messaging
```

**Palette direction:** a low-chroma warm-neutral foundation with a single confident accent. Not
cream-and-terracotta (the current AI house style), not purple gradients. Near-monochrome surfaces
with colour reserved for meaning — which makes the small amount of colour that appears actually
communicate something.

**Rules**

- Colour never carries meaning alone. Every status pairs colour with a label or icon — required for
  colour-blind users and for accessibility compliance.
- Semantic colours are reserved for their semantics. `positive` is not decorative.
- Contrast: text ≥ 4.5:1, UI components and graphics ≥ 3:1, in both themes. Verified, not assumed.

### 2.4 Radius, elevation, borders

```
radius-sm    4px    inputs, badges, small controls
radius-md    8px    cards, buttons
radius-lg    12px   panels, dialogs
radius-full  9999   avatars, pills
```

**Elevation is restrained on purpose.** Four levels, and shadows are soft and low-contrast:

```
elevation-0   flat — the default
elevation-1   raised card
elevation-2   dropdown, popover
elevation-3   dialog, command palette
```

Depth carries hierarchy, not decoration. If two surfaces don't need to be distinguished, they sit at
the same elevation. A borderless hairline (`border-subtle`) is usually the better answer than a
shadow.

### 2.5 Motion

```
duration-instant   80ms    state feedback (hover, press)
duration-fast      140ms   local transitions
duration-base      220ms   panels, dialogs, page regions
duration-slow      360ms   large or spatial transitions

ease-out           entering — decelerate
ease-in            exiting — accelerate
ease-in-out        moving between two on-screen states
ease-spring        a single deliberate accent, used sparingly
```

**Motion explains state. It never decorates.** Every transition maps to a state change: entering,
exiting, expanding, moving, loading. If you cannot name the state change, remove the animation.

`prefers-reduced-motion` collapses all motion to opacity changes at `duration-instant`. Designed in,
not retrofitted.

---

## 3. Interaction language

The consistent behavioural rules across the whole product.

**Focus.** Every interactive element has a visible `focus-visible` ring using `border-strong`, at
least 2px, with a 2px offset. Never removed, never made subtle. Dialogs trap focus and restore it on
close. Route changes move focus to the main heading.

**Keyboard.** Everything is reachable and operable by keyboard, using conventional contracts —
Tab/Shift-Tab, Escape to dismiss, arrows within composites, Enter to confirm, Space to toggle. The
command palette (`⌘K`) is the fast path for experienced users; it is never the *only* path.

**Feedback timing** — how long a user waits before the interface tells them something:

| Elapsed | Response |
|---|---|
| < 100ms | Nothing. It felt instant. |
| 100–300ms | Immediate local state change (button press, optimistic update) |
| 300ms–1s | Inline progress at the point of action |
| 1s–5s | Skeleton or progress in the affected region |
| > 5s | Explain what is happening and roughly how long |

**Optimistic updates** where the operation is safe to assume. **Never on money** — a payment,
refund, or payout shows real state only.

**Destructive actions** require explicit confirmation naming the specific consequence. Not
"Are you sure?" but "Refund £42.00 to alex@example.com? This revokes their access to Summer Guide."

**Errors are recoverable.** Every error state offers a next action — retry, edit, contact support.
A dead end is a design failure.

---

## 4. Component inventory

### Primitives (behaviour from Radix, appearance ours)

Button · IconButton · Input · Textarea · NumberInput · **MoneyInput** · Select · Combobox ·
MultiSelect · Checkbox · Radio · Switch · Slider · DatePicker · FileUpload · Dialog · Drawer ·
Popover · Tooltip · DropdownMenu · ContextMenu · Tabs · Accordion · Toast · Banner · Badge ·
Avatar · Skeleton · Spinner · Progress · Separator · ScrollArea · CommandPalette

Every interactive primitive ships seven states: **default, hover, focus-visible, active, disabled,
loading, error.** A primitive missing any of them is incomplete and does not merge.

### Patterns (composed, product-aware)

PageShell · PageHeader · SidebarNav · DataTable · EmptyState · ErrorState · FormLayout ·
FormField · MetricCard · **MoneyDisplay** · Chart · Timeline · StatusBadge · FilterBar ·
Pagination · UploadZone · ImagePicker · ColorPicker · ThemePreview · OnboardingStep ·
AIAssistField

### Money primitives get special treatment

`MoneyInput` and `MoneyDisplay` are non-negotiable and never bypassed:

- Tabular figures, right-aligned in tables, decimal-aligned in columns
- Locale-correct symbol placement and separators via `Intl.NumberFormat`
- Currency code shown wherever more than one currency can appear
- Negative amounts styled distinctly and consistently (refunds, clawbacks)
- Input never accepts a float; it parses to `bigint` minor units on change
- Zero rendered as `£0.00`, never as `—` or blank

A locale or rounding inconsistency in a revenue figure destroys trust faster than any visual flaw.
That is why this is a system primitive rather than a formatting helper.

### Data surfaces ship four states

Every table, list, chart, and metric implements all four. Enumerated in the
[Definition of Done](../engineering/definition-of-done.md).

1. **Loading** — skeleton matching the final layout. Not a spinner; a spinner tells the user nothing
   about what is arriving.
2. **Empty** — educational, per the manifesto. What belongs here, why it matters, and the single
   action to create the first one.
3. **Error** — what happened, why, what to do next.
4. **Populated** — the designed default.

---

## 5. Layout and responsive rules

**Grid.** 12 columns, fluid gutters from the spacing scale. Content max-width 1280px; long-form
reading regions capped at 720px.

**Breakpoints** — named for intent, not device:

```
compact     < 768px    single column, bottom navigation
regular     768–1279   two columns, collapsible navigation
wide        ≥ 1280     full layout, persistent navigation
```

**Dashboard shell.** Persistent left navigation on `wide`, collapsible on `regular`, bottom bar on
`compact`. Navigation reflects the creator's business domains, not our module structure.

**Storefront.** Content-first, server-rendered, minimal chrome. The creator's brand is the subject;
CreatorHub is invisible. Any CreatorHub presence on a storefront is a deliberate product decision
with the creator's consent, never a default watermark.

Mobile is not a reduced desktop. The creator's most common mobile actions — check revenue, view an
order, respond to a customer — are designed for mobile first.

---

## 6. Dark mode

A first-class theme, designed alongside light — not derived by inversion.

- Surfaces are true dark neutrals, not inverted greys. Pure black is avoided: it makes elevation
  impossible to read.
- Elevation is conveyed by *lightening* surfaces, since shadows barely register on dark.
- Accent and semantic colours are re-tuned per theme for contrast, not reused.
- Both themes verified against contrast requirements independently.
- Respects `prefers-color-scheme` with an explicit user override that persists.

---

## 7. Accessibility

Mandatory, per the manifesto. Full requirements in the
[Definition of Done](../engineering/definition-of-done.md).

We build to **WCAG 2.2 AA** as our engineering standard. We do not claim compliance: full validation
requires manual testing with assistive technologies and expert accessibility review, which automated
checks do not substitute for. Automated axe checks gate every PR; manual screen-reader verification
covers checkout and product creation before release.

---

## 8. AI surfaces

The manifesto: *"AI should never interrupt users. AI should never dominate the experience."*

Design consequences:

- **No chat panel.** AI appears inline where the user is already working, or not at all.
- **Always invited, never volunteered.** An AI affordance sits beside the field it helps with and
  does nothing until asked.
- **Output is a suggestion.** Generated text lands in an editable field. Nothing is committed on the
  user's behalf.
- **Labelled.** Generated content is visibly marked. Passing it off as the platform's own undermines
  the trust the design is meant to communicate.
- **Fails silently.** If the model is unavailable, the affordance disappears and the manual path
  remains. AI is never on the critical path of taking a payment.

---

## 9. Enforcement

| Rule | Mechanism |
|---|---|
| Tokens only, no raw values | ESLint rule, fails CI |
| Primitives only, no ad-hoc controls | Review, plus import restrictions |
| Four states on data surfaces | Review checklist |
| Seven states on interactive primitives | Component test suite |
| Contrast requirements | Automated axe, both themes |
| Reduced motion honoured | Automated check |

Consistency requires enforcement. Good intentions do not survive a deadline.

---

## 10. What comes next

This document is the foundation, not the finished design language. Before slice 4 (storefront) the
following are needed and are design work rather than engineering work:

1. Brand lock — name treatment, wordmark, typeface selection, accent colour
2. Full light and dark palettes with verified contrast ratios
3. High-fidelity designs for: dashboard home, product creation, checkout, order detail, affiliate
   dashboard
4. Storefront theme presets — curated sets, not a colour picker, so every creator storefront looks
   deliberate
5. Icon set decision — a single coherent family, drawn or licensed, never mixed

`/design-consultation` and `/design-shotgun` are the right tools for items 1–4 when the brand
inputs are ready.
