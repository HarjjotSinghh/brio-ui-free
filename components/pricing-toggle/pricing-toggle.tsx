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
 * Pricing Toggle — the monthly / yearly switch, with prices that roll.
 *
 * Composable pieces that share one billing period:
 *   <Billing>            provider (controlled or uncontrolled), renders no DOM
 *   <BillingSwitch>      segmented switch; click, arrow keys, or drag the thumb
 *   <BillingPrice>       odometer price, locale-formatted, per-digit springs
 *   <BillingText>        any line that differs per period ("billed yearly")
 *   useBilling()         { period, setPeriod }
 *
 * Prop types are exported as BillingProps, BillingSwitchProps,
 * BillingPriceProps and BillingTextProps.
 *
 * Drag the thumb halfway and every price on the page sits halfway between
 * monthly and yearly, digits mid-roll. Let go and it snaps with your throw.
 * Land on yearly and the savings badge peels up and sticks back down; the
 * old monthly price appears struck through beside the new one.
 *
 * Accessible: the switch is a radiogroup (arrow keys wrap, roving tabindex); each
 * price exposes its final formatted value once, never digit soup. Reduced
 * motion: digits and thumb jump, text crossfades.
 *
 * Controlled: pass `period` + `onChange`. The thumb and prices always follow
 * the `period` you hold: if you keep the old one (say, yearly is gated), a
 * drag or click springs back instead of leaving the switch on the new side.
 *
 * Locale: <BillingPrice> formats with the visitor's locale by default. When
 * rendering on the server (SSR / RSC), pass `locale` (and `currency`)
 * explicitly, or the server's locale can differ from the browser's and the
 * price will mismatch on hydration.
 *
 * Corners follow --ui-radius-pill (see Theming → Corners).
 * Theme via library tokens (--ui-ink, --ui-surface, --ui-accent) or
 * --pricing-toggle-* overrides.
 *
 * Requires: react >= 19, motion >= 11.
 */
