import { useI18n } from '../i18n/context'

export function HelpPage() {
  const { t, ta } = useI18n()
  return (
    <section className="card subpage-wrap">
      <div className="help-install-callout">
        <h3 className="help-install-callout-title">{t('pwa.helpCalloutTitle')}</h3>
        <p className="help-install-callout-lead">{t('pwa.helpCalloutLead')}</p>
        <ul className="install-modal-steps">
          <li>{t('pwa.manualIos')}</li>
          <li>{t('pwa.manualAndroid')}</li>
          <li>{t('pwa.manualDesktop')}</li>
        </ul>
      </div>
      <h3>{t('help.title')}</h3>
      <ul>
        {ta('help.items').map((line, i) => (
          <li key={i}>{line}</li>
        ))}
      </ul>
      <p className="tiny">{t('help.footer')}</p>
    </section>
  )
}
