/// <reference types="vite/client" />
/// <reference types="vite-plugin-pwa/client" />

declare global {
  /** Chromium “Add to Home Screen” / install banner flow */
  interface BeforeInstallPromptEvent extends Event {
    readonly platforms: string[]
    readonly userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
    prompt(): Promise<void>
  }

  interface WindowEventMap {
    beforeinstallprompt: BeforeInstallPromptEvent
  }
}

export {}
