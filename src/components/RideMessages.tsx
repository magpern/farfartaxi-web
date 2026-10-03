import { useI18n } from '../i18n/context'
import { selectMessages, type RideMessage } from '../lib/rideMessages'
import { formatHm } from '../lib/time'

type Props = {
  messages: RideMessage[]
  isMine: (m: RideMessage) => boolean
  /** Name shown for the other party ("Farfar" or the passenger's first name). */
  otherName: string
  now?: number
}

export function RideMessages({ messages, isMine, otherName, now = Date.now() }: Props) {
  const { t } = useI18n()
  const shown = selectMessages(messages, isMine, now)
  if (shown.length === 0) return null
  return (
    <ul className="ride-messages" aria-label={t('messages.title')}>
      {shown.map((m) => {
        const key = `messages.${m.code}`
        const text = t(key) !== key ? t(key) : (m.text ?? '')
        return (
          <li key={m.id} className={m.highlight ? 'ride-message-new' : undefined}>
            <strong>{m.mine ? t('messages.you') : otherName}</strong>: {text}{' '}
            <span className="tiny muted">{formatHm(m.createdAt)}</span>
          </li>
        )
      })}
    </ul>
  )
}
