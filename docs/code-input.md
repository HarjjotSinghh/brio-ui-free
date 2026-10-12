---
title: Code Input
description: A one-time code field with underlined slots, a gliding caret, SMS autofill and paste support, and built-in checking, success and error states.
slug: code-input
tier: free
category: Forms
dependencies: [motion]
exports: [CodeInput, CodeInputProps, CodeInputHandle]
---

# Code Input

A verification code field for two-step sign in, email confirmation or phone checks. It is one real `<input>` drawn as underlined slots: a caret glides between slots, digits rise into place, and pasted or autofilled codes stream in one after another. When the last slot fills it calls `onComplete`; a line runs along the underlines while checking, joins into one line with a check on success, and drops the digits out right to left on failure.

## Installation

### shadcn

```bash
npx shadcn@latest add https://brioui.com/r/code-input.json
```

### Manual

1. Copy `code-input.tsx` into your project, for example `components/brio/code-input.tsx`.
2. Install the peer dependency: `npm install motion`.
3. Requires React 19. The theme tokens (`--ui-*`) are optional; the component falls back to its own defaults.

## Usage

```tsx
import { CodeInput } from '@/components/brio/code-input'

export function VerifyStep() {
  return (
    <CodeInput
      onComplete={async code => {
        const res = await fetch('/api/verify', { method: 'POST', body: JSON.stringify({ code }) })
        return res.ok
      }}
    />
  )
}
```

## Examples

### Resend with a cooldown

`onResend` adds a "Resend code" button. After each resend it is disabled for `resendAfter` seconds with a countdown. By default it is available straight away; pass `cooldownOnMount` when the code was sent just as the field appears, so the countdown also runs from mount. Resending clears the field. If `onResend` throws or rejects, the field shows "Couldn't send a new code. Try again." in the error colour, the cooldown is cancelled, and focus returns to the button so it can be retried.

```tsx
import { CodeInput } from '@/components/brio/code-input'

export function PhoneCheck({ phone }: { phone: string }) {
  return (
    <CodeInput
      autoFocus
      hint={`We texted a code to ${phone}`}
      onComplete={code => fetch(`/api/otp/verify?code=${code}`).then(r => r.ok)}
      onResend={async () => {
        const res = await fetch('/api/otp/send', { method: 'POST' })
        if (!res.ok) throw new Error('send failed') // shows the error and re-enables Resend
      }}
      resendAfter={60}
      cooldownOnMount
    />
  )
}
```

### Letters and digits

`pattern="alphanumeric"` accepts A–Z and 0–9 (letters are shown and passed to `onComplete` upper-case) and opens the text keyboard instead of the number pad.

```tsx
import { CodeInput } from '@/components/brio/code-input'

export function BackupCode({ redeem }: { redeem: (code: string) => Promise<boolean> }) {
  return <CodeInput pattern="alphanumeric" length={8} group={4} label="Backup code" hint="Use one of your saved backup codes" onComplete={redeem} />
}
```

### Masked, four digits, no grouping

A short PIN shown only as dots: the digits never appear on screen. `group={0}` spaces the slots evenly.

```tsx
import { CodeInput } from '@/components/brio/code-input'

export function PinEntry({ onUnlock }: { onUnlock: (pin: string) => Promise<boolean> }) {
  return <CodeInput length={4} group={0} mask label="PIN" hint="Enter your 4-digit PIN" onComplete={onUnlock} />
}
```

### Moving on after success, or starting over