import {
  AnimatePresence,
  animate,
  motion,
  useMotionValue,
  type MotionValue,
  type Variants,
} from 'motion/react'
import {
  createContext,
  createElement,
  memo,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from 'react'

/* Icons: Iconoir (MIT, © 2021 Luca Burgio, iconoir.com), inlined so the component stays dependency-free. */
const UI_ICONS = {
  'sparks': [['path', { d: 'M8 15C12.8747 15 15 12.949 15 8C15 12.949 17.1104 15 22 15C17.1104 15 15 17.1104 15 22C15 17.1104 12.8747 15 8 15Z' }], ['path', { d: 'M2 6.5C5.13376 6.5 6.5 5.18153 6.5 2C6.5 5.18153 7.85669 6.5 11 6.5C7.85669 6.5 6.5 7.85669 6.5 11C6.5 7.85669 5.13376 6.5 2 6.5Z' }]],
} as const satisfies Record<string, readonly (readonly [string, Record<string, string>])[]>

type UiIconName = keyof typeof UI_ICONS

function UiIcon({ name, size = 16, className }: { name: UiIconName; size?: number; className?: string }) {
  return (
    <svg className={['ui-icon', className].filter(Boolean).join(' ')} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {UI_ICONS[name].map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Shared billing period                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

/** The two billing periods every piece switches between. */
export type BillingPeriod = 'monthly' | 'yearly'

type BillingContextValue = {
  period: BillingPeriod
  /** 0 = monthly, 1 = yearly; follows drags and springs in between. */
  progress: MotionValue<number>
  go: (period: BillingPeriod, velocity?: number) => void
  reduced: boolean
}

/* order of the switch's options, for arrow-key navigation */
const PERIODS: readonly BillingPeriod[] = ['monthly', 'yearly']

const BillingContext = createContext<BillingContextValue | null>(null)

const EASE_OUT = [0.23, 1, 0.32, 1] as const
const SNAP = { type: 'spring' as const, visualDuration: 0.5, bounce: 0.16 }

/** Bundler-agnostic dev check: only a literal production NODE_ENV silences warnings. */
const isDev = () => (globalThis as { process?: { env?: Record<string, string | undefined> } }).process?.env?.NODE_ENV !== 'production'
const warned = new Set<string>()
function devWarn(message: string) {
  if (!isDev() || warned.has(message)) return
  warned.add(message)
  console.warn(message)
}

/** An ellipsized one-line text gets its full text as a tooltip, set on hover so text that fits stays quiet. */
const tipIfClipped = (e: { currentTarget: HTMLElement }) => {
  const el = e.currentTarget
  if (el.scrollWidth > el.clientWidth + 1) el.title = el.textContent ?? ''
  else el.removeAttribute('title')
}

/*
 * Per-letter animation splits by grapheme (emoji and combining sequences stay whole). Scripts that
 * need shaping or run right to left (Arabic, Hebrew, Indic, Thai…) animate as a whole word:
 * splitting them would break the letterforms.
 */
const SHAPED = /[\u0590-\u08FF\u0900-\u0DFF\u0E00-\u0FFF\u1000-\u109F\u1780-\u18AF\uA8E0-\uA8FF\uFB1D-\uFDFF\uFE70-\uFEFF]/
let segmenter: { segment: (s: string) => Iterable<{ segment: string }> } | null | undefined
function glyphsOf(text: string): string[] {
  if (SHAPED.test(text)) return [text]
  if (segmenter === undefined) {
    try {
      segmenter = new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    } catch {
      segmenter = null
    }
  }
  return segmenter ? Array.from(segmenter.segment(text), g => g.segment) : Array.from(text)
}

function useBillingContext(name: string) {
  const ctx = useContext(BillingContext)
  if (!ctx) throw new Error(`<${name}> must be inside <Billing>.`)
  return ctx
}

/** Props of `<Billing>`. */
export type BillingProps = {
  /** The switch, prices and text that share this period. Any other markup can sit in between. */
  children: ReactNode
  /** Controlled period. When set, the thumb and prices only move to the value you pass back. */
  period?: BillingPeriod
  /**
   * Starting period when uncontrolled.
   * @default 'monthly'
   */
  defaultPeriod?: BillingPeriod
  /** Called when the user asks for a different period (click, key, drag or `setPeriod`). */
  onChange?: (period: BillingPeriod) => void
}

/**
 * Provider that holds the billing period for every `BillingSwitch`,
 * `BillingPrice` and `BillingText` inside it. Renders no DOM of its own.
 */
export function Billing({ children, period, defaultPeriod = 'monthly', onChange }: BillingProps) {
  const reduced = useSyncExternalStore(subscribeReduced, getReduced, getServerReduced)
  const [inner, setInner] = useState<BillingPeriod>(defaultPeriod)
  const current = period ?? inner
  const progress = useMotionValue(current === 'yearly' ? 1 : 0)
  const target = useRef<BillingPeriod>(current)
  const onChangeRef = useRef(onChange)
  useEffect(() => {
    onChangeRef.current = onChange
  })

  const glide = useCallback(
    (p: BillingPeriod, velocity = 0) => {
      target.current = p
      const to = p === 'yearly' ? 1 : 0
      if (reduced) progress.set(to)
      else animate(progress, to, { ...SNAP, velocity })
    },
    [progress, reduced],
  )

  /* controlled: a request waiting for the parent's answer (carries the throw) */
  const pending = useRef<{ velocity: number } | null>(null)
  const [settle, setSettle] = useState(0)

  const go = useCallback(
    (p: BillingPeriod, velocity = 0) => {
      if (period === undefined) {
        glide(p, velocity)
        setInner(p)
      } else {
        // don't move on our own: re-render and glide to whatever `period` the parent keeps
        pending.current = { velocity }
        setSettle(n => n + 1)
      }
      if (p !== current) onChangeRef.current?.(p)
    },
    [glide, period, current],
  )

  /* follow the period we're given; after a rejected drag/click this snaps back */
  useEffect(() => {
    const req = pending.current
    pending.current = null
    if (req || target.current !== current) glide(current, req?.velocity ?? 0)
  }, [current, settle, glide])

  const value = useMemo(() => ({ period: current, progress, go, reduced }), [current, progress, go, reduced])
  return <BillingContext.Provider value={value}>{children}</BillingContext.Provider>
}

/**
 * Read and set the shared period from any component inside `<Billing>`.
 * Throws when used outside it.
 */
// oxlint-disable-next-line react/only-export-components -- the hook belongs with its provider in this one file
export function useBilling() {
  const ctx = useBillingContext('useBilling')
  return { period: ctx.period, setPeriod: (p: BillingPeriod) => ctx.go(p) }
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Switch                                                                    */
/* ────────────────────────────────────────────────────────────────────────── */

/** Props of `<BillingSwitch>`. */
export type BillingSwitchProps = {
  /**
   * Text of the two segments.
   * @default { monthly: 'Monthly', yearly: 'Yearly' }
   */
  labels?: Record<BillingPeriod, string>
  /**
   * Shown on the yearly side. Pass null to hide.
   * @default 'Save 20%'
   */
  badge?: ReactNode
  /**
   * Accessible name of the radiogroup.
   * @default 'Billing period'
   */
  label?: string
  /** Extra class on the track (`.bs-root`). */
  className?: string
  /** Inline styles on the track. */
  style?: CSSProperties
}

/**
 * Two-option segmented switch (a radiogroup). Click a side, use the arrow
 * keys (Right/Down next, Left/Up previous, wrapping; Home/End first/last),
 * or drag the thumb; prices follow the thumb while it moves.
 * Must be inside `<Billing>`.
 */
export function BillingSwitch({
  labels = { monthly: 'Monthly', yearly: 'Yearly' },
  badge = 'Save 20%',
  label = 'Billing period',
  className,
  style,
}: BillingSwitchProps) {
  const { period, progress, go, reduced } = useBillingContext('BillingSwitch')
  const trackRef = useRef<HTMLDivElement>(null)
  const segRefs = useRef<Record<BillingPeriod, HTMLButtonElement | null>>({ monthly: null, yearly: null })
  const geo = useRef({ l0: 4, w0: 80, l1: 88, w1: 120 })
  const thumbX = useMotionValue(4)
  const thumbW = useMotionValue(80)
  const drag = useRef<{ x: number; p: number; moved: boolean; id: number } | null>(null)
  const suppressClick = useRef(false)
  const [peel, setPeel] = useState(0)
  /** mirrors data-wrap: a wrapped badge is a tall block, so its peel is a small nudge, not a flip */
  const [wrapped, setWrapped] = useState(false)
  const lastPeriod = useRef(period)

  /* thumb follows progress; stretches with speed */
  useEffect(() => {
    const paint = () => {
      const { l0, w0, l1, w1 } = geo.current
      const p = progress.get()
      const stretch = reduced ? 0 : Math.min(Math.abs(progress.getVelocity()) * 5, 16)
      thumbW.set(w0 + (w1 - w0) * p + stretch)
      thumbX.set(l0 + (l1 - l0) * p - stretch / 2)
    }
    const measure = () => {
      const a = segRefs.current.monthly
      const b = segRefs.current.yearly
      if (!a || !b) return
      geo.current = { l0: a.offsetLeft, w0: a.offsetWidth, l1: b.offsetLeft, w1: b.offsetWidth }
      paint()
    }
    measure()
    const off = progress.on('change', paint)
    const ro = new ResizeObserver(measure)
    if (trackRef.current) ro.observe(trackRef.current)
    // the segments too: wrapping (data-wrap) can resize them without resizing the track
    for (const el of Object.values(segRefs.current)) if (el) ro.observe(el)
    return () => {
      off()
      ro.disconnect()
    }
  }, [progress, thumbX, thumbW, reduced])

  /* when the labels or the badge don't fit on one line, the switch wraps instead of cutting text:
     both segments share the width and their text breaks onto a second line (data-wrap). Checked in
     the one-line layout, so it switches back as soon as there's room again. */
  useEffect(() => {
    const root = trackRef.current
    if (!root) return
    const fit = () => {
      root.removeAttribute('data-wrap')
      const clipped = [...root.querySelectorAll<HTMLElement>('.bs-label, .bs-badge')].some(el => el.scrollWidth > el.clientWidth + 1)
      root.toggleAttribute('data-wrap', clipped)
      setWrapped(clipped)
    }
    fit()
    document.fonts?.ready.then(fit)
    const ro = new ResizeObserver(fit)
    ro.observe(root)
    if (root.parentElement) ro.observe(root.parentElement)
    return () => ro.disconnect()
  }, [labels.monthly, labels.yearly, badge])

  /* landing on yearly: the badge peels up and sticks back down */
  useEffect(() => {
    if (period === 'yearly' && lastPeriod.current !== 'yearly') setPeel(n => n + 1)
    lastPeriod.current = period
  }, [period])

  const onDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (e.button !== 0) return
    drag.current = { x: e.clientX, p: progress.get(), moved: false, id: e.pointerId }
    suppressClick.current = false
  }
  const onMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const d = drag.current
    if (!d) return
    const dx = e.clientX - d.x
    if (!d.moved) {
      if (Math.abs(dx) < 4) return
      d.moved = true
      trackRef.current?.setPointerCapture(d.id)
    }
    // one "span" of pointer travel = the distance between the two segments' left edges = progress 0 → 1
    const span = Math.max(1, geo.current.l1 - geo.current.l0)
    progress.stop()
    // a little rubber band past either end
    const raw = d.p + dx / span
    progress.set(raw < 0 ? raw * 0.25 : raw > 1 ? 1 + (raw - 1) * 0.25 : raw)
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (!d?.moved) return
    suppressClick.current = true
    const v = progress.getVelocity()
    // project where the throw would land ~120 ms from now, so a quick flick counts even short of halfway
    const projected = progress.get() + v * 0.12
    go(projected > 0.5 ? 'yearly' : 'monthly', v)
  }

  /* radiogroup keys: Right/Down next, Left/Up previous (wrapping), Home/End first/last */
  const onKey = (e: KeyboardEvent<HTMLDivElement>) => {
    const step = e.key === 'ArrowRight' || e.key === 'ArrowDown' ? 1 : e.key === 'ArrowLeft' || e.key === 'ArrowUp' ? -1 : 0
    if (!step && e.key !== 'Home' && e.key !== 'End') return
    e.preventDefault()
    const focused = (e.target as HTMLElement).closest<HTMLElement>('[data-period]')?.dataset.period as BillingPeriod | undefined
    const from = PERIODS.indexOf(focused ?? period)
    const next: BillingPeriod =
      e.key === 'Home' ? PERIODS[0] : e.key === 'End' ? PERIODS[PERIODS.length - 1] : PERIODS[(from + step + PERIODS.length) % PERIODS.length]
    go(next)
    segRefs.current[next]?.focus()
  }

  const seg = (p: BillingPeriod, children: ReactNode) => (
    <button
      ref={el => {
        segRefs.current[p] = el
      }}
      type="button"
      role="radio"
      aria-checked={period === p}
      tabIndex={period === p ? 0 : -1}
      className="bs-seg"
      data-period={p}
      onClick={() => {
        if (suppressClick.current) {
          suppressClick.current = false
          return
        }
        go(p)
      }}
    >
      {children}
    </button>
  )

  return (
    <motion.div
      ref={trackRef}
      role="radiogroup"
      aria-label={label}
      className={['bs-root', className].filter(Boolean).join(' ')}
      style={{ ...style, ['--p' as string]: progress } as never}
      onPointerDown={onDown}
      onPointerMove={onMove}
      onPointerUp={onUp}
      onPointerCancel={onUp}
      onKeyDown={onKey}
    >
      <PricingStyles />
      <motion.span className="bs-thumb" aria-hidden style={{ x: thumbX, width: thumbW }} />
      {seg('monthly', <span className="bs-label" onPointerEnter={tipIfClipped}>{labels.monthly}</span>)}
      {seg(
        'yearly',
        <>
          <span className="bs-label" onPointerEnter={tipIfClipped}>{labels.yearly}</span>
          {badge != null && <span className="bp-sr">, </span>}
          {badge != null && (
            <motion.span
              key={peel}
              className="bs-badge"
              initial={false}
              animate={
                peel && !reduced
                  ? wrapped
                    ? { rotate: [0, -2, 0.8, 0], y: [0, -3, 0.5, 0], scale: [1, 1.03, 0.995, 1] }
                    : { rotate: [0, -10, 4, 0], y: [0, -6, 1, 0], scale: [1, 1.12, 0.98, 1] }
                  : { rotate: 0, y: 0, scale: 1 }
              }
              transition={{ duration: 0.62, ease: EASE_OUT, times: [0, 0.35, 0.7, 1], delay: 0.08 }}
              onPointerEnter={tipIfClipped}
            >
              <UiIcon name="sparks" size={11} className="bs-badge-icon" />
              {badge}
              {peel > 0 && !reduced && (
                <motion.i
                  className="bs-sheen"
                  aria-hidden
                  // full-width layer with a narrow band: -100% → 100% carries the band clean across and out
                  initial={{ x: '-100%' }}
                  animate={{ x: '100%' }}
                  transition={{ duration: 0.75, ease: [0.45, 0, 0.25, 1], delay: 0.3 }}
                />
              )}
            </motion.span>
          )}
        </>,
      )}
    </motion.div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Price                                                                     */
/* ────────────────────────────────────────────────────────────────────────── */

const LINE = 1.1 // em, digit line height

/* memo: while the price rolls, only columns whose digit changed re-render */
const LATN = '0123456789'.split('')

/* at rest a column holds one glyph; the strip (and its edge mask) only exists while it rolls */
const Digit = memo(function Digit({ d, place, reduced, glyphs = LATN }: { d: number; place: number; reduced: boolean; glyphs?: readonly string[] }) {
  const [prev, setPrev] = useState(d)
  const [from, setFrom] = useState<number | null>(null)
  if (d !== prev) {
    setPrev(d)
    if (!reduced && from === null) setFrom(prev)
  }
  /* back to a still digit once the roll has settled (1 s after the last change covers the slowest spring) */
  useEffect(() => {
    if (from === null) return
    const t = setTimeout(() => setFrom(null), 1000)
    return () => clearTimeout(t)
  }, [from, d])
  return (
    <motion.span
      className="bp-col"
      data-rolling={from !== null || undefined}
      initial={reduced ? false : { width: '0ch', opacity: 0 }}
      animate={{ width: '1ch', opacity: 1 }}
      exit={reduced ? { opacity: 0 } : { width: '0ch', opacity: 0 }}
      transition={{ duration: 0.3, ease: EASE_OUT }}
    >
      {from === null ? (
        <span className="bp-still">{glyphs[d]}</span>
      ) : (
        <motion.span
          className="bp-strip"
          initial={{ y: `${-from * LINE}em` }}
          animate={{ y: `${-d * LINE}em` }}
          // higher places are heavier: the roll cascades from the units upward
          transition={{ type: 'spring', stiffness: Math.max(120, 300 - place * 45), damping: 24, mass: 0.8 }}
        >
          {glyphs.map((n, i) => (
            <span key={i}>{n}</span>
          ))}
        </motion.span>
      )}
    </motion.span>
  )
})

/** Props of `<BillingPrice>`. */
export type BillingPriceProps = {
  /** Price shown on monthly. */
  monthly: number
  /** Price shown on yearly, in the same unit as `monthly` (usually the per-month equivalent). */
  yearly: number
  /**
   * ISO 4217 currency code passed to `Intl.NumberFormat`. An invalid one falls back to a plain number (dev warning).
   * @default 'USD'
   */
  currency?: string
  /** BCP 47 locale for formatting. Defaults to the runtime's locale; set it when rendering on the server. */
  locale?: string
  /** Defaults to 0 when both prices are whole numbers, else 2. */
  fractionDigits?: number
  /** e.g. "/mo", or per period: { monthly: '/mo', yearly: '/mo' } */
  suffix?: string | Record<BillingPeriod, string>
  /**
   * On yearly, show the monthly price struck through above it (only when `yearly < monthly`);
   * beside it when there is no room above.
   * @default true
   */
  compare?: boolean
  /** Extra class on the root (`.bp-root`). Set `font-size` here: the suffix and old price scale from it. */
  className?: string
  /** Inline styles on the root. */
  style?: CSSProperties
}

/**
 * Odometer price for the current period. Every digit rolls on its own spring,
 * and during a drag the value sits between `monthly` and `yearly`.
 * Rolls through the locale's own digits, keeps the number left-to-right in RTL
 * pages, shrinks to fit a narrow container, shows "—" for NaN / Infinity and a
 * plain number for an invalid currency (dev warnings).
 * Must be inside `<Billing>`.
 */
export function BillingPrice({
  monthly,
  yearly,
  currency = 'USD',
  locale,
  fractionDigits,
  suffix,
  compare = true,
  className,
  style,
}: BillingPriceProps) {
  const { period, progress, reduced } = useBillingContext('BillingPrice')
  /* NaN / Infinity never reach the screen: a missing price shows as a dash */
  const m = Number.isFinite(monthly) ? monthly : null
  const y = Number.isFinite(yearly) ? yearly : null
  const fdRaw = fractionDigits ?? (Number.isInteger(m ?? 0) && Number.isInteger(y ?? 0) ? 0 : 2)
  const fd = Number.isFinite(fdRaw) ? Math.min(20, Math.max(0, Math.round(fdRaw))) : 2
  /* a malformed currency code or locale must not take the price down: fall back to a plain number */
  const { fmt, bad } = useMemo(() => {
    const opts = { minimumFractionDigits: fd, maximumFractionDigits: fd }
    try {
      return { fmt: new Intl.NumberFormat(locale, { ...opts, style: 'currency', currency }), bad: null }
    } catch {
      try {
        return { fmt: new Intl.NumberFormat(locale, opts), bad: `currency "${currency}"` }
      } catch {
        return { fmt: new Intl.NumberFormat(undefined, opts), bad: `locale "${locale}" / currency "${currency}"` }
      }
    }
  }, [locale, currency, fd])
  /* the locale's own digits (Arabic-Indic, Devanagari…), so the odometer rolls through the right glyphs */
  const glyphs = useMemo(() => {
    const { locale: resolved, numberingSystem } = fmt.resolvedOptions()
    if (numberingSystem === 'latn') return LATN
    try {
      const plain = new Intl.NumberFormat(resolved, { numberingSystem, useGrouping: false })
      return LATN.map((_, i) => plain.format(i))
    } catch {
      return LATN
    }
  }, [fmt])
  const nonFinite = m === null || y === null
  useEffect(() => {
    if (bad) devWarn(`BillingPrice: invalid ${bad}; showing a plain number.`)
  }, [bad])
  useEffect(() => {
    if (nonFinite) devWarn('BillingPrice: `monthly` / `yearly` must be finite numbers; a missing price shows as "—".')
  }, [nonFinite])
  const round = useCallback((v: number) => Math.round(v * 10 ** fd) / 10 ** fd, [fd])
  /* between the two prices while the thumb moves; with one price missing, jump at the halfway point */
  const at = useCallback(
    (p: number) => (m !== null && y !== null ? round(m + (y - m) * p) : p < 0.5 ? m : y),
    [m, y, round],
  )
  const [value, setValue] = useState<number | null>(() => at(Math.min(1, Math.max(0, progress.get()))))

  useEffect(() => {
    // progress changes every frame of a drag/spring; only the rounded value is state,
    // so React re-renders just when a shown digit actually changes
    let last: number | null | undefined
    const update = () => {
      const next = at(Math.min(1, Math.max(0, progress.get())))
      if (next === last) return
      last = next
      setValue(next)
    }
    update()
    return progress.on('change', update)
  }, [progress, at])

  /* split into keyed parts: digits keyed by place so columns stay put; the number itself is one
     left-to-right run, so right-to-left pages keep its digit order */
  const parts = value === null ? [] : fmt.formatToParts(value)
  const intDigits = parts.filter(p => p.type === 'integer').reduce((n, p) => n + p.value.length, 0)
  const isNum = (t: string) => t === 'integer' || t === 'group' || t === 'decimal' || t === 'fraction'
  const numberStart = parts.findIndex(p => isNum(p.type))
  let numberEnd = -1
  parts.forEach((p, i) => {
    if (isNum(p.type)) numberEnd = i
  })
  let seenInt = 0
  let seenFrac = 0
  const seen: Record<string, number> = {}
  type Node = { key: string; node: ReactNode; digit?: boolean }
  const pre: Node[] = []
  const num: Node[] = []
  const post: Node[] = []
  const digitNode = (ch: string, key: string, place: number): Node => {
    const d = glyphs.indexOf(ch)
    // a glyph outside the digit set (should not happen): show it as it is
    return d < 0 ? { key, node: ch } : { key, digit: true, node: <Digit key={key} d={d} place={place} reduced={reduced} glyphs={glyphs} /> }
  }
  parts.forEach((part, idx) => {
    const side = idx < numberStart ? pre : idx > numberEnd ? post : num
    if (part.type === 'integer') {
      for (const ch of Array.from(part.value)) {
        const place = intDigits - 1 - seenInt++
        side.push(digitNode(ch, `i${place}`, place))
      }
    } else if (part.type === 'fraction') {
      for (const ch of Array.from(part.value)) {
        const k = seenFrac++
        side.push(digitNode(ch, `f${k}`, -1 - k))
      }
    } else if (part.type === 'group') {
      side.push({ key: `g${intDigits - seenInt}`, node: part.value })
    } else {
      // count repeats (e.g. a space and a direction mark both after the number) so keys stay unique and stable
      const base = `${part.type}-${side === pre ? 'pre' : side === post ? 'post' : 'num'}`
      const n = (seen[base] = (seen[base] ?? -1) + 1)
      side.push({ key: n ? `${base}-${n}` : base, node: part.value })
    }
  })

  const finalValue = period === 'yearly' ? y : m
  const suffixText = typeof suffix === 'string' ? suffix : suffix?.[period]
  const showCompare = compare && period === 'yearly' && m !== null && y !== null && y < m

  /* auto-fit: a price wider than its container shrinks (down to 45%) instead of spilling out */
  const rootRef = useRef<HTMLSpanElement>(null)
  const measureRef = useRef<HTMLSpanElement>(null)
  const [fit, setFit] = useState(1)
  /* the old price sits above the number; with no room there (it would cover the text above) it
     goes beside the price instead */
  const [wasBeside, setWasBeside] = useState(false)
  const widest = [m, y].filter((v): v is number => v !== null).map(v => fmt.format(v)).sort((a, b) => b.length - a.length)[0] ?? '—'
  useEffect(() => {
    const root = rootRef.current
    const probe = measureRef.current
    const box = root?.parentElement
    if (!root || !probe || !box) return
    const check = () => {
      const cs = getComputedStyle(box)
      const avail = box.clientWidth - parseFloat(cs.paddingLeft) - parseFloat(cs.paddingRight)
      const natural = probe.offsetWidth
      const next = natural > 0 && avail > 0 && natural > avail ? Math.max(0.45, Math.floor((avail / natural) * 100) / 100) : 1
      setFit(f => (f === next ? f : next))
      // free space above the price: up to the previous visible element, or the padding of the
      // nearest ancestor that starts with it
      const top = root.getBoundingClientRect().top
      let above = Infinity
      for (let el: Element = root; el.parentElement && el !== document.body; el = el.parentElement) {
        let prev = el.previousElementSibling
        while (prev && (getComputedStyle(prev).position === 'absolute' || getComputedStyle(prev).position === 'fixed' || !prev.getClientRects().length))
          prev = prev.previousElementSibling
        if (prev) {
          above = top - prev.getBoundingClientRect().bottom
          break
        }
        const pcs = getComputedStyle(el.parentElement)
        if (parseFloat(pcs.paddingTop) + parseFloat(pcs.borderTopWidth) > 0 || pcs.overflow !== 'visible') {
          above = top - el.parentElement.getBoundingClientRect().top - parseFloat(pcs.borderTopWidth)
          break
        }
      }
      // the old price is ~0.4em tall (0.32em text on a 1.2 line) and wants a little air above it
      const beside = above < parseFloat(getComputedStyle(root).fontSize) * 0.44 + 6
      setWasBeside(b => (b === beside ? b : beside))
    }
    check()
    const ro = new ResizeObserver(check)
    ro.observe(box)
    return () => ro.disconnect()
  }, [widest])

  const sym = (n: Node) =>
    n.digit ? (
      n.node
    ) : (
      <motion.span
        key={n.key}
        className="bp-sym"
        initial={reduced ? false : { opacity: 0, width: 0 }}
        animate={{ opacity: 1, width: 'auto' }}
        exit={{ opacity: 0, width: 0 }}
        transition={{ duration: 0.25, ease: EASE_OUT }}
      >
        {n.node}
      </motion.span>
    )

  return (
    <span ref={rootRef} className={['bp-root', className].filter(Boolean).join(' ')} style={style} data-was={wasBeside ? 'beside' : undefined}>
      <PricingStyles />
      <span className="bp-sr">
        {finalValue === null ? '—' : fmt.format(finalValue)}
        {suffixText ? ` ${suffixText}` : ''}
        {showCompare ? `, was ${fmt.format(m)}` : ''}
      </span>
      {/* the widest of the two prices at full size, for auto-fit */}
      <span ref={measureRef} className="bp-num bp-measure" aria-hidden>{widest}</span>
      <span className="bp-num" aria-hidden style={fit < 1 ? { fontSize: `${fit}em` } : undefined}>
        {value === null ? (
          <span className="bp-sym">—</span>
        ) : (
          <>
            {/* default mode: exiting columns collapse their own width, no popLayout (Digit takes no ref) */}
            <AnimatePresence initial={false}>{pre.map(sym)}</AnimatePresence>
            <span className="bp-digits">
              <AnimatePresence initial={false}>{num.map(sym)}</AnimatePresence>
            </span>
            <AnimatePresence initial={false}>{post.map(sym)}</AnimatePresence>
          </>
        )}
      </span>
      {suffixText && (
        <span className="bp-suffix" aria-hidden dir="auto">
          <Morph text={suffixText} reduced={reduced} />
        </span>
      )}
      <AnimatePresence initial={false}>
        {showCompare && (
          <motion.span
            key="was"
            className="bp-was"
            aria-hidden
            initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
            transition={{ duration: 0.28, ease: EASE_OUT, delay: reduced ? 0 : 0.15 }}
          >
            {fmt.format(m ?? 0)}
            <motion.i
              className="bp-strike"
              initial={reduced ? false : { scaleX: 0 }}
              animate={{ scaleX: 1 }}
              exit={{ scaleX: 0 }}
              transition={{ duration: 0.34, ease: EASE_OUT, delay: reduced ? 0 : 0.3 }}
            />
          </motion.span>
        )}
      </AnimatePresence>
    </span>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Text that differs per period                                              */
/* ────────────────────────────────────────────────────────────────────────── */

/** Props of `<BillingText>`. */
export type BillingTextProps = {
  /** Text on monthly. */
  monthly: string
  /** Text on yearly. */
  yearly: string
  /** Extra class on the root (`.bt-root`). */
  className?: string
  /** Inline styles on the root. */
  style?: CSSProperties
}

/**
 * A line of plain text that differs per period. Words both lines share glide
 * into place; the rest roll out and in. Must be inside `<Billing>`.
 */
export function BillingText({ monthly, yearly, className, style }: BillingTextProps) {
  const { period, reduced } = useBillingContext('BillingText')
  const text = period === 'yearly' ? yearly : monthly
  return (
    <span className={['bt-root', className].filter(Boolean).join(' ')} style={style}>
      <PricingStyles />
      <span className="bp-sr">{text}</span>
      <span aria-hidden dir="auto">
        <Morph text={text} reduced={reduced} />
      </span>
    </span>
  )
}

type Word = { id: number; text: string }
let wordId = 0

/** LCS word diff: shared words keep identity and glide, the rest roll. */
function diffWords(prev: Word[], words: string[]): Word[] {
  const a = prev.map(w => w.text)
  const m = a.length
  const n = words.length
  const dp = Array.from({ length: m + 1 }, () => new Array<number>(n + 1).fill(0))
  for (let i = m - 1; i >= 0; i--)
    for (let j = n - 1; j >= 0; j--) dp[i][j] = a[i] === words[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1])
  const out: Word[] = []
  let i = 0
  let j = 0
  while (j < n) {
    if (i < m && a[i] === words[j]) {
      out.push(prev[i])
      i++
      j++
    } else if (i < m && dp[i + 1][j] >= dp[i][j + 1]) i++
    else out.push({ id: ++wordId, text: words[j++] })
  }
  return out
}

const roll: Variants = {
  in: ({ reduced }: { i: number; reduced: boolean }) => (reduced ? { opacity: 0 } : { y: '105%', opacity: 0 }),
  show: ({ i, reduced }: { i: number; reduced: boolean }) => ({
    y: 0,
    opacity: 1,
    transition: reduced ? { duration: 0.15 } : { type: 'spring', visualDuration: 0.3, bounce: 0.2, delay: Math.min(i * 0.014, 0.3) },
  }),
  out: ({ i, reduced }: { i: number; reduced: boolean }) =>
    reduced ? { opacity: 0, transition: { duration: 0.1 } } : { y: '-105%', opacity: 0, transition: { duration: 0.15, ease: EASE_OUT, delay: Math.min(i * 0.006, 0.15) } },
}

const Morph = memo(function Morph({ text, reduced }: { text: string; reduced: boolean }) {
  // diff against the previous text's words, derived during render (no ref reads)
  const [diffed, setDiffed] = useState(() => ({ text, words: diffWords([], text.split(/\s+/).filter(Boolean)) }))
  let words = diffed.words
  if (diffed.text !== text) {
    words = diffWords(diffed.words, text.split(/\s+/).filter(Boolean))
    setDiffed({ text, words })
  }
  return (
    <span className="bt-line">
      <AnimatePresence mode="popLayout" initial={false}>
        {words.map((w, wi) => (
          <motion.span
            key={w.id}
            className="bt-word"
            layout={reduced ? false : 'position'}
            initial="in"
            animate="show"
            exit="out"
            transition={{ layout: { type: 'spring', visualDuration: 0.36, bounce: 0.16 } }}
          >
            {glyphsOf(w.text + (wi < words.length - 1 ? ' ' : '')).map((ch, i) => (
              <motion.span key={i} className="bt-ch" variants={roll} custom={{ i, reduced }}>
                {ch}
              </motion.span>
            ))}
          </motion.span>
        ))}
      </AnimatePresence>
    </span>
  )
})

/* ────────────────────────────────────────────────────────────────────────── */
/* Styles — injected once, hoisted by React 19                               */
/* ────────────────────────────────────────────────────────────────────────── */

function PricingStyles() {
  return (
    <style href="pricing-toggle" precedence="medium">
      {CSS}
    </style>
  )
}

const CSS = /* css */ `
.bs-root, .bp-root, .bt-root {
  --_ink: var(--pricing-toggle-ink, var(--ui-ink, #17140f));
  --_pill: var(--ui-radius-pill, 999px);
  --_surface: var(--pricing-toggle-surface, var(--ui-surface, #fbf8f1));
  --_accent: var(--pricing-toggle-accent, var(--ui-accent, #d4452b));
  --_line: color-mix(in oklab, var(--_ink) 13%, transparent);
  --_muted: color-mix(in oklab, var(--_ink) 52%, transparent);
}
.bp-sr {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap;
}

/* switch */
.bs-root {
  position: relative; display: inline-flex; align-items: center; gap: 2px; padding: 4px;
  /* never wider than its container: when the text does not fit on one line it wraps (data-wrap, set in JS) */
  max-width: 100%; min-width: 0;
  border-radius: var(--_pill); border: 1px solid var(--_line);
  background: color-mix(in oklab, var(--_ink) 5%, transparent);
  color: var(--_ink); font: inherit;
  user-select: none; -webkit-user-select: none; touch-action: pan-y;
  -webkit-tap-highlight-color: transparent;
}
.bs-thumb {
  position: absolute; top: 4px; bottom: 4px; left: 0; border-radius: var(--_pill);
  background: var(--_surface);
  box-shadow: 0 0 0 1px var(--_line), 0 1px 3px light-dark(rgb(0 0 0 / 0.1), rgb(0 0 0 / 0.03));
  cursor: grab;
}
.bs-root:active .bs-thumb { cursor: grabbing; }
.bs-root .bs-seg {
  position: relative; z-index: 1; display: inline-flex; align-items: center; gap: 8px;
  height: 34px; padding: 0 16px; margin: 0; border: 0; border-radius: var(--_pill);
  background: none; cursor: pointer; font: inherit; font-size: 14px; font-weight: 550; line-height: 1;
  white-space: nowrap; flex: 0 1 auto; min-width: 0;
}
.bs-label { flex: 0 6 auto; min-width: 0; overflow: hidden; text-overflow: ellipsis; padding-block: 0.2em; margin-block: -0.2em; }
/* too long for one line (long translations, narrow columns): the two segments share the width and
   wrap their text, so nothing is ever cut off */
.bs-root[data-wrap] { display: flex; width: 100%; align-items: stretch; }
/* a pill radius on a two-line segment turns it into a blob: cap the corners while wrapped */
.bs-root[data-wrap], .bs-root[data-wrap] .bs-seg, .bs-root[data-wrap] .bs-thumb { border-radius: min(var(--_pill), 14px); }
.bs-root[data-wrap] .bs-seg, .bs-root[data-wrap] .bs-thumb { border-radius: min(var(--_pill), 10px); }
.bs-root[data-wrap] .bs-seg {
  flex: 1 1 0; flex-direction: column; justify-content: center; gap: 5px;
  height: auto; min-height: 34px; padding: 7px 10px; white-space: normal; text-align: center; line-height: 1.2;
}
.bs-root[data-wrap] .bs-seg[data-period="yearly"] { padding-right: 10px; }
.bs-root[data-wrap] .bs-label { overflow: visible; text-wrap: balance; overflow-wrap: anywhere; padding-block: 0; margin-block: 0; }
/* the badge keeps overflow: hidden, so its sheen stays inside it (the text wraps, so nothing is cut) */
.bs-root[data-wrap] .bs-badge { border-radius: min(var(--_pill), 8px); max-width: 100%; white-space: normal; text-wrap: balance; overflow-wrap: anywhere; }
.bs-seg[data-period="monthly"] { color: color-mix(in oklab, var(--_ink) calc(48% + (1 - var(--p, 0)) * 52%), transparent); }
.bs-seg[data-period="yearly"] { color: color-mix(in oklab, var(--_ink) calc(48% + var(--p, 0) * 52%), transparent); padding-right: 6px; }
.bs-seg:focus-visible { outline: 2px solid var(--_accent); outline-offset: 2px; }
@media (pointer: coarse) { .bs-root .bs-seg { height: 44px; min-width: 44px; justify-content: center; } }
.bs-badge {
  position: relative; display: inline-block; overflow: hidden; text-overflow: ellipsis;
  flex: 0 1 auto; min-width: 3.6em; max-width: 16em; white-space: nowrap;
  padding: 3px 8px; border-radius: var(--_pill);
  font-size: 11.5px; font-weight: 650; letter-spacing: 0.01em;
  color: var(--_accent);
  background: color-mix(in oklab, var(--_accent) calc(9% + var(--p, 0) * 7%), transparent);
  transform-origin: 20% 60%;
}
.bs-badge-icon { display: inline; vertical-align: -1px; margin-right: 4px; }
.bs-sheen {
  --_glint: light-dark(rgb(255 255 255 / 0.65), color-mix(in oklab, var(--_accent) 50%, transparent));
  position: absolute; inset: -2px 0; pointer-events: none;
  background: linear-gradient(105deg, transparent 32%, var(--_glint) 50%, transparent 68%);
}

/* price */
.bp-root {
  position: relative; display: inline-flex; align-items: baseline; flex-wrap: wrap; gap: 0 0.28em;
  max-width: 100%; min-width: 0;
  font-variant-numeric: tabular-nums;
}
.bp-num { display: inline-flex; align-items: flex-start; line-height: ${LINE}; white-space: nowrap; }
/* numbers read left to right in every script: keeps "120" from turning into "021" in RTL pages */
.bp-digits { display: inline-flex; align-items: flex-start; direction: ltr; unicode-bidi: isolate; }
.bp-measure { position: absolute; left: 0; top: 0; visibility: hidden; pointer-events: none; }
.bp-col { position: relative; display: inline-block; height: ${LINE}em; overflow: hidden; text-align: center; }
.bp-col[data-rolling] { mask-image: linear-gradient(transparent, #000 18%, #000 82%, transparent); }
.bp-still { display: block; height: ${LINE}em; line-height: ${LINE}; }
.bp-strip { display: flex; flex-direction: column; align-items: center; }
.bp-strip > span { height: ${LINE}em; line-height: ${LINE}; }
.bp-sym { display: inline-block; overflow: hidden; height: ${LINE}em; white-space: pre; }
.bp-suffix { min-width: 0; max-width: 100%; font-size: 0.36em; font-weight: 500; color: var(--_muted); letter-spacing: 0; overflow-wrap: anywhere; }
.bp-was {
  /* sits above the price, out of flow: appearing never shifts the layout */
  position: absolute; left: calc(0.04em - 2px); bottom: 100%; margin-bottom: 0.06em;
  font-size: 0.32em; font-weight: 500; line-height: 1.2; white-space: nowrap;
  /* padding keeps the strike's overhang inside the clip */
  max-width: calc(100% / 0.32); overflow: hidden; text-overflow: ellipsis; padding-inline: 2px;
  color: var(--_muted); letter-spacing: 0;
}
.bp-root[data-was="beside"] .bp-was { position: relative; left: auto; bottom: auto; margin: 0; }
.bp-strike {
  position: absolute; left: 0; right: 0; top: 54%; height: 1.5px; border-radius: 1px;
  background: color-mix(in oklab, var(--_accent) 80%, transparent); transform-origin: 0 50%;
}

/* morphing text */
/* words wrap between each other; a word longer than the line breaks between its letters */
.bt-line { display: inline; }
.bt-root { min-width: 0; max-width: 100%; overflow-wrap: anywhere; }
.bt-word { position: relative; display: inline-block; vertical-align: top; overflow: hidden; max-width: 100%; }
.bt-ch { display: inline-block; vertical-align: top; white-space: pre; }
`

export default Billing
