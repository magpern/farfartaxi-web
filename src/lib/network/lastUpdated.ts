const TZ = 'Europe/Stockholm'

/** "14:32" in Europe/Stockholm. */
export function formatLastUpdated(date: Date): string {
  return new Intl.DateTimeFormat('sv-SE', {
    timeZone: TZ,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).format(date)
}
