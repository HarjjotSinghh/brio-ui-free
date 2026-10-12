---
title: FAQ
description: An FAQ accordion with deep links, browser find-in-page that opens closed answers, optional search, and FAQPage structured data.
slug: faq
tier: free
category: Text
dependencies: [motion]
exports: [Faq, FaqItem, FaqProps]
---

# FAQ

A list of questions that open into answers. Every answer has a link: opening one updates the URL hash, and loading that URL opens the answer and scrolls to it. Give items an `id` for links that never change (see [Anchor ids](#anchor-ids)). Closed answers stay searchable with the browser's find (⌘F / Ctrl+F), and an optional search field filters and highlights as you type. Answers open on a spring-like curve with an accent line drawn down their edge, and when the answer above the one you clicked closes, it closes in place: the page does not scroll. Only the part of it that is scrolled out of view above the screen is made up by scrolling, so nothing on screen jumps.

## Installation

### shadcn

```bash
npx shadcn@latest add https://brioui.com/r/faq.json
```

### Manual

1. Copy `faq.tsx` into your project, for example `components/brio/faq.tsx`.
2. Install the peer dependency: `npm install motion`.
3. Requires React 19. The theme tokens (`--ui-*`) are optional; the component falls back to its own defaults.

## Usage

```tsx
import { Faq } from '@/components/brio/faq'

export function PricingFaq() {
  return (
    <Faq
      items={[
        { q: 'Can I try it before paying?', a: 'Yes. Every plan starts with a 14-day trial, no card needed.' },
        { q: 'How do refunds work?', a: 'Email us within 30 days of any charge and we refund it in full.' },
      ]}
    />
  )
}
```

## Examples

### Search with a contact fallback

Adds a search field. When nothing matches, the empty message links to `contactHref`. The link only renders for `http(s):`, `mailto:`, `tel:` and relative URLs; `javascript:`, `data:`, protocol-relative `//host` and other schemes hide it, so the value can safely come from a CMS.

```tsx
import { Faq, type FaqItem } from '@/components/brio/faq'

const items: FaqItem[] = [
  { q: 'Can I change plans later?', a: 'Any time. Upgrades apply immediately and are prorated to the day.' },
  { q: 'Where is my data stored?', a: 'In the EU (Frankfurt) by default, with a US region available on Team.' },
  { q: 'Can I export everything if I leave?', a: 'One click exports all projects as plain files and JSON.' },
]

export function SupportFaq() {
  return (
    <Faq
      items={items}
      searchable
      searchPlaceholder="Search the help centre"
      contactHref="/contact"
      contactLabel="Ask support"
    />
  )
}
```

### Rich answers with plain text for search and SEO

When `a` is JSX, pass `text` too. Without it the answer is left out of search matching and out of the JSON-LD, and in development the console warns once, listing the questions that need `text` (only when `searchable` or `schema` is on).

```tsx
import { Faq, type FaqItem } from '@/components/brio/faq'

const items: FaqItem[] = [
  {
    id: 'refunds',
    q: 'How do refunds work?',
    a: (
      <p>
        Email <a href="mailto:billing@example.com">billing@example.com</a> within 30 days of any charge.
      </p>
    ),
    text: 'Email billing@example.com within 30 days of any charge.',
  },
  { id: 'trial', q: 'Is there a free trial?', a: 'Yes, 14 days on every plan.' },
]

export function BillingFaq() {
  return <Faq items={items} defaultOpen={['refunds']} headingLevel={2} />
}
```

### Several open at once, no URL changes

`type="multiple"` lets any number of answers stay open. `hashLinks={false}` stops the component from reading or writing the URL hash, which suits pages that use the hash for routing. It also hides "Copy link", since a copied link couldn't open the answer.

```tsx
import { Faq, type FaqItem } from '@/components/brio/faq'

export function DocsFaq({ items }: { items: FaqItem[] }) {
  return <Faq items={items} type="multiple" hashLinks={false} schema={false} />
}
```

### Anchor ids

Each question's heading carries a DOM id, which is also what the URL hash and "Copy link" use.

- **Your `id`:** used exactly as given (`id: 'refunds'` → `#refunds`). This is the stable way to link to an answer from emails, docs or other pages. Keep it unique on the page.
- **No `id`:** the question is slugged (`faq-how-do-refunds-work`) and, in the DOM and URL, scoped to this FAQ instance with a `useId` prefix (`#faq-r1-how-do-refunds-work`), so two FAQs with the same question never share an id. The prefix depends on where the FAQ sits in the React tree, so set `id` for links you share. A hash with the plain slug (`#faq-how-do-refunds-work`) still opens the answer, and `defaultOpen` takes the plain slug.

## Props

### Faq

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `items` | `FaqItem[]` | required | The questions, in display order. Items whose `q` or `a` is blank (empty or whitespace) are left out, with a dev-only console warning. An empty list renders nothing, not even the search field. |
| `type` | `'single' \| 'multiple'` | `'single'` | One answer open at a time, or any number. |
| `defaultOpen` | `string[]` | `[]` | Ids open on first render. Use each item's `id`, or its generated `faq-…` slug. With `type="single"` only the first id is used. Read once, on mount. |
| `searchable` | `boolean` | `false` | Show a search field that filters by question and plain-text answer, and highlights matches in both, including text inside elements in an answer (paragraphs, lists, links). |
| `searchPlaceholder` | `string` | `'Search questions'` | Placeholder and accessible label of the search field. |
| `searchShortcut` | `boolean` | `true` | With `searchable`: ⌘F (Ctrl+F) and `/` jump to the search field while the FAQ is on screen. ⌘F again from inside the field opens the browser's find. A small ⌘F hint shows in the empty field on pointer devices. |
| `clearLabel` | `string` | `'Clear search'` | Accessible name of the ✕ button that clears the search. |
| `schema` | `boolean` | `true` | Render a `<script type="application/ld+json">` with FAQPage data. Items with no plain-text answer are skipped. |
| `hashLinks` | `boolean` | `true` | Write `#<id>` to the URL when an answer opens (cleared when it closes), and open the matching answer on load and on `hashchange`. Uses `history.replaceState`, so it adds no history entries. `false` also hides "Copy link". |
| `headingLevel` | `2 \| 3 \| 4 \| 5 \| 6` | `3` | Heading element that wraps each question button. |
| `contactHref` | `string` | none | Link shown after "No questions match" when a search finds nothing. Allow-listed: `http(s):`, `mailto:`, `tel:` and relative URLs render; anything else (`javascript:`, `data:`, `//host`) hides the link. |
| `contactLabel` | `string` | `'Ask us instead'` | Text of the `contactHref` link. |
| `className` | `string` | none | Extra class on the root `.fq-root`. |
| `style` | `CSSProperties` | none | Inline styles on the root. Use it to set the `--faq-*` variables. |

`Faq` is also the default export.

### FaqItem

| Field | Type | Default | Description |
| --- | --- | --- | --- |
| `q` | `string` | required | The question. |
| `a` | `ReactNode` | required | The answer. A string or any React content. |
| `id` | `string` | `faq-` + slug of `q` | Anchor id for deep links and `defaultOpen`. Your `id` is the heading's DOM id and URL hash as-is; a generated slug is scoped per instance in the DOM and URL (see [Anchor ids](#anchor-ids)). The slug is lowercase, accent-free, dash-separated and at most 64 characters after the prefix; a question with no Latin letters or digits to slug (emoji only, for example) gets `faq-question-<position>`. Duplicate ids get `-2`, `-3`… appended. |
| `icon` | `ReactNode` | none | Small decorative icon before the question (16px). |
| `text` | `string` | `a` when it is a string, else `''` | Plain-text answer used for search and JSON-LD. Set it whenever `a` is not a string: otherwise the answer is not searchable, is left out of the JSON-LD, and a dev-only console warning names it. |

## Customisation

- **Theme tokens:** `--ui-ink` (text, lines, icons), `--ui-surface` (search field background), `--ui-accent` (open line, focus ring, search highlight). Corners: `--ui-radius` (surfaces and inner cards, scaled from it), `--ui-radius-sm` (buttons, fields, rows and tags, scaled from it).
- **Component CSS variables:** `--faq-ink`, `--faq-surface`, `--faq-accent` override the matching `--ui-*` token for this component only. Defaults: `#17140f`, `#fbf8f1`, `#d4452b`. `--faq-radius` sets the corner of the search field; the other corners scale from it.
- **Class names:** `className` goes on `.fq-root`. Stable classes: `.fq-search`, `.fq-count`, `.fq-list`, `.fq-item`, `.fq-bar` (accent line), `.fq-h` (heading), `.fq-q` (question button), `.fq-q-text`, `.fq-icon`, `.fq-panel`, `.fq-a`, `.fq-a-body`, `.fq-link` ("Copy link"), `.fq-mark` (search highlight), `.fq-empty`. State: `.fq-root[data-any-open]` when any answer is open, `.fq-item[data-open]` on open items.
- **Labels:** `searchPlaceholder` and `contactLabel`. The strings "Copy link", "Link copied", "No questions match", "match" / "matches" and "question" / "questions" are fixed English (singular for 1).
- **Long content:** long unbroken strings (URLs, emails, compounds) wrap inside questions and answers; inline `<code>` breaks too, and a `<pre>` block scrolls sideways. Questions and answers get `dir="auto"`, so right-to-left text aligns and punctuates correctly inside a left-to-right list.

## Responsive behaviour

- Questions and answers are capped at 70 characters per line on wide screens (`--faq-measure`).
- In columns under 480px, code blocks in answers wrap instead of scrolling sideways; under 340px the question count hides so the search field has room.

## Keyboard

| Key | Action |
| --- | --- |
| `Tab` | Move between the search field, question buttons and the "Copy link" button of open answers (when `hashLinks` is on). |
| `Enter` / `Space` | Open or close the focused question. |
| `ArrowDown` / `ArrowUp` | Move focus to the next / previous visible question. |
| `Home` / `End` | Move focus to the first / last visible question. |
| `⌘F` / `Ctrl+F`, `/` | With `searchable` (and `searchShortcut`): focus the search field while the FAQ is on screen. |
| `⌘F` / `Ctrl+F` in the field, or without search | Browser find, which also searches closed answers and opens the one that matches (in browsers that support `hidden="until-found"`). |
| `Escape` in the field | Clear the search. |

## Accessibility

- Each question is a native `<button>` inside a real heading (`h2`–`h6`, set by `headingLevel`), with `aria-expanded` and `aria-controls`.
- Each answer is a `role="region"` labelled by its question. Closed answers get `hidden="until-found"`, so they are out of the accessibility tree but still findable by the browser and crawlers.
- The "Copy link" button is removed from the tab order while its answer is closed, and not rendered with `hashLinks={false}`. Its label switches to "Link copied" through a polite live region.
- The search field has a visually hidden `<label>`. The match count is announced through a polite live region 350 ms after typing stops.
- Reduced motion: panels open and close instantly, rows fade instead of collapsing, the highlight sweep is disabled, and hash scrolling jumps instead of smooth-scrolling.

## Agent prompt

```text
Add the Brio UI "FAQ" component to this project.
1. Run `npx shadcn@latest add https://brioui.com/r/faq.json`.
2. Make sure `motion` is installed and React is 19 or newer.
3. Import `Faq` from the file the CLI created and render it with `items` ({ q, a, id?, text? }[]); add `searchable` for a search field.
4. When an answer is JSX, also pass its plain `text` so search and the FAQPage JSON-LD include it; set `hashLinks={false}` if the app uses the URL hash for routing.
Full docs: https://brioui.com/docs/components/faq.md
```