The field stays read-only after a correct code. Run your next step from `onComplete`. To start over (a different email, a second factor), call `reset()` on the `ref`: it clears every slot and returns to idle, even after success or while a check is still running (that check's result is then ignored). The resend cooldown is kept. `reset()` does not move focus; call `focus()` too when the user asked for it. Remounting with a new `key` also works and additionally restarts the cooldown.

```tsx
import { useRef } from 'react'
import { CodeInput, type CodeInputHandle } from '@/components/brio/code-input'

type Props = {
  verify: (code: string) => Promise<boolean>
  onVerified: () => void
}

export function EmailConfirm({ verify, onVerified }: Props) {
  const field = useRef<CodeInputHandle>(null)
  return (
    <>
      <CodeInput
        ref={field}
        onComplete={async code => {
          const ok = await verify(code)
          if (ok) setTimeout(onVerified, 900) // let the success line and check play first
          return ok
        }}
      />
      <button
        type="button"
        onClick={() => {
          field.current?.reset()
          field.current?.focus()
        }}
      >
        Use a different email
      </button>
    </>
  )
}
```

## Props

### CodeInput

| Prop | Type | Default | Description |
| --- | --- | --- | --- |
| `onComplete` | `(code: string) => boolean \| Promise<boolean>` | required | Called with the full code once every slot is filled. Return or resolve `true` to accept. `false` or a thrown error shows "That code didn't work. Try again.", shakes the field and clears it. |
| `length` | `number` | `6` | Number of slots (a whole number ≥ 1; anything lower falls back to 1 with a dev warning). Changing it clears the field. |
| `pattern` | `'numeric' \| 'alphanumeric'` | `'numeric'` | Characters a slot takes. `'numeric'`: 0–9, number pad. `'alphanumeric'`: A–Z and 0–9, text keyboard; letters are shown and passed upper-case. Other characters in typed or pasted text are dropped. Changing it clears the field. |
| `ref` | `Ref<CodeInputHandle>` | none | `{ reset(), focus() }`. See [CodeInputHandle](#codeinputhandle). |
| `label` | `string` | `'Verification code'` | Accessible label of the input. Visually hidden. |
| `hint` | `ReactNode` | `'Enter the code we sent you'` | Text under the slots when no status message is showing. Always the input's accessible description: a string or number through a visually hidden copy, any other node by pointing `aria-describedby` at the visible hint itself (never duplicated, so links inside stay single). Without a hint the description is "Enter the N-digit code we sent you" ("N-character" for `alphanumeric`). |
| `mask` | `boolean` | `false` | Show each entered digit as a dot. The digits never appear on screen. |
| `onResend` | `() => unknown` | none | Shows a "Resend code" button. Called on press; it clears the field and a returned promise is awaited (the button stays disabled meanwhile) before focus returns to the input. If it throws or rejects: "Couldn't send a new code. Try again." shows in the error colour, the cooldown is cancelled and focus goes to the button. |
| `resendAfter` | `number` | `30` | Seconds the resend button stays disabled after each resend. Shown as `Resend in m:ss` (`h:mm:ss` from an hour up). |
| `cooldownOnMount` | `boolean` | `false` | Also run the `resendAfter` cooldown from mount. Before this prop existed the cooldown always started on mount; pass it to keep that. |
| `group` | `number` | `3` | Slots per visual group; groups get a wider gap. `0` for no grouping (negative values are treated as `0`). |
| `autoFocus` | `boolean` | `false` | Focus the input on mount. |
| `className` | `string` | none | Extra class on the root `.ci-root`. |
| `style` | `CSSProperties` | none | Inline styles on the root. Use it to set the `--code-input-*` variables. |
| `labels` | `Partial<CodeInputLabels>` | English | Replace any UI string: `prompt`, `checking`, `accepted`, `rejected`, `sent`, `sendFailed`, `resend` and `resendIn(time)`. Pass only the ones you change. |

`CodeInput` is also the default export. There is no controlled `value` prop: the component owns its state; use the `ref` handle to reset it.

### CodeInputHandle

| Method | Description |
| --- | --- |
| `reset()` | Clear every slot and return to idle, including after success or while a check is running (its result is ignored). Keeps the resend cooldown. Does not move focus. |
| `focus()` | Focus the input. |

## Customisation

- **Theme tokens:** `--ui-ink` (digits, underlines, running line), `--ui-accent` (caret, error underlines and message, focus ring), `--ui-ok` (success line, check and message). Corners: `--ui-radius-sm` (buttons, fields, rows and tags, scaled from it).
- **Component CSS variables:** `--code-input-ink`, `--code-input-accent`, `--code-input-ok` override the matching `--ui-*` token for this component only. Defaults: `#17140f`, `#d4452b`, `#3f8f55`.
- **Narrow containers:** the slots are 40 px apart at full size. When the container is narrower than the field, every slot, gap and digit scales down together (room for the success check is kept at the end), so long codes never overflow. The hint under the slots wraps; "Resend" moves to its own row only when it no longer fits beside it.
- **Class names:** `className` goes on `.ci-root`. Stable classes: `.ci-track` (the field's sizing box), `.ci-field`, `.ci-slot`, `.ci-glyph`, `.ci-digit`, `.ci-rule` (underline), `.ci-caret`, `.ci-run` (checking / success line), `.ci-check`, `.ci-foot`, `.ci-msg`, `.ci-resend`. State: `.ci-root[data-status="idle" | "checking" | "ok" | "error"]`, `.ci-slot[data-active]`, `.ci-slot[data-filled]`, `.ci-digit[data-dot]` for masked digits.
- **Labels:** `label` and `hint`, plus `labels` for every status message ("Checking…", "Code accepted", "That code didn't work. Try again.", "A new code is on its way.", "Couldn't send a new code. Try again.") and the resend button ("Resend code", "Resend in 0:25"). Example: `labels={{ checking: 'جارٍ التحقق…', accepted: 'تم قبول الرمز' }}`.
- **Right to left:** in RTL pages the slot row keeps left-to-right order and geometry (codes read left to right in every script), so the caret and the success check sit where they do in LTR; the message line and resend button follow the page.

## Responsive behaviour

- The slots never overflow their container. When the row plus the success check doesn't fit, every slot, gap and digit scales down together, so the check never lands on the last digit.
- The whole row is one input, so a tap anywhere on it focuses the code.
- Long codes (more than about 12 characters) get small on phones. Use `group` to split them, or keep codes short.
- On coarse pointers "Resend" gets a taller hit area without moving the row.

## Keyboard

| Key | Action |
| --- | --- |
| `0`–`9` (and `A`–`Z` with `pattern="alphanumeric"`) | Fill the current slot and move to the next. |
| `Backspace` | Clear the current slot, or step back and clear the previous one if the current slot is empty. |
| `Delete` | Clear the current slot without moving. |
| `ArrowLeft` / `ArrowRight` | Move the caret one slot. It cannot move past the first empty slot. |
| `⌘V` / `Ctrl+V` | Paste a code into the slots, starting at the first. Characters the `pattern` doesn't take are ignored. |
| `Tab` | Move to the "Resend code" button, when shown. |

Clicking a slot moves the caret there (any filled slot, or the first empty one).

## Accessibility

- One native `<input>` with `autocomplete="one-time-code"`, `inputMode="numeric"` (`"text"` with `autoCapitalize="characters"` for `alphanumeric`) and a visually hidden `<label>`. The slots are `aria-hidden` decoration.
- The input is described by the hint (`aria-describedby`), whether the hint is a string or any other node, and gets `aria-invalid` while an error shows.
- "Checking…", "Code accepted", the error message and a failed resend are announced through a polite live region.
- Digits are read from the input's value changes, not from key events, so on-screen keyboards, Android IMEs, voice input and SMS autofill all work.
- After success the input becomes read-only but keeps focus, so keyboard and screen reader users are not dropped to the page body. After an error the input is focused again once it has cleared.
- Reduced motion: digits and caret appear instantly, nothing glides, shakes or drops, and the caret does not blink.

## Agent prompt

```text
Add the Brio UI "Code Input" component to this project.
1. Run `npx shadcn@latest add https://brioui.com/r/code-input.json`.
2. Make sure `motion` is installed and React is 19 or newer.
3. Import `CodeInput` from the file the CLI created and render it with `onComplete={code => verify(code)}`, where `verify` returns boolean or Promise<boolean>.
4. Pass `onResend` to call the send-code endpoint (throw on failure; add `cooldownOnMount` if the code was just sent), and navigate to the next step from inside `onComplete` when it succeeds (the field stays read-only after success; call `ref.current.reset()` to start over). Use `pattern="alphanumeric"` for codes with letters.
Full docs: https://brioui.com/docs/components/code-input.md
```
