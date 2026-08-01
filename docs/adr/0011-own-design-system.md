# ADR-0011 — Own design system on unstyled primitives

**Status:** Accepted
**Date:** 2026-07-27

## Context

The manifesto makes two demands that appear to conflict, and this record resolves them.

> *"CreatorHub must establish its own design language. Do not imitate existing software. Invent
> original layouts, navigation, workflows, interactions. Create software that people immediately
> recognize as CreatorHub."*

> *"Simplicity is not fewer features. Simplicity is lower cognitive effort. CreatorHub should always
> reduce thinking."*

Plus a third, non-negotiable: *"Accessibility is mandatory."*

Taken literally, originality-in-interaction defeats the other two. A novel select control raises
cognitive load, because the user arrives with no mental model and must learn ours. It also breaks
assistive technology, which depends on conventional semantics and keyboard contracts.

## The resolution

**Originality lives in the surface and the workflow. Convention governs the control.**

| Where we are original | Where we follow convention |
|---|---|
| Typography, colour, spacing, elevation | What a button, select, or checkbox *does* |
| Motion and transition language | Keyboard contracts (Tab, Escape, arrows, Enter) |
| Information architecture and layout | Focus management and focus order |
| **Workflow compression** — steps from nothing to a live paid product | ARIA roles, states, and properties |
| Empty, loading, and error state craft | Form labelling and error association |

CreatorHub should be recognisable in three seconds from its surface and its speed, while every
control behaves exactly as a user already expects. Workflow compression is where the real
originality lives and where it is most defensible: the competition is a five-tool setup process,
not a differently-shaped dropdown.

## Options considered

**Ship stock shadcn/ui.** Excellent components, superb developer experience, and the single fastest
path to a working dashboard.

Rejected, and this is the load-bearing rejection in this record. Stock shadcn is the house style of
a large share of 2025–26 SaaS products. Using it unmodified means CreatorHub looks like everything
else on day one, which violates the design directive outright — and the manifesto explicitly warns
against optimising for familiarity over originality. It is also the option a code generator would
pick by default, which is a reasonable signal that it is not the founding-team answer.

**A full component library (MUI, Mantine, Chakra).** Rejected for the same reason plus a harder one:
these ship an opinionated visual identity that is expensive to override, and fighting a theme system
costs more than building on unstyled primitives.

**Build every primitive from scratch, including behaviour.** Rejected. Accessible comboboxes, date
pickers, dialogs with correct focus trapping, and roving-tabindex menus are genuinely hard — years
of accumulated edge cases across browsers and screen readers. Reimplementing them would consume
budget that belongs to product work and would almost certainly produce worse accessibility, which
the manifesto forbids.

**Tailwind v4 + our own primitives on unstyled accessible behaviour.** Take the behaviour, own the
appearance.

## Decision

**`packages/ui`, built on Tailwind v4 tokens and headless accessible primitives (Radix UI), with
100% of visual design our own.** Structured in three layers:

1. **Tokens** — the only source of visual truth. Typography scale, spacing scale, colour (semantic,
   not literal — `surface-raised`, not `gray-100`), radius, elevation, motion durations and easings.
   Expressed as CSS custom properties so theming and dark mode are token swaps.
2. **Primitives** — Button, Input, Select, Dialog, Menu, Tabs, Table, Toast, Command palette.
   Behaviour and ARIA from Radix; every visual decision ours. **No component may reach for a raw
   colour or pixel value** — only tokens. Enforced by lint rule.
3. **Patterns** — composed, product-aware pieces: page shell, data table with empty/loading/error
   states, form layout, metric card, currency input. This is where the design language becomes
   visible.

### Rules

- **Tokens or nothing.** A raw hex value or arbitrary pixel spacing in a component fails lint.
  This is what stops the design system decaying into suggestions.
- **Every interactive primitive ships its states**: default, hover, focus-visible, active, disabled,
  loading, error. A component without all seven is incomplete.
- **Every data surface ships four states**: loading (skeleton, not spinner), empty (educational, per
  the manifesto), error (what happened / why / what next), populated.
- **Money has a dedicated primitive.** Currency display and input are never ad-hoc — a locale or
  rounding inconsistency in a money figure destroys trust faster than any visual flaw.
- **Motion explains state, never decorates.** Durations from the token scale; every transition maps
  to a state change. `prefers-reduced-motion` is honoured throughout, not retrofitted.
- **Dark mode is a first-class theme**, designed alongside light — not derived by inversion.
- **Accessibility is a merge gate.** Keyboard-only operability, visible focus, semantic HTML,
  4.5:1 text contrast, automated axe checks in CI, and screen-reader verification on the checkout
  and product-creation flows.

### On WCAG

We target WCAG 2.2 AA and will state that as our engineering standard. We will not claim
compliance: full validation requires manual testing with assistive technologies and expert
accessibility review, neither of which automated checks substitute for. The standard is what we
build to; certification is a separate exercise.

## Consequences

**Good**

- A genuinely distinct visual identity, which the manifesto requires.
- Accessible behaviour inherited from a maintained, battle-tested foundation.
- Token architecture makes theming, dark mode, and later per-creator storefront theming mechanical.
- Small shipped CSS; no unused theme engine.

**Bad, and accepted**

- Materially more design work than adopting a library. This is the cost of the directive, and it is
  front-loaded into slice 0.
- Radix is a dependency in the interaction layer. Contained: it provides behaviour only, so
  replacement is a primitive-layer change, not a product-wide one.
- Our own primitives will have bugs a mature library would not. Mitigated by building the
  primitive layer first, with its own test and accessibility suite, before any feature work.
- Design consistency requires enforcement. Hence the lint rules — good intentions do not survive a
  deadline.

## Revisit when

Never for the approach. The token scales and the primitive inventory will evolve continuously; the
architecture — our appearance on borrowed behaviour — is settled.
