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
 * FAQ — the accordion every landing page has, done properly.
 *
 * Answers open on a spring with a line drawn down their edge; the plus
 * folds into a minus. Every question has a link: open one and the URL
 * points to it, paste that URL and the page lands on the answer, already open.
 * Browser find-in-page (⌘F) searches closed answers too and opens the match.
 * Optional search filters as you type and highlights what matched.
 *
 * Functional:
 *   - FAQPage JSON-LD for Google rich results (on by default)
 *   - deep links, "Copy link" on every open answer (hidden with hashLinks={false});
 *     generated anchor ids are scoped per instance, your own `id`s are used as-is
 *   - single or multiple open, default-open items; in single mode the answer
 *     that closes above the clicked one closes in place (no page scroll), and only
 *     its off-screen part is made up by scrolling, so nothing on screen jumps
 *   - hidden="until-found" on closed answers, so ⌘F and search engines see them
 *   - JSX answers need `text` to be searchable and in the JSON-LD (dev warning)
 *   - `contactHref` goes through a URL allow-list (http(s), mailto, tel, relative)
 *
 * Accessible: headings wrap real buttons with aria-expanded / aria-controls,
 * answers are labelled regions, ↑ ↓ Home End move between questions.
 * Reduced motion: panels open instantly.
 *
 * Corners follow --ui-radius, --ui-radius-sm (see Theming → Corners).
 * Theme via library tokens (--ui-ink, --ui-surface, --ui-accent) or
 * --faq-* overrides.
 *
 * Requires: react >= 19, motion >= 11.
 */
import { AnimatePresence, motion } from 'motion/react'
import {
  Children,
  cloneElement,
  createElement,
  isValidElement,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type CSSProperties,
  type KeyboardEvent,
  type ReactNode,
} from 'react'

/* Icons: Iconoir (MIT, © 2021 Luca Burgio, iconoir.com), inlined so the component stays dependency-free. */
const UI_ICONS = {
  'search': [['path', { d: 'M17 17L21 21' }], ['path', { d: 'M3 11C3 15.4183 6.58172 19 11 19C13.213 19 15.2161 18.1015 16.6644 16.6493C18.1077 15.2022 19 13.2053 19 11C19 6.58172 15.4183 3 11 3C6.58172 3 3 6.58172 3 11Z' }]],
  'link': [['path', { d: 'M14 11.9976C14 9.5059 11.683 7 8.85714 7C8.52241 7 7.41904 7.00001 7.14286 7.00001C4.30254 7.00001 2 9.23752 2 11.9976C2 14.376 3.70973 16.3664 6 16.8714C6.36756 16.9525 6.75006 16.9952 7.14286 16.9952' }], ['path', { d: 'M10 11.9976C10 14.4893 12.317 16.9952 15.1429 16.9952C15.4776 16.9952 16.581 16.9952 16.8571 16.9952C19.6975 16.9952 22 14.7577 22 11.9976C22 9.6192 20.2903 7.62884 18 7.12383C17.6324 7.04278 17.2499 6.99999 16.8571 6.99999' }]],
  'check': [['path', { d: 'M5 13L9 17L19 7' }]],
  'xmark': [['path', { d: 'M6.75827 17.2426L12.0009 12M17.2435 6.75736L12.0009 12M12.0009 12L6.75827 6.75736M12.0009 12L17.2435 17.2426' }]],
  'chat-bubble': [['path', { d: 'M17 12.5C17.2761 12.5 17.5 12.2761 17.5 12C17.5 11.7239 17.2761 11.5 17 11.5C16.7239 11.5 16.5 11.7239 16.5 12C16.5 12.2761 16.7239 12.5 17 12.5Z', fill: 'currentColor' }], ['path', { d: 'M12 12.5C12.2761 12.5 12.5 12.2761 12.5 12C12.5 11.7239 12.2761 11.5 12 11.5C11.7239 11.5 11.5 11.7239 11.5 12C11.5 12.2761 11.7239 12.5 12 12.5Z', fill: 'currentColor' }], ['path', { d: 'M7 12.5C7.27614 12.5 7.5 12.2761 7.5 12C7.5 11.7239 7.27614 11.5 7 11.5C6.72386 11.5 6.5 11.7239 6.5 12C6.5 12.2761 6.72386 12.5 7 12.5Z', fill: 'currentColor' }], ['path', { d: 'M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 13.8214 2.48697 15.5291 3.33782 17L2.5 21.5L7 20.6622C8.47087 21.513 10.1786 22 12 22Z' }]],
} as const satisfies Record<string, readonly (readonly [string, Record<string, string>])[]>

type UiIconName = keyof typeof UI_ICONS

