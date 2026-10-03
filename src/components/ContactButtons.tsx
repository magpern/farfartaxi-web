import { useI18n } from '../i18n/context'
import { smsHrefWithBody } from '../lib/navigation'
import { smsHref, telHref } from '../lib/rideTypes'
import { Button } from './ui/Button'

/** Ring + SMS for the other party. Plain tel:/sms: links, so they work offline and never wait on the backend. */
export function ContactButtons({
  phone,
  name,
  size = 'lg',
  prefilledSms,
  callWithName
}: {
  phone: string | null | undefined
  name: string
  size?: 'md' | 'lg'
  prefilledSms?: string
  /** Label the call button "Ring <name>" (driver screens). */
  callWithName?: boolean
}) {
  const { t } = useI18n()
  if (!phone) return null
  const sms = prefilledSms ? smsHrefWithBody(phone, prefilledSms) : smsHref(phone)
  return (
    <div className="contact-buttons">
      <Button variant="primary" size={size} href={telHref(phone)} aria-label={t('contact.callAria', { name })}>
        {callWithName ? t('contact.callName', { name }) : t('contact.call')}
      </Button>
      <Button size={size} href={sms} aria-label={t('contact.smsAria', { name })}>
        {t('contact.sms')}
      </Button>
    </div>
  )
}
