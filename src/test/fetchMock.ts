import { vi } from 'vitest'

export type Route = (url: URL, init?: RequestInit) => Response | Promise<Response> | undefined

export function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } })
}
export const noContent = () => new Response(null, { status: 204 })

/** Installs a fetch mock; the first route returning a response wins. Aborts reject like real fetch. */
export function mockFetch(...routes: Route[]) {
  const fn = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(String(input), 'http://localhost')
    const signal = init?.signal
    for (const r of routes) {
      const res = r(url, init)
      if (res) {
        return new Promise<Response>((resolve, reject) => {
          const onAbort = () => reject(new DOMException('Aborted', 'AbortError'))
          if (signal?.aborted) return onAbort()
          signal?.addEventListener('abort', onAbort)
          Promise.resolve(res).then(resolve, reject)
        })
      }
    }
    return Promise.resolve(new Response('not mocked', { status: 500 }))
  })
  vi.stubGlobal('fetch', fn)
  return fn
}

export function calls(fn: ReturnType<typeof vi.fn>, path: string): URL[] {
  return fn.mock.calls.map((c) => new URL(String(c[0]), 'http://localhost')).filter((u) => u.pathname === path)
}