function UiIcon({ name, size = 16, className }: { name: UiIconName; size?: number; className?: string }) {
  return (
    <svg className={['ui-icon', className].filter(Boolean).join(' ')} viewBox="0 0 24 24" width={size} height={size} fill="none" stroke="currentColor" strokeWidth={1.6} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      {UI_ICONS[name].map(([tag, attrs], i) => createElement(tag, { key: i, ...attrs }))}
    </svg>
  )
}

/** One question and its answer. */
export type FaqItem = {
  /** The question. Also the button label, and the source of the default anchor id. */
  q: string
  /** The answer. A string, or any React content (paragraphs, lists, links). */
  a: ReactNode
  /**
   * Anchor id, used for deep links and `defaultOpen`. Used as the heading's DOM
   * id exactly as given, so it is the stable way to link to an answer (keep it
   * unique on the page). Without it the id is a slug of the question
   * (`faq-how-do-refunds-work`, what `defaultOpen` takes) that is scoped per
   * FAQ instance in the DOM and URL (`faq-<instance>-how-do-refunds-work`), so
   * two FAQs never share an id; a URL hash with the plain slug still opens it.
   * Repeated ids get `-2`, `-3`… appended.
   */
  id?: string
  /**
   * Plain-text answer for search and JSON-LD. Required in practice when `a`
   * isn't a string: without it that answer can't be found by the search field
   * and is left out of the FAQPage JSON-LD (a dev-only console warning says so).
   */
  text?: string
  /** Small icon before the question (decorative, 16px). */
  icon?: ReactNode
}

/** Props for {@link Faq}. */
export type FaqProps = {
  /**
   * The questions, in display order. Items with a blank `q` or `a` are left out
   * (dev warning); an empty list renders nothing, not even the search field.
   */
  items: FaqItem[]
  /**
   * One answer open at a time, or any number.
   * @default 'single'
   */
  type?: 'single' | 'multiple'
  /**
   * Ids open on first render (the `id` or generated `faq-…` slug). With
   * `type="single"` only the first is used. Read once, on mount.
   * @default []
   */
  defaultOpen?: string[]
  /**
   * Show a search field that filters questions and answers and highlights matches in both.
   * @default false
   */
  searchable?: boolean
  /**
   * Placeholder and accessible label of the search field.
   * @default 'Search questions'
   */
  searchPlaceholder?: string
  /**
   * With `searchable`: ⌘F (Ctrl+F) and / jump to the search field while the FAQ is on screen.
   * ⌘F again, from inside the field, opens the browser's own find, which still reaches closed answers.
   * @default true
   */
  searchShortcut?: boolean
  /**
   * Accessible name of the button that clears the search.
   * @default 'Clear search'
   */
  clearLabel?: string
  /**
   * Emit FAQPage structured data for search engines.
   * @default true
   */
  schema?: boolean
  /**
   * Keep the URL hash in sync with the open answer, and open from it on load.
   * Off also hides "Copy link" (the copied link couldn't open the answer).
   * @default true
   */
  hashLinks?: boolean
  /**
   * Heading level for each question, to fit the page's outline.
   * @default 3
   */
  headingLevel?: 2 | 3 | 4 | 5 | 6
  /**
   * Link shown when a search finds nothing. Omit to show no link. Only
   * http(s):, mailto:, tel: and relative URLs are rendered; anything else
   * (javascript:, data:, protocol-relative `//host`) hides the link.
   */
  contactHref?: string
  /**
   * Text of the `contactHref` link.
   * @default 'Ask us instead'
   */
  contactLabel?: string
  /** Extra class on the root (`.fq-root`). */
  className?: string
  /** Inline styles on the root, for example `--faq-accent`. */
  style?: CSSProperties
}

const EASE_OUT = [0.23, 1, 0.32, 1] as const
// One curve for opening and closing: when one answer closes as another opens,
// the heights trade evenly and nothing below wobbles.
const SWAP = { duration: 0.46, ease: [0.32, 0.72, 0, 1] as const }

// Default anchor id: lowercase, accents stripped (NFKD, then drop combining marks),
// every other run of characters becomes one dash, capped at 64 characters.
const slug = (s: string) =>
  'faq-' +
  s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64)

