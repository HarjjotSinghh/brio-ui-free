# Contributing to Brio UI

Thanks for looking. This repo holds the free, MIT-licensed Brio UI components as plain source files. It is a published copy: the components are developed in a private repo and released here, so a pull request is not merged here directly. Issues are the fastest way to get something fixed.

## Report a bug

Open an issue with the [bug template](https://github.com/brio-ui/brio-ui/issues/new?template=bug_report.yml). Include:

- the component and the version of React and `motion` you use
- your framework (Next.js, Vite, React Router, Astro or other)
- the smallest code that shows the problem, and what you expected
- the browser and whether the problem happens with reduced motion on

A bug that only shows with a narrow screen, a long string, a right-to-left language or keyboard use is exactly the kind we want to hear about.

## Ask for a component or a change

Use the [feature template](https://github.com/brio-ui/brio-ui/issues/new?template=feature_request.yml). Say what you are building and where the current components fall short. Brio UI ships composed patterns (a password field, an FAQ, a pricing toggle), not base primitives like buttons or dialogs.

## Send a fix

Small fixes to the components in `components/` are welcome as a pull request. We read it, apply the change in the private repo and credit you in the release notes. Keep the change to one file and one problem, and check it with:

- React 19 and `motion` as the only imports
- light and dark themes
- `prefers-reduced-motion` on
- keyboard-only use, and a screen reader if you can

Each component stays a single copy-pasteable file. Do not add dependencies beyond `react`, `react-dom` and `motion`.

## Security

Do not open a public issue for a security problem. Email hello@brioui.com.

## Conduct

Everyone taking part follows the [code of conduct](https://github.com/brio-ui/brio-ui/blob/main/CODE_OF_CONDUCT.md).
