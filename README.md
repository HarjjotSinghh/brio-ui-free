# Brio UI: free components

React components for the everyday parts of a website, each tested against the data that usually breaks them: long German words, Arabic right to left, odd numbers, empty and broken values, 320 px screens and reduced motion.

Every component is one file that imports only `react`, `react-dom` and `motion`. No Tailwind, no provider, no config. Copy it into your project and it's yours.

These are the free components released so far, under the MIT license. More follow every two days until the full Brio UI launch in November 2026.

## Components

| Component | What it does | Docs and live demo |
| --- | --- | --- |
| [Pricing Toggle](components/pricing-toggle/pricing-toggle.tsx) | Monthly / yearly switch with odometer prices. Drag halfway and prices sit halfway; land on yearly and the badge peels, the old price strikes through. | [brioui.com/docs/components/pricing-toggle](https://brioui.com/docs/components/pricing-toggle?utm_source=github&utm_medium=readme&utm_campaign=free-components) |
| [Code Input](components/code-input/code-input.tsx) | A calm code field with a caret that glides between underlined slots. Digits rise into place, pasted codes stream in, a line runs while checking, and on success the underlines join into one with a check. Optional masking. | [brioui.com/docs/components/code-input](https://brioui.com/docs/components/code-input?utm_source=github&utm_medium=readme&utm_campaign=free-components) |
| [FAQ](components/faq/faq.tsx) | Accordion with deep links, ⌘F that finds text in closed answers, optional search with highlights, and FAQPage structured data for Google. | [brioui.com/docs/components/faq](https://brioui.com/docs/components/faq?utm_source=github&utm_medium=readme&utm_campaign=free-components) |

## Install

With the shadcn CLI, from the Brio UI registry:

```bash
npx shadcn@latest add https://brioui.com/r/pricing-toggle.json
npx shadcn@latest add https://brioui.com/r/code-input.json
npx shadcn@latest add https://brioui.com/r/faq.json
```

Or add the `@brio` namespace to your `components.json` once:

```json
{
  "registries": {
    "@brio": "https://brioui.com/r/{name}.json"
  }
}
```

and then run `npx shadcn@latest add @brio/pricing-toggle`.

Or copy the file from `components/` and run `npm install motion`. Requires React 19.

Each component's docs (props, usage, keyboard and accessibility notes, an agent prompt) are in `docs/` and on the site. Every docs page has a Markdown twin for coding agents: add `.md` to its URL.

## The full library

Brio UI launches in November 2026 with 50 components: 10 free under MIT and 40 Pro. Founding members, who join the waitlist before launch, get 50% off Pro for life.

[Join the waitlist](https://brioui.com/?utm_source=github&utm_medium=readme&utm_campaign=free-components)

## License

MIT. See [LICENSE](LICENSE).
