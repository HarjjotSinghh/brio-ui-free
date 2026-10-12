---
title: Pricing Toggle
description: A monthly / yearly switch whose prices roll like an odometer and follow the thumb while you drag it.
slug: pricing-toggle
tier: free
category: Commerce
dependencies: [motion]
exports: [Billing, BillingSwitch, BillingPrice, BillingText, useBilling, BillingPeriod, BillingProps, BillingSwitchProps, BillingPriceProps, BillingTextProps]
---

# Pricing Toggle

A set of small pieces for pricing pages that share one billing period. `<Billing>` holds the period; `<BillingSwitch>` changes it; `<BillingPrice>` and `<BillingText>` show the value for it, anywhere inside the provider. Prices roll digit by digit. Drag the switch thumb halfway and every price sits halfway between monthly and yearly; let go and it snaps with your throw. Landing on yearly makes the savings badge peel up and settle, and each price shows the old monthly price struck through above it.

## Installation

### shadcn

```bash
npx shadcn@latest add https://brioui.com/r/pricing-toggle.json
```

### Manual

1. Copy `pricing-toggle.tsx` into your project, for example `components/brio/pricing-toggle.tsx`.
2. Install the peer dependency: `npm install motion`.
3. Requires React 19. The theme tokens (`--ui-*`) are optional; the component falls back to its own defaults.

## Usage

```tsx
import { Billing, BillingPrice, BillingSwitch } from '@/components/brio/pricing-toggle'

export function ProPlan() {
  return (
    <Billing>
      <BillingSwitch />
      <BillingPrice monthly={12} yearly={9.6} suffix="/mo" />
    </Billing>
  )
}
```

## Examples

### Pricing table

One switch drives every plan. `BillingText` swaps the billing note with a word-level morph. Size the price with `font-size` on its class; the suffix and old price scale from it.

```tsx
import { Billing, BillingPrice, BillingSwitch, BillingText } from '@/components/brio/pricing-toggle'

const plans = [
  { name: 'Pro', monthly: 12, yearly: 9.6, note: ['Billed monthly', 'Billed $115.20 once a year'] },
  { name: 'Team', monthly: 32, yearly: 25.6, note: ['Per seat, billed monthly', 'Per seat, billed $307.20 once a year'] },
] as const

export function Pricing() {
  return (
    <Billing defaultPeriod="yearly">
      <BillingSwitch badge="Save 20%" />
      {plans.map(plan => (
        <div key={plan.name}>
          <div>{plan.name}</div>
          <BillingPrice monthly={plan.monthly} yearly={plan.yearly} suffix="/mo" style={{ fontSize: 44 }} />
          <BillingText monthly={plan.note[0]} yearly={plan.note[1]} />
        </div>
      ))}
    </Billing>
  )
}
```

### Controlled, with a gated period

Pass `period` and `onChange`. The switch only moves to the period you hold, so if you keep the old value the thumb springs back.

```tsx
import { useState } from 'react'
import { Billing, BillingPrice, BillingSwitch, type BillingPeriod } from '@/components/brio/pricing-toggle'

export function GatedPricing({ yearlyAllowed }: { yearlyAllowed: boolean }) {
  const [period, setPeriod] = useState<BillingPeriod>('monthly')
  return (
    <Billing
      period={period}
      onChange={next => {
        if (next === 'yearly' && !yearlyAllowed) return // thumb snaps back to monthly
        setPeriod(next)
      }}
    >
      <BillingSwitch />
      <BillingPrice monthly={20} yearly={16} suffix="/mo" />
    </Billing>
  )
}
```

### Localised, with a custom control

Set `locale` and `currency` for a stable format (required for server rendering). `useBilling` reads and sets the period from any component inside `<Billing>`.

```tsx
import { Billing, BillingPrice, BillingSwitch, useBilling } from '@/components/brio/pricing-toggle'

function YearlyNudge() {
  const { period, setPeriod } = useBilling()
  if (period === 'yearly') return null
  return (
    <button type="button" onClick={() => setPeriod('yearly')}>
      Zwei Monate gratis mit Jahreszahlung
    </button>
  )
}

export function PreiseDe() {
  return (
    <Billing>
      <BillingSwitch labels={{ monthly: 'Monatlich', yearly: 'Jährlich' }} badge="−20 %" label="Abrechnungszeitraum" />
      <BillingPrice
        monthly={14.99}
        yearly={11.99}
        currency="EUR"
        locale="de-DE"
        suffix={{ monthly: '/ Monat', yearly: '/ Monat, jährlich' }}
      />
      <YearlyNudge />
    </Billing>
  )
}
```

