import { useI18n } from '../i18n/context'
import { smsHref, telHref } from '../lib/rideTypes'
import { Button } from './ui/Button'

/** Ring + SMS for the other party. Plain tel:/sms: links, so they work offline and never wait on the backend. */
export function ContactButtons({
  phone,
  name,
  size = 'lg',
  prefilledSms
}: {
  phone: string | null | undefined
  name: string
  size?: 'md' | 'lg'
  prefilledSms?: string
}) {
  const { t } = useI18n()
  if (!phone) return null
  const sms = prefilledSms ? `${smsHref(phone)}?body=${encodeURIComponent(prefilledSms)}` : smsHref(phone)
  return (
    <div className="contact-buttons">
      <Button variant="primary" size={size} href={telHref(phone)} aria-label={t('contact.callAria', { name })}>
        {t('contact.call')}
      </Button>
      <Button size={size} href={sms} aria-label={t('contact.smsAria', { name })}>
        {t('contact.sms')}
      </Button>
    </div>
  )
}
