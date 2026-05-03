/**
 * Locale-aware number and date formatters.
 *
 * All formatters pin an explicit locale so SSR (Node.js) and the browser
 * produce identical strings and Vue hydration never sees a text mismatch.
 * Change NUM_LOCALE to switch the thousand-separator style globally.
 */

const NUM_LOCALE = 'en-US'
const DATE_LOCALE = 'en-US'

const _num = new Intl.NumberFormat(NUM_LOCALE)
const _date = new Intl.DateTimeFormat(DATE_LOCALE, {
  year: 'numeric', month: 'short', day: 'numeric',
  hour: '2-digit', minute: '2-digit',
})

export function fmtNumber(n: number): string {
  return _num.format(n)
}

export function fmtDate(d: string | number | Date): string {
  return _date.format(typeof d === 'string' || typeof d === 'number' ? new Date(d) : d)
}