## Props

### Billing

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `children` | `ReactNode` | required | Content that contains the switch, prices and text. Any other markup can sit in between. |
| `period` | `BillingPeriod` | none | Controlled period. When set, the thumb and prices follow only this value. |
| `defaultPeriod` | `BillingPeriod` | `'monthly'` | Starting period when uncontrolled. |
| `onChange` | `(period: BillingPeriod) => void` | none | Called when a click, key, drag or `setPeriod` asks for a different period than the current one. |

`Billing` renders no DOM. It is also the default export.

### BillingSwitch

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `labels` | `Record<BillingPeriod, string>` | `{ monthly: 'Monthly', yearly: 'Yearly' }` | Text of the two segments. Both keys are required when you pass it. |
| `badge` | `ReactNode` | `'Save 20%'` | Badge on the yearly segment. Pass `null` to hide it. At most 16em on one line; when the switch doesn't fit its container it wraps (see Layout notes) instead of cutting the badge. |
| `label` | `string` | `'Billing period'` | Accessible name of the radiogroup. |
| `className` | `string` | none | Extra class on the track `.bs-root`. |
| `style` | `CSSProperties` | none | Inline styles on the track. |

### BillingPrice

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `monthly` | `number` | required | Price shown on monthly. |
| `yearly` | `number` | required | Price shown on yearly, in the same unit as `monthly` (usually the per-month equivalent, e.g. `9.6` next to `12`). |
| `currency` | `string` | `'USD'` | ISO 4217 code passed to `Intl.NumberFormat`. An invalid code (or locale) falls back to a plain number with a dev warning instead of throwing. |
| `locale` | `string` | runtime locale | BCP 47 locale for formatting. Set it when rendering on the server, or the server and browser can format differently and hydration will mismatch. |
| `fractionDigits` | `number` | `0` if both prices are whole numbers, else `2` | Decimal places shown. |
| `suffix` | `string \| Record<BillingPeriod, string>` | none | Text after the price, e.g. `'/mo'`, or one per period. Morphs word by word when it changes. |
| `compare` | `boolean` | `true` | On yearly, show the monthly price struck through above the price. Only shown when `yearly < monthly`. When there is no room above the price (less than ~0.4em before the previous element), it sits beside the price instead so it never covers text. |
| `className` | `string` | none | Extra class on `.bp-root`. Set `font-size` here; the suffix (0.36em) and old price (0.32em) scale from it. |
| `style` | `CSSProperties` | none | Inline styles on `.bp-root`. |

### BillingText

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `monthly` | `string` | required | Text on monthly. |
| `yearly` | `string` | required | Text on yearly. Words shared with `monthly` glide into place; the rest roll. |
| `className` | `string` | none | Extra class on `.bt-root`. |
| `style` | `CSSProperties` | none | Inline styles on `.bt-root`. |

### useBilling

`useBilling(): { period: BillingPeriod; setPeriod: (period: BillingPeriod) => void }`

Reads the current period and requests a new one (same path as a click, so `onChange` fires and a controlled parent decides). Throws if called outside `<Billing>`. `BillingSwitch`, `BillingPrice` and `BillingText` throw the same way.

### BillingPeriod

`type BillingPeriod = 'monthly' | 'yearly'`

### Prop types

Each piece's props are exported as a named type (`BillingProps`, `BillingSwitchProps`, `BillingPriceProps`, `BillingTextProps`), for wrappers:

```tsx
import { BillingPrice, type BillingPriceProps } from '@/components/brio/pricing-toggle'

function PlanPrice(props: BillingPriceProps) {
  return <BillingPrice suffix="/mo" {...props} />
}
```

## Customisation

