'use client'
/*
 * Reduced-motion preference, hydration-safe: the server and the hydrating render both read
 * `false`, then React re-renders with the real value, so server HTML and the first client
 * render always agree.
 */
const REDUCED_QUERY = '(prefers-reduced-motion: reduce)'
function subscribeReduced(onChange: () => void) {
  const mq = window.matchMedia(REDUCED_QUERY)
  mq.addEventListener('change', onChange)
  return () => mq.removeEventListener('change', onChange)
}
const getReduced = () => window.matchMedia(REDUCED_QUERY).matches
const getServerReduced = () => false

/**
 * Code Input — a verification code field that stays calm and still feels alive.
 *
 * Six thin underlines on one baseline. A single caret glides from slot to slot
 * on a spring; each digit rises into place from behind the line. Paste a code
 * (or let the phone autofill it) and the digits stream in one after another.
 * While the code is checked a line runs along the underlines; when it's
 * accepted the six underlines join into one and a check draws itself at the
 * end. A wrong code drops the digits out, right to left, and starts over.
 *
 * Functional:
 *   - one real input: autocomplete="one-time-code" (SMS autofill), paste
 *     anywhere, numeric keyboard, ← → to move, Backspace to go back, click a slot
 *   - `pattern="alphanumeric"` accepts letters too (shown upper-case)
 *   - digits are read from the input's own value changes, so on-screen
 *     keyboards, Android IMEs and voice input work, not just hardware keys
 *   - onComplete(code) → boolean | Promise<boolean>; auto-submits when full
 *   - `mask` shows every entered digit as a dot, never the digit itself
 *   - resend with a cooldown (after each resend; from mount with
 *     `cooldownOnMount`); a rejected `onResend` shows an error and re-enables it
 *   - `ref` exposes { reset(), focus() } to start over (e.g. after success)
 *   - any length, grouped visually (e.g. 3 · 3); in a container narrower than
 *     the field, slots, gaps and digits scale down together so it never overflows
 *
 * Accessible: a single labelled input described by its hint (string or
 * ReactNode); the slots are decorative;
 * checking, success and failure are announced. Reduced motion: digits and
 * caret simply appear, nothing glides or drops.
 *
 * Corners follow --ui-radius-sm (see Theming → Corners).
 * Theme via library tokens (--ui-ink, --ui-surface, --ui-accent) or
 * --code-input-*.
 *
 * Requires: react >= 19, motion >= 11.
 */
import { AnimatePresence, animate, motion, useMotionValue } from 'motion/react'
import {
  createElement,
  useEffect,
  useId,
  useImperativeHandle,
  useRef,
  useState,
  useSyncExternalStore,
  type ChangeEvent,
  type ClipboardEvent,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
  type Ref,
} from 'react'

/* Icons: Iconoir (MIT, © 2021 Luca Burgio, iconoir.com), inlined so the component stays dependency-free. */
const UI_ICONS = {
  'refresh': [['path', { d: 'M21.8883 13.5C21.1645 18.3113 17.013 22 12 22C6.47715 22 2 17.5228 2 12C2 6.47715 6.47715 2 12 2C16.1006 2 19.6248 4.46819 21.1679 8' }], ['path', { d: 'M17 8H21.4C21.7314 8 22 7.73137 22 7.4V3' }]],
} as const satisfies Record<string, readonly (readonly [string, Record<string, string>])[]>

type UiIconName = keyof typeof UI_ICONS

