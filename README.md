# Brio UI

React components with motion and the awkward edge cases handled. Copy one file. Make it yours.

[![MIT license](https://img.shields.io/badge/license-MIT-c6533d)](LICENSE)
[![React 19](https://img.shields.io/badge/React-19-149eca)](https://react.dev/)
[![TypeScript source](https://img.shields.io/badge/source-TypeScript-3178c6)](https://github.com/brio-ui/brio-ui/tree/main/components)

| [Pricing Toggle](docs/pricing-toggle.md) | [Code Input](docs/code-input.md) | [FAQ](docs/faq.md) |
| --- | --- | --- |
| [![Pricing Toggle preview](assets/pricing-toggle.jpg)](components/pricing-toggle/pricing-toggle.tsx) | [![Code Input preview](assets/code-input.jpg)](components/code-input/code-input.tsx) | [![FAQ preview](assets/faq.jpg)](components/faq/faq.tsx) |
| [Source](components/pricing-toggle/pricing-toggle.tsx) · [Usage](docs/pricing-toggle.md#usage) | [Source](components/code-input/code-input.tsx) · [Usage](docs/code-input.md#usage) | [Source](components/faq/faq.tsx) · [Usage](docs/faq.md#usage) |

![Free component rollout: 3 of 10 released](assets/rollout.svg)

## Use it

In a React 19 project, copy a component from [components/](components) and install its dependency:

```bash
npm install motion
```

```tsx
import { Faq } from './components/faq'

<Faq items={[{ q: 'Can I change this?', a: 'Yes. The source is yours.' }]} />
```

TypeScript source. Styles included. No Tailwind or provider required.

Early release. These 3 components are [MIT licensed](LICENSE). Website docs and registry installs are rolling out; use the files here today.

[Brio UI](https://brioui.com/?utm_source=github&utm_medium=readme&utm_campaign=free-components) · [Report an issue](https://github.com/brio-ui/brio-ui/issues)