/** Allow-list for `contactHref`: http(s), mailto, tel and relative paths. Protocol-relative (`//host`) and other schemes are rejected. */
function safeHref(href?: string): string | undefined {
  if (!href) return undefined
  const v = href.trim()
  // browsers ignore tabs, newlines and control characters inside a scheme ("java\nscript:")
  // oxlint-disable-next-line no-control-regex -- stripping control characters is the point
  const probe = v.replace(/[\u0000-\u0020\u007f]/g, '')
  if (/^(https?|mailto|tel):/i.test(probe)) return v
  if (/^[/\\]{2}/.test(probe)) return undefined // "//host", "/\host": another origin
  if (/^[a-z][a-z0-9+.-]*:/i.test(probe)) return undefined // javascript:, data:, …
  return v
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

/** Nothing to show: empty or whitespace-only text, or no content at all. */
const isBlank = (v: ReactNode) => v == null || v === false || v === true || (typeof v === 'string' && !v.trim())

const count = new Intl.NumberFormat('en-US')

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Highlights matches inside any answer: plain strings, and the text inside elements (paragraphs, lists,
 * links) at any depth. Elements keep their props; only their text children change.
 */
function highlightNode(node: ReactNode, query: string): ReactNode {
  if (!query) return node
  if (typeof node === 'string') return <Highlight text={node} query={query} />
  if (Array.isArray(node)) return Children.map(node, (n) => highlightNode(n, query))
  if (isValidElement<{ children?: ReactNode }>(node) && node.props.children != null)
    return cloneElement(node, undefined, highlightNode(node.props.children, query))
  return node
}

/** Wraps every case-insensitive match of `query` in `<mark>`; odd split parts are the captured matches. */
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query) return <>{text}</>
  const parts = text.split(new RegExp(`(${escapeRe(query)})`, 'ig'))
  return (
    <>
      {parts.map((p, i) =>
        i % 2 ? (
          <mark key={i} className="fq-mark">
            {p}
          </mark>
        ) : (
          p
        ),
      )}
    </>
  )
}

const noopSubscribe = () => () => {}
const isMac = () => /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent)

/**
 * Accordion of questions with deep links, find-in-page support, optional
 * search and FAQPage JSON-LD.
 */
