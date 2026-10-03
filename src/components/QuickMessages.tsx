import { useI18n } from '../i18n/context'

type Props = {
  codes: readonly string[]
  disabled?: boolean
  large?: boolean
  onSend: (code: string) => void
}

export function QuickMessages({ codes, disabled, large, onSend }: Props) {
  const { t } = useI18n()
  return (
    <div className="quick-messages" role="group" aria-label={t('messages.title')}>
      {codes.map((code) => (
        <button
          key={code}
          type="button"
          className={`btn btn-touch btn-outline ${large ? 'btn-driver' : ''}`}
          disabled={disabled}
          onClick={() => onSend(code)}
        >
          {t(`messages.${code}`)}
        </button>
      ))}
    </div>
  )
}
