export const STOCKHOLM_TZ = 'Europe/Stockholm'

const partsFmt = new Intl.DateTimeFormat('en-CA', {
  timeZone: STOCKHOLM_TZ,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hourCycle: 'h23'
})

export type LocalParts = { year: number; month: number; day: number; hour: number; minute: number }

/** Wall-clock parts of an instant in Europe/Stockholm. */
export function stockholmParts(date: Date): LocalParts {
  const out: Record<string, number> = {}
  for (const p of partsFmt.formatToParts(date)) {
    if (p.type !== 'literal') out[p.type] = Number(p.value)
  }
  return { year: out.year, month: out.month, day: out.day, hour: out.hour % 24, minute: out.minute }
}

export type LocalToInstant =
  | { ok: true; iso: string; ambiguous: boolean }
  | { ok: false; reason: 'nonexistent' }

/**
 * Converts a Stockholm wall-clock date+time to an ISO instant.
 * Non-existent times (spring-forward gap) are rejected; ambiguous times (autumn overlap)
 * resolve to the first occurrence and are flagged.
 */
export function stockholmLocalToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number
): LocalToInstant {
  const wallAsUtc = Date.UTC(year, month - 1, day, hour, minute)
  const matches: number[] = []
  // Stockholm is UTC+1 (winter) or UTC+2 (summer); the earliest instant comes from the largest offset.
  for (const offsetMin of [120, 60]) {
    const instant = wallAsUtc - offsetMin * 60_000
    const p = stockholmParts(new Date(instant))
    if (p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute) {
      matches.push(instant)
    }
  }
  if (matches.length === 0) return { ok: false, reason: 'nonexistent' }
  return { ok: true, iso: new Date(matches[0]).toISOString(), ambiguous: matches.length > 1 }
}

const pad = (n: number) => String(n).padStart(2, '0')

export function formatYmd(parts: Pick<LocalParts, 'year' | 'month' | 'day'>): string {
  return `${parts.year}-${pad(parts.month)}-${pad(parts.day)}`
}

/** "2026-10-25 02:30" in Stockholm time. */
export function formatYmdHm(iso: string): string {
  const p = stockholmParts(new Date(iso))
  return `${formatYmd(p)} ${pad(p.hour)}:${pad(p.minute)}`
}

/** "14:30" in Stockholm time. */
export function formatHm(iso: string): string {
  const p = stockholmParts(new Date(iso))
  return `${pad(p.hour)}:${pad(p.minute)}`
}

/** Locale date+time, 24h clock, always Europe/Stockholm. */
export function formatDateTime(iso: string, dateLocale: string): string {
  return new Date(iso).toLocaleString(dateLocale, {
    timeZone: STOCKHOLM_TZ,
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false
  })
}

/** "lördag 25 okt 14:30" in Stockholm time. */
export function formatWeekdayDateTime(iso: string, dateLocale: string): string {
  const d = new Date(iso)
  const day = d.toLocaleDateString(dateLocale, {
    timeZone: STOCKHOLM_TZ,
    weekday: 'long',
    day: 'numeric',
    month: 'short'
  })
  return `${day} ${formatHm(iso)}`
}

/** "2026-10-25" for the Stockholm calendar day of an instant. */
export function stockholmDayKey(date: Date | string): string {
  return formatYmd(stockholmParts(typeof date === 'string' ? new Date(date) : date))
}
