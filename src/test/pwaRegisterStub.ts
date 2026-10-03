// Test-only stand-in for vite-plugin-pwa's `virtual:pwa-register`; tests normally vi.mock() it.
export function registerSW(): (reload?: boolean) => Promise<void> {
  return () => Promise.resolve()
}
