import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter } from 'react-router-dom'
import { I18nProvider } from './i18n/context'
import App from './App'
import { initPwa } from './pwa'
import { initTelemetry } from './lib/telemetry'
import './style.css'

initPwa()
initTelemetry()

ReactDOM.createRoot(document.getElementById('app')!).render(
  <React.StrictMode>
    <I18nProvider>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </I18nProvider>
  </React.StrictMode>
)