export function Faq({
  items,
  type = 'single',
  defaultOpen = [],
  searchable = false,
  searchPlaceholder = 'Search questions',
  searchShortcut = true,
  clearLabel = 'Clear search',
  schema = true,
  hashLinks = true,
  headingLevel = 3,
  contactHref,
  contactLabel = 'Ask us instead',
  className,
  style,
}: FaqProps) {
  const reduced = useSyncExternalStore(subscribeReduced, getReduced, getServerReduced)
  const uid = useId().replace(/[^a-zA-Z0-9_-]/g, '')
  // instance prefix for generated anchors, kept short and URL-friendly ("r1")
  const scope = uid.replace(/[^a-zA-Z0-9]/g, '')
  const entries = useMemo(() => {
    // two questions can slug the same: suffix repeats so keys and ids stay unique
    const seen = new Map<string, number>()
    return items
      .map((it, i) => {
        // a question with no letters or digits (emoji only) still gets a readable id
        const generated = slug(it.q)
        const base = it.id ?? (generated === 'faq-' ? `faq-question-${i + 1}` : generated)
        const n = (seen.get(base) ?? 0) + 1
        seen.set(base, n)
        const key = n > 1 ? `${base}-${n}` : base
        // DOM id + URL hash: your own id as-is; a generated slug gets this instance's prefix
        const anchor = it.id ? key : `faq-${scope}-${key.slice('faq-'.length)}`
        return { ...it, key, anchor, plain: it.text ?? (typeof it.a === 'string' ? it.a : '') }
      })
      // a blank question would be a nameless button, a blank answer an empty panel: leave them out
      .filter(e => !isBlank(e.q) && !isBlank(e.a))
  }, [items, scope])

  const skipped = items.filter(it => isBlank(it.q) || isBlank(it.a)).length
  useEffect(() => {
    if (skipped) devWarn(`[Faq] ${skipped} item(s) with a blank \`q\` or \`a\` are not shown.`)
  }, [skipped])

  /* JSX answers without `text` silently drop out of search and JSON-LD: say so in development */
  useEffect(() => {
    const missing = entries.filter(e => !e.plain && typeof e.a === 'object' && e.a !== null)
    if (!missing.length || (!searchable && !schema)) return
    devWarn(
      `[Faq] ${missing.length} answer(s) are not plain strings and have no \`text\`, so ${
        searchable && schema ? 'search and the FAQPage JSON-LD skip them' : searchable ? 'search skips them' : 'the FAQPage JSON-LD skips them'
      }. Add \`text\` to: ${missing.map(e => JSON.stringify(e.q)).join(', ')}`,
    )
  }, [entries, searchable, schema])
  const keysKey = entries.map(e => e.key).join('|')
  const [open, setOpen] = useState<string[]>(() => (type === 'single' ? defaultOpen.slice(0, 1) : defaultOpen))
  const [query, setQuery] = useState('')
  const rootRef = useRef<HTMLDivElement>(null)
  const searchRef = useRef<HTMLInputElement>(null)
  /* the shortcut hint names the right key; only known after mount (server and first render agree) */
  const mac = useSyncExternalStore(noopSubscribe, isMac, () => null)

  /* ⌘F or / on the page jumps to this FAQ's search when it's on screen; ⌘F in the field is the browser's */
  useEffect(() => {
    if (!searchable || !searchShortcut) return
    const onKey = (e: globalThis.KeyboardEvent) => {
      const input = searchRef.current
      const root = rootRef.current
      if (!input || !root || e.defaultPrevented || e.isComposing) return
      const find = e.key.toLowerCase() === 'f' && (e.metaKey || e.ctrlKey) && !e.altKey && !e.shiftKey
      const t = e.target as HTMLElement | null
      const typing = !!t && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))
      const slash = e.key === '/' && !e.metaKey && !e.ctrlKey && !e.altKey && !typing
      if (!find && !slash) return
      if (document.activeElement === input) return
      const r = root.getBoundingClientRect()
      if (r.bottom <= 0 || r.top >= innerHeight) return
      e.preventDefault()
      input.focus()
      input.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [searchable, searchShortcut])
  const [copied, setCopied] = useState<string | null>(null)
  const buttons = useRef(new Map<string, HTMLButtonElement>())
  const panels = useRef(new Map<string, HTMLDivElement>())
  const copyTimer = useRef(0)

  const q = query.trim()
  const visible = useMemo(() => {
    if (!q) return entries
    const needle = q.toLowerCase()
    return entries.filter(e => e.q.toLowerCase().includes(needle) || e.plain.toLowerCase().includes(needle))
  }, [entries, q])

  // hidden="until-found" gives the panel size containment (height 0), so it
  // must come off before motion measures the open height
  const reveal = (key: string) => panels.current.get(key)?.removeAttribute('hidden')

  const toggle = (key: string, force?: boolean) => {
    if (force ?? !open.includes(key)) reveal(key)
    setOpen(cur => {
      const isOpen = cur.includes(key)
      const next = force ?? !isOpen
      if (next === isOpen) return cur
      if (!next) return cur.filter(k => k !== key)
      return type === 'single' ? [key] : [...cur, key]
    })
  }

  // Listeners below read the latest render through this, so they subscribe
  // once instead of re-binding on every new items array or open change.
  const live = useRef({ entries, open, reduced, toggle })
  useEffect(() => {
    live.current = { entries, open, reduced, toggle }
  })

  /* URL ↔ open answer; re-runs only when the set of questions changes */
  useEffect(() => {
    if (!hashLinks) return
    const fromHash = () => {
      let hash = window.location.hash.slice(1)
      try {
        hash = decodeURIComponent(hash)
      } catch {
        /* malformed escape: match it as written */
      }
      const { entries, reduced, toggle } = live.current
      // the scoped anchor, or the plain slug / your id
      const id = entries.find(e => e.anchor === hash || e.key === hash)?.key
      if (!id) return
      toggle(id, true)
      setTimeout(
        () => buttons.current.get(id)?.scrollIntoView({ block: 'start', behavior: reduced ? 'auto' : 'smooth' }),
        60,
      )
    }
    fromHash()
    window.addEventListener('hashchange', fromHash)
    return () => window.removeEventListener('hashchange', fromHash)
  }, [hashLinks, keysKey])

  /* When an answer above the clicked question closes, only the part of it that is
     scrolled out of view (above the top edge) is made up by scrolling. The part you
     can see closes in place, so the page never scrolls under you: compensating a
     visible collapse moved everything else on the page by the answer's height on
     every click. ResizeObserver fires after layout and before paint, so each frame
     is corrected before anyone sees it. */
  const anchor = (key: string, closing: string[]) => {
    const el = buttons.current.get(key)
    if (!el) return
    let scroller: HTMLElement | null = el.parentElement
    while (scroller && !(/(auto|scroll)/.test(getComputedStyle(scroller).overflowY) && scroller.scrollHeight > scroller.clientHeight))
      scroller = scroller.parentElement
    const target = scroller ?? document.scrollingElement
    if (!target) return
    const top = scroller ? scroller.getBoundingClientRect().top : 0
    const below = el.getBoundingClientRect().top
    // each closing panel above the question: its start height and how much of it is out of view
    const watched = closing
      .map(k => panels.current.get(k))
      .filter((p): p is HTMLDivElement => !!p && p.getBoundingClientRect().bottom <= below)
      .map(p => {
        const r = p.getBoundingClientRect()
        return { p, h: r.height, hidden: Math.max(0, Math.min(r.height, top - r.top)) }
      })
      .filter(w => w.hidden > 0.5)
    if (!watched.length) return
    let done = 0
    const hold = () => {
      const want = watched.reduce((s, w) => s + Math.min(w.hidden, w.h - w.p.getBoundingClientRect().height), 0)
      if (Math.abs(want - done) > 0.5) {
        target.scrollTop -= want - done
        done = want
      }
    }
    const ro = new ResizeObserver(hold)
    watched.forEach(w => ro.observe(w.p))
    setTimeout(() => ro.disconnect(), reduced ? 60 : 700)
  }

  const onToggle = (key: string, hashId: string) => {
    const willOpen = !open.includes(key)
    // only matters when something above is closing
    if (willOpen && type === 'single' && open.length) anchor(key, open)
    toggle(key)
    if (hashLinks) {
      const url = willOpen ? `#${hashId}` : window.location.pathname + window.location.search
      history.replaceState(history.state, '', url) // keep routers' state (e.g. React Router's key)
    }
  }

  /* ⌘F finds text in closed answers; the browser fires beforematch to open them */
  useEffect(() => {
    const cleanups: (() => void)[] = []
    panels.current.forEach((el, key) => {
      if (!live.current.open.includes(key)) el.setAttribute('hidden', 'until-found')
      const onMatch = () => live.current.toggle(key, true)
      el.addEventListener('beforematch', onMatch)
      cleanups.push(() => el.removeEventListener('beforematch', onMatch))
    })
    return () => cleanups.forEach(fn => fn())
  }, [visible])

  useEffect(() => () => clearTimeout(copyTimer.current), [])

  const copyLink = async (key: string, hashId: string) => {
    const url = `${window.location.origin}${window.location.pathname}${window.location.search}#${hashId}`
    try {
      await navigator.clipboard.writeText(url)
      setCopied(key)
      clearTimeout(copyTimer.current)
      copyTimer.current = window.setTimeout(() => setCopied(null), 1600)
    } catch {
      /* clipboard blocked */
    }
  }

  const onQuestionKey = (e: KeyboardEvent<HTMLButtonElement>, key: string) => {
    const keys = visible.map(v => v.key)
    const i = keys.indexOf(key)
    let next = -1
    if (e.key === 'ArrowDown') next = Math.min(keys.length - 1, i + 1)
    else if (e.key === 'ArrowUp') next = Math.max(0, i - 1)
    else if (e.key === 'Home') next = 0
    else if (e.key === 'End') next = keys.length - 1
    if (next < 0) return
    e.preventDefault()
    buttons.current.get(keys[next])?.focus()
  }

  const jsonLd = useMemo(() => {
    if (!schema) return null
    const mainEntity = entries
      .filter(e => e.plain)
      .map(e => ({ '@type': 'Question', name: e.q, acceptedAnswer: { '@type': 'Answer', text: e.plain } }))
    if (!mainEntity.length) return null
    // escape "<" so answer text can never close the script tag
    return JSON.stringify({ '@context': 'https://schema.org', '@type': 'FAQPage', mainEntity }).replace(/</g, '\\u003c')
  }, [schema, entries])

  const anyOpen = open.length > 0

  /* screen readers get the count once typing settles, not every animated frame */
  const countText = q
    ? `${count.format(visible.length)} ${visible.length === 1 ? 'match' : 'matches'}`
    : `${count.format(entries.length)} ${entries.length === 1 ? 'question' : 'questions'}`
  const [spokenCount, setSpokenCount] = useState('')
  useEffect(() => {
    if (!q) return
    const t = setTimeout(() => setSpokenCount(countText), 350)
    return () => clearTimeout(t)
  }, [q, countText])
  const Heading = `h${headingLevel}` as 'h3'
  const contactUrl = safeHref(contactHref)

  return (
    <div ref={rootRef} className={['fq-root', className].filter(Boolean).join(' ')} style={style} data-any-open={anyOpen || undefined}>
      <FaqStyles />
      {jsonLd && <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd }} />}

      {searchable && entries.length > 0 && (
        <div className="fq-search">
          <UiIcon name="search" size={16} />
          <label className="fq-sr" htmlFor={`fq-${uid}-search`}>
            {searchPlaceholder}
          </label>
          <input
            ref={searchRef}
            id={`fq-${uid}-search`}
            type="search"
            value={query}
            placeholder={searchPlaceholder}
            onChange={e => setQuery(e.target.value)}
            onKeyDown={e => {
              if (e.key === 'Escape' && query) {
                e.preventDefault()
                setQuery('')
              }
            }}
            autoComplete="off"
            aria-keyshortcuts={searchShortcut ? 'Control+F Meta+F /' : undefined}
          />
          {searchShortcut && !query && mac !== null && (
            <kbd className="fq-kbd" aria-hidden>
              {mac ? '⌘F' : 'Ctrl F'}
            </kbd>
          )}
          <span className="fq-sr" aria-live="polite">
            {spokenCount}
          </span>
          <span className="fq-count" aria-hidden>
            <AnimatePresence mode="popLayout" initial={false}>
              <motion.span
                key={q ? `m${visible.length}` : 'all'}
                initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, y: -6 }}
                transition={{ duration: 0.18, ease: EASE_OUT }}
              >
                <bdi>{countText}</bdi>
              </motion.span>
            </AnimatePresence>
          </span>
          <AnimatePresence initial={false}>
            {query && (
              <motion.button
                key="clear"
                type="button"
                className="fq-clear"
                aria-label={clearLabel}
                onClick={() => {
                  setQuery('')
                  searchRef.current?.focus()
                }}
                initial={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={reduced ? { opacity: 0 } : { opacity: 0, scale: 0.6 }}
                transition={{ duration: 0.15, ease: EASE_OUT }}
              >
                <UiIcon name="xmark" size={14} />
              </motion.button>
            )}
          </AnimatePresence>
        </div>
      )}

      <div className="fq-list">
        <AnimatePresence initial={false}>
          {visible.map(item => {
            const isOpen = open.includes(item.key)
            const btnId = `${item.key}-q-${uid}`
            const panelId = `${item.key}-a-${uid}`
            return (
              <motion.div
                key={item.key}
                className="fq-item"
                data-open={isOpen || undefined}
                initial={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                animate={reduced ? { opacity: 1 } : { height: 'auto', opacity: 1 }}
                exit={reduced ? { opacity: 0 } : { height: 0, opacity: 0 }}
                transition={{ duration: 0.26, ease: EASE_OUT }}
              >
                <motion.span
                  className="fq-bar"
                  aria-hidden
                  initial={false}
                  animate={{ scaleY: isOpen ? 1 : 0 }}
                  transition={reduced ? { duration: 0 } : isOpen ? { ...SWAP, delay: 0.06 } : { duration: 0.2, ease: EASE_OUT }}
                />
                <Heading className="fq-h" id={item.anchor}>
                  <button
                    ref={el => {
                      if (el) buttons.current.set(item.key, el)
                      else buttons.current.delete(item.key)
                    }}
                    id={btnId}
                    type="button"
                    className="fq-q"
                    aria-expanded={isOpen}
                    aria-controls={panelId}
                    onClick={() => onToggle(item.key, item.anchor)}
                    onKeyDown={e => onQuestionKey(e, item.key)}
                  >
                    {item.icon && (
                      <span className="fq-q-icon" aria-hidden>
                        {item.icon}
                      </span>
                    )}
                    <span className="fq-q-text" dir="auto">
                      <Highlight text={item.q} query={q} />
                    </span>
                    <span className="fq-icon" aria-hidden>
                      <motion.i
                        className="fq-icon-v"
                        initial={false}
                        animate={{ scaleY: isOpen ? 0 : 1, rotate: isOpen ? 90 : 0 }}
                        transition={reduced ? { duration: 0 } : { type: 'spring', visualDuration: 0.34, bounce: 0.35 }}
                      />
                      <i className="fq-icon-h" />
                    </span>
                  </button>
                </Heading>
                <motion.div
                  ref={el => {
                    if (el) panels.current.set(item.key, el as HTMLDivElement)
                    else panels.current.delete(item.key)
                  }}
                  id={panelId}
                  role="region"
                  aria-labelledby={btnId}
                  className="fq-panel"
                  initial={false}
                  animate={{ height: isOpen ? 'auto' : 0 }}
                  transition={reduced ? { duration: 0 } : SWAP}
                  onAnimationComplete={() => {
                    // closed answers stay findable by ⌘F and crawlers, but out of the a11y tree
                    if (!isOpen) panels.current.get(item.key)?.setAttribute('hidden', 'until-found')
                  }}
                >
                  <motion.div
                    className="fq-a"
                    initial={false}
                    animate={isOpen ? { opacity: 1, y: 0 } : { opacity: 0, y: reduced ? 0 : -6 }}
                    // closing text leaves before the panel clips it; opening text settles in behind the height
                    transition={reduced ? { duration: 0 } : isOpen ? { duration: 0.32, ease: EASE_OUT, delay: 0.12 } : { duration: 0.14, ease: EASE_OUT }}
                  >
                    <div className="fq-a-body" dir="auto">
                      {highlightNode(item.a, q)}
                    </div>
                    {hashLinks && (
                      <button type="button" className="fq-link" onClick={() => copyLink(item.key, item.anchor)} tabIndex={isOpen ? 0 : -1}>
                        <UiIcon name={copied === item.key ? 'check' : 'link'} size={14} />
                        <span aria-live="polite">{copied === item.key ? 'Link copied' : 'Copy link'}</span>
                      </button>
                    )}
                  </motion.div>
                </motion.div>
              </motion.div>
            )
          })}
        </AnimatePresence>

        <AnimatePresence initial={false}>
          {q && visible.length === 0 && (
            <motion.p
              key="empty"
              className="fq-empty"
              initial={reduced ? { opacity: 0 } : { opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
            >
              No questions match “{q}”.
              {contactUrl && (
                <>
                  {' '}
                  <a href={contactUrl}>
                    <UiIcon name="chat-bubble" size={13} className="fq-ask-icon" />
                    {contactLabel}
                  </a>
                </>
              )}
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </div>
  )
}

/* ────────────────────────────────────────────────────────────────────────── */
/* Styles — injected once, hoisted by React 19                               */
/* ────────────────────────────────────────────────────────────────────────── */

function FaqStyles() {
  return (
    <style href="faq" precedence="medium">
      {CSS}
    </style>
  )
}

const CSS = /* css */ `
.fq-root {
  /* we anchor the clicked question ourselves; the browser's anchoring would fight it */
  overflow-anchor: none;
  container-type: inline-size;
  --_ink: var(--faq-ink, var(--ui-ink, #17140f));
  --_radius: var(--faq-radius, var(--ui-radius, 16px));
  --_radius-sm: var(--ui-radius-sm, 8px);
  --_surface: var(--faq-surface, var(--ui-surface, #fbf8f1));
  --_accent: var(--faq-accent, var(--ui-accent, #d4452b));
  --_line: color-mix(in oklab, var(--_ink) 13%, transparent);
  --_muted: color-mix(in oklab, var(--_ink) 58%, transparent);
  color: var(--_ink);
  -webkit-tap-highlight-color: transparent;
}
.fq-sr {
  position: absolute; width: 1px; height: 1px; margin: -1px; padding: 0; border: 0;
  overflow: hidden; clip: rect(0 0 0 0); white-space: nowrap;
}

.fq-search {
  position: relative; display: flex; align-items: center; gap: 10px;
  height: 44px; padding: 0 14px; margin-bottom: 8px;
  border: 1px solid var(--_line); border-radius: calc(var(--_radius) * 0.75); background: var(--_surface);
  transition: border-color 150ms ease;
}
.fq-search:focus-within { border-color: color-mix(in oklab, var(--_ink) 40%, transparent); }
.fq-search svg { flex: none; width: 16px; height: 16px; fill: none; stroke: var(--_muted); stroke-width: 1.5; stroke-linecap: round; }
.fq-root .fq-search input {
  flex: 1; min-width: 0; height: 100%; margin: 0; padding: 0; border: 0; outline: none; background: none;
  font: inherit; font-size: 14.5px; color: var(--_ink); appearance: none;
}
.fq-search input::placeholder { color: color-mix(in oklab, var(--_ink) 42%, transparent); }
.fq-search input::-webkit-search-cancel-button { appearance: none; }
.fq-kbd {
  flex: none; padding: 1px 6px; border: 1px solid var(--_line); border-radius: calc(var(--_radius-sm, 8px) * 0.625);
  font: inherit; font-size: 11px; line-height: 16px; color: var(--_muted);
}
.fq-search:focus-within .fq-kbd { display: none; }
@media (hover: none) { .fq-kbd { display: none; } }
.fq-root .fq-clear {
  position: relative; flex: none; display: grid; place-items: center; width: 24px; height: 24px; margin: 0 -6px 0 0; padding: 0;
  border: 0; border-radius: 50%; background: color-mix(in oklab, var(--_ink) 8%, transparent); color: var(--_muted); cursor: pointer;
}
.fq-root .fq-clear:hover { color: var(--_ink); background: color-mix(in oklab, var(--_ink) 14%, transparent); }
.fq-clear:focus-visible { outline: 2px solid var(--_accent); outline-offset: 2px; }
.fq-clear svg { width: 14px; height: 14px; stroke: currentColor; stroke-width: 1.6; }
@media (pointer: coarse) { .fq-root .fq-clear::after { content: ''; position: absolute; inset: -10px; } }
.fq-q-icon { display: grid; place-items: center; flex: none; align-self: flex-start; width: 18px; height: 1.4em; margin-right: -6px; color: var(--_muted); }
.fq-q-icon svg { width: 16px; height: 16px; }
.fq-count { position: relative; flex: none; height: 18px; overflow: hidden; font-size: 12px; line-height: 18px; color: var(--_muted); font-variant-numeric: tabular-nums; }
.fq-count > span { display: inline-block; white-space: nowrap; }

.fq-list { position: relative; }
.fq-item { position: relative; overflow: hidden; border-bottom: 1px solid var(--_line); }
.fq-bar {
  position: absolute; left: 0; top: 14px; bottom: 16px; width: 2px; border-radius: 2px;
  background: var(--_accent); transform-origin: 50% 0;
}
.fq-root .fq-h { margin: 0; padding: 0; font: inherit; }
.fq-root .fq-q {
  display: flex; align-items: center; gap: 16px; width: 100%;
  padding: 18px 4px 18px 16px; margin: 0; border: 0; background: none; cursor: pointer;
  text-align: left; font: inherit; font-size: 15.5px; font-weight: 550; line-height: 1.4; letter-spacing: -0.005em;
  color: var(--_ink); transition: color 200ms ease;
}
.fq-root[data-any-open] .fq-item:not([data-open]) .fq-q { color: color-mix(in oklab, var(--_ink) 72%, transparent); }
.fq-root .fq-q:hover { color: var(--_ink); }
.fq-q:focus-visible { outline: 2px solid var(--_accent); outline-offset: -2px; border-radius: var(--_radius-sm); }
.fq-q-text { flex: 1; min-width: 0; max-inline-size: var(--faq-measure, 70ch); text-wrap: pretty; overflow-wrap: anywhere; text-align: start; }
.fq-icon { position: relative; flex: none; width: 14px; height: 14px; }
.fq-icon i { position: absolute; left: 50%; top: 50%; border-radius: 1px; background: currentColor; }
.fq-icon-h { width: 12px; height: 1.6px; margin: -0.8px 0 0 -6px; }
.fq-icon-v { width: 1.6px; height: 12px; margin: -6px 0 0 -0.8px; }

.fq-panel { overflow: hidden; }
.fq-a { padding: 0 44px 18px 16px; }
.fq-a-body { min-width: 0; max-inline-size: var(--faq-measure, 70ch); font-size: 14.5px; line-height: 1.6; color: color-mix(in oklab, var(--_ink) 78%, transparent); text-wrap: pretty; overflow-wrap: anywhere; }
/* code never pushes the answer wider than the list: inline code breaks, a block scrolls sideways */
.fq-a-body code { overflow-wrap: anywhere; }
.fq-a-body pre { max-width: 100%; overflow-x: auto; overflow-wrap: normal; }
/* narrow: code wraps instead of hiding behind a sideways scroll, and the count gives the field its room */
@container (max-width: 480px) {
  .fq-a-body pre { white-space: pre-wrap; overflow-wrap: anywhere; }
}
@container (max-width: 340px) {
  .fq-count { display: none; }
}
.fq-a-body pre code { overflow-wrap: normal; }
.fq-a-body img, .fq-a-body video, .fq-a-body table { max-width: 100%; }
.fq-a-body > :first-child { margin-top: 0; }
.fq-a-body > :last-child { margin-bottom: 0; }
.fq-a-body a { color: var(--_ink); text-underline-offset: 3px; }
.fq-root .fq-link {
  display: inline-flex; align-items: center; gap: 6px; margin: 12px 0 0 -6px; padding: 4px 6px;
  border: 0; border-radius: calc(var(--_radius-sm) * 0.75); background: none; cursor: pointer;
  /* 12px text: a step darker than --_muted, so it clears 4.5:1 on the page */
  font: inherit; font-size: 12px; color: color-mix(in oklab, var(--_ink) 68%, transparent);
  transition: color 150ms ease, background-color 150ms ease;
}
.fq-root .fq-link:hover { color: var(--_ink); background: color-mix(in oklab, var(--_ink) 5%, transparent); }
.fq-link:focus-visible { outline: 2px solid var(--_accent); outline-offset: 1px; }
.fq-link svg { width: 14px; height: 14px; fill: none; stroke: currentColor; stroke-width: 1.4; stroke-linecap: round; stroke-linejoin: round; }

.fq-mark {
  color: inherit; border-radius: calc(var(--_radius-sm) * 0.375); padding: 0 1px;
  background: linear-gradient(color-mix(in oklab, var(--_accent) 22%, transparent), color-mix(in oklab, var(--_accent) 22%, transparent)) no-repeat 0 0 / 100% 100%;
  animation: fq-sweep 320ms cubic-bezier(0.23, 1, 0.32, 1);
}
@keyframes fq-sweep { from { background-size: 0% 100%; } }
.fq-empty { margin: 0; padding: 22px 16px; font-size: 14px; color: var(--_muted); text-wrap: pretty; overflow-wrap: anywhere; }
.fq-empty a { color: var(--_ink); text-underline-offset: 3px; }
.fq-ask-icon { display: inline; vertical-align: -2px; margin-right: 4px; }

@media (prefers-reduced-motion: reduce) {
  .fq-mark { animation: none; }
}
/* touch: 44px targets (WCAG AAA) where they fit; visual sizes on mouse and trackpad are unchanged */
@media (pointer: coarse) {
  .fq-root input { min-block-size: 44px; }
}
`

export default Faq