- **Theme tokens:** `--ui-ink` (text, track, lines), `--ui-surface` (thumb), `--ui-accent` (badge, strike line, focus ring). Corners: `--ui-radius-pill` (chips, switches, badges and round buttons).
- **Component CSS variables:** `--pricing-toggle-ink`, `--pricing-toggle-surface`, `--pricing-toggle-accent` override the matching `--ui-*` token for these pieces only. Defaults: `#17140f`, `#fbf8f1`, `#d4452b`. The switch also sets `--p` on `.bs-root` (0 = monthly, 1 = yearly, live during drags) that your own CSS inside the switch can read.
- **Class names:** each piece takes `className`. Stable classes: switch `.bs-root`, `.bs-thumb`, `.bs-seg` (with `[data-period="monthly" | "yearly"]`), `.bs-badge`, `.bs-badge-icon`, `.bs-sheen`; price `.bp-root`, `.bp-num`, `.bp-col` (one digit column), `.bp-strip`, `.bp-sym` (currency, separators), `.bp-suffix`, `.bp-was`, `.bp-strike`; text `.bt-root`, `.bt-line`, `.bt-word`, `.bt-ch`.
- **Worst case:** prices use the locale's own digits in the odometer (Arabic-Indic, Devanagari…), the number always reads left to right (also in RTL pages), a price wider than its container shrinks to fit (down to 45%), `NaN` / `Infinity` show as “—” (dev warning), suffixes and `BillingText` wrap (even an unbroken word), and letters in scripts that need shaping (Arabic, Devanagari…) animate as whole words.
- **Labels:** `labels`, `badge` and `label` on `BillingSwitch`; `suffix` on `BillingPrice`. The screen-reader phrase ", was <old price>" is fixed English.

## Responsive behaviour

- The switch is never wider than its container, and never cuts text. When the labels or the badge don't fit on one line (long translations, narrow columns), it switches to a wrapped layout: both segments share the full width, their labels break onto more lines, the badge sits under the yearly label, the corners tighten so tall segments don't turn into blobs, and the badge's peel becomes a small nudge (a tall badge flipping would cover the label). The root then carries `data-wrap`; it goes back to one line as soon as there's room.
- A shortened label or badge shows its full text on hover.
- On coarse pointers the segments are 44px tall.

## Keyboard

| Key | Action |
| --- | --- |
| `Tab` | Focus the selected segment (roving tabindex: the switch is one tab stop). |
| `ArrowRight` / `ArrowDown` | Select the next period and move focus to it; wraps from yearly back to monthly. |
| `ArrowLeft` / `ArrowUp` | Select the previous period and move focus to it; wraps from monthly to yearly. |
| `Home` | Select monthly. |
| `End` | Select yearly. |
| `Enter` / `Space` | Select the focused segment. |

Pointer: click a segment, or press anywhere on the track and drag more than 4 px to move the thumb. Release past halfway (or flick toward a side) to switch.

## Accessibility

- The switch is a `role="radiogroup"` labelled by `label`; each segment is a native `<button role="radio">` with `aria-checked`.
- The badge text is read as part of the yearly option (a hidden comma separates them).
- Each price has one visually hidden text with the final formatted value and suffix, plus ", was <monthly price>" when the comparison shows. The rolling digits are `aria-hidden`, so screen readers never hear intermediate values.
- `BillingText` exposes the final text once in a hidden span; the animated letters are `aria-hidden`.
- Reduced motion: the thumb and digits jump to their end state, the thumb does not stretch, the badge does not peel, and text crossfades instead of rolling.

## Agent prompt

```text
Add the Brio UI "Pricing Toggle" component to this project.
1. Run `npx shadcn@latest add https://brioui.com/r/pricing-toggle.json`.
2. Make sure `motion` is installed and React is 19 or newer.
3. Import `Billing`, `BillingSwitch`, `BillingPrice` and `BillingText` from the file the CLI created. Wrap the whole pricing section in <Billing>, put one <BillingSwitch /> in it, and a <BillingPrice monthly={…} yearly={…} suffix="/mo" /> per plan.
4. `yearly` is the price shown on yearly in the same unit as `monthly` (usually per month); if the app renders on the server, pass `locale` and `currency` to every BillingPrice.
Full docs: https://brioui.com/docs/components/pricing-toggle.md
```