function UiIcon({ name, size = 16, className }: { name: UiIconName; size?: number; className?: string }) {
  return (
    <svg className={['ui-icon', className].filter(Boolean).join(' ')} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {UI_ICONS[name].map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  )
}

/** Imperative handle, from `ref` on {@link CodeInput}. */
export type CodeInputHandle = {
  /** Clear every slot and go back to idle (also after success or mid-check; a pending check's result is ignored). Keeps the resend cooldown. Does not move focus. */
  reset: () => void
  /** Focus the input. */
  focus: () => void
}

/** Props for {@link CodeInput}. */
export type CodeInputProps = {
  /**
   * Number of slots, a whole number ≥ 1 (lower values fall back to 1 with a
   * dev warning). Changing it clears the field.
   * @default 6
   */
  length?: number
  /**
   * Which characters a slot takes. `'numeric'`: digits 0–9 (numeric keyboard).
   * `'alphanumeric'`: A–Z and 0–9, letters shown and passed upper-case (text
   * keyboard). Anything else in typed or pasted text is dropped. Changing it clears the field.
   * @default 'numeric'
   */
  pattern?: 'numeric' | 'alphanumeric'
  /** `{ reset(), focus() }`: start over after success, or focus from outside. */
  ref?: Ref<CodeInputHandle>
  /**
   * Called with the full code once every slot is filled. Return (or resolve)
   * `true` if the code is right; `false` or a throw shakes the field and clears it.
   */
  onComplete: (code: string) => boolean | Promise<boolean>
  /**
   * Accessible label of the input (visually hidden).
   * @default 'Verification code'
   */
  label?: string
  /**
   * Helper text under the slots while no status message is showing. Falls back
   * to "Enter the code we sent you". Always the input's accessible description:
   * a string (or number) through a hidden copy, any other node by pointing
   * `aria-describedby` at the visible hint itself.
   */
  hint?: ReactNode
  /**
   * Show every entered digit as a dot; the digits never appear on screen.
   * @default false
   */
  mask?: boolean
  /**
   * Shows a "Resend code" button when set. Called when it is pressed; may return
   * a promise. If it throws or rejects, the field says so, the cooldown is
   * cancelled so it can be retried, and focus goes back to the button.
   */
  onResend?: () => unknown
  /**
   * Seconds "Resend" stays disabled after each resend.
   * @default 30
   */
  resendAfter?: number
  /**
   * Also run the `resendAfter` cooldown from mount (the code was just sent when
   * the field appears). Off by default: "Resend code" is available straight away.
   * @default false
   */
  cooldownOnMount?: boolean
  /**
   * Visual grouping, e.g. 3 → 123 · 456. 0 (or a negative number) for none.
   * @default 3
   */
  group?: number
  /**
   * Focus the input on mount.
   * @default false
   */
  autoFocus?: boolean
  /** Extra class on the root (`.ci-root`). */
  className?: string
  /** Inline styles on the root, for example `--code-input-accent`. */
  /** Replace any UI string (status messages, the resend button). See `CodeInputLabels`. */
  labels?: Partial<CodeInputLabels>
  style?: CSSProperties
}

/** Every UI string. Pass any subset through `labels` to translate or reword. The field's own label is the `label` prop. */
export type CodeInputLabels = {
  /** Under the field before anything is typed, when there's no `hint`. */
  prompt: string
  /** While `onComplete` runs. */
  checking: string
  /** After `onComplete` resolves true. */
  accepted: string
  /** After `onComplete` resolves false (the field clears). */
  rejected: string
  /** Right after a resend starts. */
  sent: string
  /** When `onResend` throws. */
  sendFailed: string
  /** The resend button. */
  resend: string
  /** The resend button during the cooldown; `time` is formatted like "0:25". */
  resendIn: (time: string) => string
}

const DEFAULT_LABELS: CodeInputLabels = {
  prompt: 'Enter the code we sent you',
  checking: 'Checking…',
  accepted: 'Code accepted',
  rejected: 'That code didn’t work. Try again.',
  sent: 'A new code is on its way.',
  sendFailed: 'Couldn’t send a new code. Try again.',
  resend: 'Resend code',
  resendIn: time => `Resend in ${time}`,
}

/** Mirrored on the root as `data-status`. */
type Status = 'idle' | 'checking' | 'ok' | 'error'

const SLOT = 40 // px per slot (at full size; the field scales down to fit its container)
const GAP = 10
const GROUP_GAP = 22
const HEIGHT = 58
const CHECK = 34 // room kept after the last slot for the success check: 12 px gap + 22 px check
const EASE_OUT = [0.23, 1, 0.32, 1] as const
const RISE = { type: 'spring' as const, stiffness: 520, damping: 34, mass: 0.7 }

/** 75 → "1:15", 3725 → "1:02:05" */
const clock = (s: number) => {
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const sec = String(s % 60).padStart(2, '0')
  return h ? `${h}:${String(m).padStart(2, '0')}:${sec}` : `${m}:${sec}`
}

// `process.env.NODE_ENV` is replaced at build time by most bundlers; where it
// isn't and `process` doesn't exist, warn anyway (warnings are once per message)
declare const process: { env: Record<string, string | undefined> }
const warned = new Set<string>()
function devWarn(message: string) {
  let dev = true
  try {
    dev = process.env.NODE_ENV !== 'production'
  } catch {
    /* no process: treat as development */
  }
  if (!dev || warned.has(message)) return
  warned.add(message)
  console.warn(message)
}

/** A whole number ≥ `min`, or `fallback` (with a dev warning) for NaN, ±Infinity and anything below `min`. */
function whole(value: number, min: number, fallback: number, name: string) {
  if (Number.isFinite(value) && value >= min) return Math.floor(value)
  devWarn(`CodeInput: \`${name}\` must be a whole number ≥ ${min} (got ${value}); using ${fallback}.`)
  return fallback
}

/**
 * One-time / verification code field: a single hidden native input drawn as
 * underlined slots. Calls `onComplete` when full; stays read-only after
 * success (call `ref.current.reset()` to start over), clears itself after a failure.
 */
export function CodeInput({
  length: lengthProp = 6,
  pattern = 'numeric',
  ref,
  onComplete,
  label = 'Verification code',
  hint,
  mask = false,
  onResend,
  resendAfter: resendAfterProp = 30,
  cooldownOnMount = false,
  group: groupProp = 3,
  autoFocus = false,
  className,
  style,
  labels: labelsProp,
}: CodeInputProps) {
  const labels = { ...DEFAULT_LABELS, ...labelsProp }
  const reduced = useSyncExternalStore(subscribeReduced, getReduced, getServerReduced)
  // degenerate props fall back instead of breaking the math (0 slots would count as "full" on mount)
  const length = whole(lengthProp, 1, Number.isFinite(lengthProp) ? 1 : 6, 'length')
  const group = whole(groupProp, 0, 0, 'group')
  const resendAfter = whole(resendAfterProp, 0, 30, 'resendAfter')
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  const [digits, setDigits] = useState<(string | null)[]>(() => Array(length).fill(null))
  const [active, setActive] = useState(0)
  const [focused, setFocused] = useState(false)
  const [status, setStatus] = useState<Status>('idle')
  const [message, setMessage] = useState('')
  const [stagger, setStagger] = useState<number[]>(() => Array(length).fill(0))
  const [cooldown, setCooldown] = useState(onResend && cooldownOnMount ? resendAfter : 0)
  const [sending, setSending] = useState(false)
  const [resendFailed, setResendFailed] = useState(false)
  const resendRef = useRef<HTMLButtonElement>(null)
  // after a failed resend, focus the button once it is enabled again (a counter, so a second failure refocuses)
  const [refocusResend, setRefocusResend] = useState(0)
  // bumped by reset(): a check or clean-up that started under an older epoch does nothing
  const epoch = useRef(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const shake = useMotionValue(0)
  const alive = useRef(true)
  const composing = useRef(false)
  // Backspace/Delete already handled on keydown: ignore the input event if the browser still sends one
  const keyHandled = useRef(false)

  /* keep only the characters a slot takes */
  const clean = (text: string) => (pattern === 'alphanumeric' ? text.replace(/[^a-z0-9]/gi, '').toUpperCase() : text.replace(/\D/g, ''))

  /* a new `length` or `pattern` starts the field over */
  const [shape, setShape] = useState(`${length}:${pattern}`)
  if (shape !== `${length}:${pattern}`) {
    setShape(`${length}:${pattern}`)
    setDigits(Array(length).fill(null))
    setStagger(Array(length).fill(0))
    setActive(0)
    setStatus('idle')
    setMessage('')
  }

  useEffect(() => {
    alive.current = true
    return () => {
      alive.current = false
    }
  }, [])

  useEffect(() => {
    if (cooldown <= 0) return
    const t = setTimeout(() => setCooldown(c => c - 1), 1000)
    return () => clearTimeout(t)
  }, [cooldown])

  // left edge of slot i: the regular pitch plus the extra group gap for each completed group before it
  const x = (i: number) => i * (SLOT + GAP) + (group > 0 ? Math.floor(i / group) * (GROUP_GAP - GAP) : 0)
  const width = x(length - 1) + SLOT
  /*
   * One design pixel, as a length. It is exactly 1px while the slots and the success
   * check fit their track; narrower than that, every slot, gap and glyph scales down
   * together, so the check never lands on the last digit.
   */
  const unit = `min(1px, calc((100cqw - ${CHECK}px) / ${width}))`
  const code = digits.map(d => (d === null ? '' : String(d))).join('')
  const full = digits.every(d => d !== null)
  const locked = status === 'checking' || status === 'ok'

  /* when the last digit lands, check the code */
  // latest-closure ref instead of useEffectEvent, so React 19.0/19.1 still work
  const verifyRef = useRef<(isCancelled: () => boolean) => void>(() => {})
  const verify = (isCancelled: () => boolean) => verifyRef.current(isCancelled)
  const verifyImpl = (isCancelled: () => boolean) => {
    if (status !== 'idle') return
    const run = async () => {
      // wait for pasted digits to finish streaming in before saying anything
      const streaming = Math.max(0, ...stagger) * 1000
      await new Promise(r => setTimeout(r, reduced ? 0 : 200 + streaming))
      if (isCancelled() || !alive.current) return
      const at = epoch.current
      setStatus('checking')
      setMessage(labels.checking)
      await new Promise(r => setTimeout(r, reduced ? 0 : 250))
      let ok = false
      try {
        ok = await onComplete(code)
      } catch {
        ok = false
      }
      if (isCancelled() || !alive.current || at !== epoch.current) return
      if (ok) {
        // focus stays on the (now read-only) input so keyboard and screen reader users aren't dropped to <body>
        setStatus('ok')
        setMessage(labels.accepted)
        return
      }
      setStatus('error')
      setMessage(labels.rejected)
      if (!reduced) {
        shake.set(-1)
        animate(shake, 0, { type: 'spring', velocity: 320, stiffness: 900, damping: 16 })
      }
      // digits drop out right to left, then the field is ready again
      setStagger(Array.from({ length }, (_, i) => (length - 1 - i) * 0.045))
      setTimeout(() => {
        if (!alive.current || at !== epoch.current) return
        setDigits(cur => cur.map(() => null))
        setActive(0)
        setTimeout(() => {
          if (!alive.current || at !== epoch.current) return
          setStagger(cur => cur.map(() => 0))
          setStatus('idle')
          inputRef.current?.focus()
        }, reduced ? 0 : 420)
      }, reduced ? 0 : 380)
    }
    run()
  }
  useEffect(() => {
    verifyRef.current = verifyImpl
  })
  useEffect(() => {
    if (!full) return
    let cancelled = false
    verify(() => cancelled)
    return () => {
      cancelled = true
    }
  }, [full, code])

  /* start over: bumping the epoch makes any check or clean-up still in flight a no-op */
  const reset = () => {
    epoch.current++
    setDigits(Array(length).fill(null))
    setStagger(Array(length).fill(0))
    setActive(0)
    setStatus('idle')
    setMessage('')
    setResendFailed(false)
  }
  // latest-value ref: the handle stays stable while always calling the current reset
  const resetRef = useRef(reset)
  useEffect(() => {
    resetRef.current = reset
  })
  useImperativeHandle(ref, () => ({ reset: () => resetRef.current(), focus: () => inputRef.current?.focus() }), [])

  const setAt = (i: number, d: string | null) => {
    setDigits(cur => cur.map((v, k) => (k === i ? d : v)))
  }

  const fill = (text: string, from: number) => {
    const incoming = clean(text).slice(0, length - from).split('')
    if (!incoming.length) return
    setStagger(Array.from({ length }, (_, i) => (i >= from ? (i - from) * 0.05 : 0)))
    setDigits(cur => cur.map((v, k) => (k >= from && k < from + incoming.length ? incoming[k - from] : v)))
    setActive(Math.min(length - 1, from + incoming.length))
    setMessage('')
    setResendFailed(false)
    setTimeout(() => alive.current && setStagger(cur => cur.map(() => 0)), 700)
  }

  const typeDigit = (d: string) => {
    setStagger(Array(length).fill(0))
    setAt(active, d)
    setActive(a => Math.min(length - 1, a + 1))
    setMessage('')
    setResendFailed(false)
  }

  const erase = (forward: boolean) => {
    if (forward) return setAt(active, null)
    // filled slot: clear it in place; empty slot: step back and clear that one
    if (digits[active] !== null) setAt(active, null)
    else if (active > 0) {
      setAt(active - 1, null)
      setActive(active - 1)
    }
  }

  /* digits never come from keydown: IMEs report key 229 / "Unidentified", voice and on-screen keyboards send no keys at all */
  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    keyHandled.current = false
    if (locked || status === 'error' || e.nativeEvent.isComposing) return
    if (e.key === 'Backspace' || e.key === 'Delete') {
      e.preventDefault()
      keyHandled.current = true
      setTimeout(() => (keyHandled.current = false), 0)
      erase(e.key === 'Delete')
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault()
      setActive(a => Math.max(0, a - 1))
    } else if (e.key === 'ArrowRight') {
      e.preventDefault()
      setActive(a => Math.min(length - 1, a + 1, digits.filter(d => d !== null).length))
    }
  }

  const onPaste = (e: ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault()
    if (locked) return
    fill(e.clipboardData.getData('text'), 0)
  }

  /* the input's value is the source of truth for what was typed, said or autofilled */
  const read = (el: HTMLInputElement, inputType: string) => {
    const next = el.value
    const prev = code
    // put the text back; the effect below writes the new code once state settles
    el.value = prev
    if (keyHandled.current || locked || status === 'error' || next === prev) return
    // diff old vs new text: skip the common prefix and suffix; what's left in between is what was inserted
    let start = 0
    while (start < prev.length && start < next.length && prev[start] === next[start]) start++
    let end = 0
    while (end < prev.length - start && end < next.length - start && prev[prev.length - 1 - end] === next[next.length - 1 - end]) end++
    const inserted = clean(next.slice(start, next.length - end))
    const all = clean(next)
    if (inputType.startsWith('delete') || (!inserted && next.length < prev.length)) {
      erase(inputType === 'deleteContentForward')
    } else if (!inserted) {
      return
    } else if (inserted.length >= length || inputType === 'insertReplacementText') {
      fill(inserted, 0) // SMS autofill writes the whole code at once
    } else if (inserted.length > 1) {
      if (all.length >= length) fill(all.slice(-length), 0)
      else fill(inserted, active)
    } else typeDigit(inserted)
  }

  const onChange = (e: ChangeEvent<HTMLInputElement>) => {
    if (composing.current) return
    read(e.currentTarget, (e.nativeEvent as InputEvent).inputType ?? '')
  }

  /* keep the hidden input's text equal to the code (and its caret at the end) */
  useEffect(() => {
    const el = inputRef.current
    if (!el || composing.current) return
    if (el.value !== code) el.value = code
    if (document.activeElement === el) el.setSelectionRange(code.length, code.length)
  }, [code])

  const pick = (i: number) => {
    if (locked) return
    // you can revisit any filled slot, or the first empty one
    const firstEmpty = digits.findIndex(d => d === null)
    setActive(firstEmpty === -1 ? i : Math.min(i, firstEmpty))
    inputRef.current?.focus()
  }

  const resend = async () => {
    if (cooldown > 0 || sending || !onResend) return
    reset()
    setCooldown(resendAfter)
    setSending(true)
    setMessage(labels.sent)
    let failed = false
    try {
      await onResend()
    } catch {
      failed = true
    }
    if (!alive.current) return
    setSending(false)
    if (!failed) {
      inputRef.current?.focus()
      return
    }
    // let them try again straight away; focus waits for the button to be enabled
    setCooldown(0)
    setResendFailed(true)
    setMessage(labels.sendFailed)
    setRefocusResend(n => n + 1)
  }
  useEffect(() => {
    if (refocusResend) resendRef.current?.focus()
  }, [refocusResend])

  const hintId = `ci-${uid}-hint`
  // a string hint gets a hidden copy; any other node is described in place (never duplicated: it may hold links)
  const plainHint = hint == null || typeof hint === 'string' || typeof hint === 'number'
  const showCaret = focused && !locked && status !== 'error'

  return (
    <div className={['ci-root', className].filter(Boolean).join(' ')} style={style} data-status={status}>
      <CodeInputStyles />
      <label className="ci-sr" htmlFor={`ci-${uid}`}>
        {label}
      </label>
      <input
        ref={inputRef}
        id={`ci-${uid}`}
        className="ci-sr"
        type="text"
        inputMode={pattern === 'alphanumeric' ? 'text' : 'numeric'}
        autoComplete="one-time-code"
        autoCapitalize={pattern === 'alphanumeric' ? 'characters' : undefined}
        autoCorrect="off"
        spellCheck={false}
        pattern={pattern === 'alphanumeric' ? '[A-Za-z0-9]*' : '[0-9]*'}
        aria-describedby={hintId}
        aria-invalid={status === 'error' || undefined}
        readOnly={locked}
        autoFocus={autoFocus}
        onChange={onChange}
        onCompositionStart={() => (composing.current = true)}
        onCompositionEnd={e => {
          composing.current = false
          read(e.currentTarget, 'insertText')
        }}
        onKeyDown={onKeyDown}
        onPaste={onPaste}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
      />

      <div className="ci-track" style={{ width: width + CHECK, ...({ '--ci-u': unit, '--ci-w': width } as CSSProperties) }}>
        <motion.div className="ci-field" aria-hidden style={{ x: shake }}>
          {digits.map((d, i) => (
            <div
              key={i}
              className="ci-slot"
              style={{ left: `calc(${x(i)} * var(--ci-u))` }}
              data-active={(showCaret && i === active) || undefined}
              data-filled={d !== null || undefined}
              onMouseDown={e => {
                e.preventDefault()
                pick(i)
              }}
            >
              <span className="ci-glyph">
                <AnimatePresence initial={false}>
                  {d !== null && (
                    <motion.span
                      key={`${d}-${i}`}
                      className="ci-digit"
                      data-dot={mask || undefined}
                      initial={reduced ? { opacity: 0 } : { y: '110%' }}
                      animate={{ y: 0, scale: 1, opacity: 1 }}
                      exit={
                        reduced
                          ? { opacity: 0 }
                          : status !== 'error'
                            ? { opacity: 0, transition: { duration: 0.12 } }
                            : { y: '110%', transition: { duration: 0.26, ease: [0.55, 0, 1, 0.45], delay: stagger[i] } }
                      }
                      transition={reduced ? { duration: 0 } : { ...RISE, delay: stagger[i] }}
                    >
                      {/* masked: only ever a dot on screen; the digit lives in the hidden input */}
                      {mask ? '•' : d}
                    </motion.span>
                  )}
                </AnimatePresence>
              </span>
              <motion.i
                className="ci-rule"
                initial={false}
                animate={{ opacity: status === 'ok' ? 0 : 1 }}
                transition={{ duration: 0.2, delay: status === 'ok' ? 0.35 : 0 }}
              />
            </div>
          ))}

          {/* one caret that glides between slots */}
          <motion.i
            className="ci-caret"
            initial={false}
            animate={{ x: `${((x(active) + SLOT / 2 - 1) / width) * 100}%`, opacity: showCaret ? 1 : 0 }}
            transition={reduced ? { duration: 0 } : { x: { type: 'spring', stiffness: 700, damping: 40 }, opacity: { duration: 0.12 } }}
          />

          {/* checking: a line runs along the underlines; accepted: one continuous line */}
          <motion.i
            className="ci-run"
            initial={false}
            animate={
              status === 'checking'
                ? { scaleX: 0.86, opacity: 1 }
                : status === 'ok'
                  ? { scaleX: 1, opacity: 1 }
                  : { scaleX: 0, opacity: 0 }
            }
            transition={
              status === 'checking'
                ? { scaleX: { duration: reduced ? 0 : 1.4, ease: EASE_OUT }, opacity: { duration: 0.1 } }
                : status === 'ok'
                  ? { duration: reduced ? 0 : 0.32, ease: EASE_OUT }
                  : { duration: 0.2 }
            }
          />
        </motion.div>
        {/* outside the field (which clips the caret's full-width box), in the room the track keeps for it */}
        <svg className="ci-check" aria-hidden viewBox="0 0 20 20" style={{ left: `min(calc(${width + 12} * var(--ci-u)), calc(100cqw - 22px))` }}>
          <motion.path
            d="M4 10.5 L8.2 14.5 L16 5.5"
            initial={false}
            animate={{ pathLength: status === 'ok' ? 1 : 0, opacity: status === 'ok' ? 1 : 0 }}
            transition={{ duration: reduced ? 0 : 0.35, ease: EASE_OUT, delay: status === 'ok' && !reduced ? 0.3 : 0 }}
          />
        </svg>
      </div>

      <div className="ci-foot" style={{ minWidth: `min(${width}px, 100%)` }}>
        <span className="ci-msg" aria-live="polite">
          <AnimatePresence mode="popLayout" initial={false}>
            <motion.span
              key={message || 'hint'}
              initial={reduced ? { opacity: 0 } : { y: '100%', opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={reduced ? { opacity: 0 } : { y: '-100%', opacity: 0 }}
              transition={{ duration: 0.22, ease: EASE_OUT }}
              data-kind={resendFailed ? 'error' : status}
              dir="auto"
              id={!message && !plainHint ? hintId : undefined}
            >
              {message || hint || labels.prompt}
            </motion.span>
          </AnimatePresence>
        </span>
        {plainHint && (
          <span className="ci-sr" id={hintId}>
            {hint != null ? String(hint) : `Enter the ${length}-${pattern === 'alphanumeric' ? 'character' : 'digit'} code we sent you`}
          </span>
        )}
        {onResend && status !== 'ok' && (
          <button ref={resendRef} type="button" className="ci-resend" onClick={resend} disabled={cooldown > 0 || sending}>
            <UiIcon name="refresh" size={13} />
            {cooldown > 0 ? labels.resendIn(clock(cooldown)) : labels.resend}
          </button>
        )}
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Styles — injected once, hoisted by React 19                               */
/* ────────────────────────────────────────────────────────────────────────── */

function CodeInputStyles() {
  return (
    <style href="code-input" precedence="medium">
      {CSS}
    </style>
  )
}

const CSS = /* css */ `
.ci-root {
  --_ink: var(--code-input-ink, var(--ui-ink, #17140f));
  --_radius-sm: var(--ui-radius-sm, 8px);
  --_accent: var(--code-input-accent, var(--ui-accent, #d4452b));
  --_ok: var(--code-input-ok, var(--ui-ok, #3f8f55));
  --_muted: color-mix(in oklab, var(--_ink) 56%, transparent);
  --_rule: color-mix(in oklab, var(--_ink) 22%, transparent);
  display: inline-flex; flex-direction: column; align-items: flex-start; max-width: 100%; min-width: 0; color: var(--_ink);
  -webkit-tap-highlight-color: transparent;
}
.ci-sr {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap;
}
/* codes read left to right in every script: the slots, caret and check keep LTR geometry in RTL pages too
   (the message line and resend button below still follow the page's direction) */
.ci-track { position: relative; max-width: 100%; container-type: inline-size; direction: ltr; }
.ci-field {
  position: relative; width: calc(var(--ci-w) * var(--ci-u)); height: calc(${HEIGHT} * var(--ci-u));
  overflow: clip; cursor: text; user-select: none; -webkit-user-select: none;
}
.ci-slot { position: absolute; top: 0; width: calc(${SLOT} * var(--ci-u)); height: 100%; }
.ci-glyph { position: absolute; left: 0; right: 0; top: 0; bottom: calc(8 * var(--ci-u)); display: grid; place-items: end center; overflow: hidden; }
.ci-digit {
  display: block; padding-bottom: calc(4 * var(--ci-u));
  font-size: calc(32 * var(--ci-u)); font-weight: 500; line-height: 1; letter-spacing: -0.02em; font-variant-numeric: tabular-nums;
}
.ci-digit[data-dot] { font-size: calc(30 * var(--ci-u)); padding-bottom: calc(8 * var(--ci-u)); }
.ci-rule {
  position: absolute; left: 0; right: 0; bottom: 0; height: 2px; border-radius: 2px; background: var(--_rule);
  transition: background-color 160ms ease;
}
.ci-slot[data-filled] .ci-rule { background: color-mix(in oklab, var(--_ink) 55%, transparent); }
.ci-slot[data-active] .ci-rule { background: var(--_ink); }
.ci-root[data-status="error"] .ci-rule { background: var(--_accent); }
.ci-caret {
  /* as wide as the field, so its x (a percentage) lands on a slot at any scale; the line is ::before */
  position: absolute; left: 0; top: calc(14 * var(--ci-u)); width: 100%; height: calc(30 * var(--ci-u)); pointer-events: none;
}
.ci-caret::before {
  content: ''; position: absolute; left: 0; top: 0; bottom: 0; width: 2px; border-radius: 1px; background: var(--_accent);
  animation: ci-blink 1.1s steps(1) 12 0.6s;
}
@keyframes ci-blink { 50% { visibility: hidden; } }
.ci-run {
  position: absolute; left: 0; right: 0; bottom: 0; height: 2px; border-radius: 2px; transform-origin: 0 50%;
  background: var(--_ink);
}
.ci-root[data-status="ok"] .ci-run { background: var(--_ok); }
.ci-check { position: absolute; bottom: calc(4 * var(--ci-u)); width: 22px; height: 22px; overflow: visible; fill: none; stroke: var(--_ok); stroke-width: 2.2; stroke-linecap: round; stroke-linejoin: round; }

.ci-foot {
  display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; column-gap: 16px; row-gap: 4px;
  margin-top: 14px; min-height: 24px; max-width: 100%;
}
/* the message wraps (never clipped); "Resend" drops to its own row only when even a short message line won't fit */
.ci-msg { position: relative; flex: 1 1 9em; min-width: 0; min-height: 20px; overflow: hidden; font-size: 13.5px; line-height: 20px; color: var(--_muted); }
.ci-msg > span { display: block; text-align: start; text-wrap: pretty; overflow-wrap: anywhere; }
.ci-msg > span[data-kind="error"] { color: var(--_accent); }
.ci-msg > span[data-kind="ok"] { color: var(--_ok); font-weight: 550; }
.ci-root .ci-resend {
  display: inline-flex; align-items: center; gap: 5px; min-height: 24px;
  flex: none; margin: 0; padding: 0; border: 0; background: none; cursor: pointer;
  font: inherit; font-size: 13px; color: var(--_ink); font-variant-numeric: tabular-nums;
  text-decoration: underline; text-underline-offset: 3px; text-decoration-color: color-mix(in oklab, var(--_ink) 30%, transparent);
}
.ci-resend:disabled { color: var(--_muted); cursor: default; text-decoration: none; }
.ci-resend:focus-visible { outline: 2px solid var(--_accent); outline-offset: 2px; border-radius: calc(var(--_radius-sm) * 0.375); }
/* a text-sized link: a taller hit area on touch, without moving the row */
@media (pointer: coarse) {
  .ci-root .ci-resend { position: relative; }
  .ci-root .ci-resend::after { content: ''; position: absolute; inset: -10px -8px; }
}

@media (prefers-reduced-motion: reduce) {
  .ci-caret::before { animation: none; }
}
`

export default CodeInput
