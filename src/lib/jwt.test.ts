import { describe, expect, it } from 'vitest'
import { isJwtExpired } from './jwt'

function token(payload: unknown): string {
  const b64 = btoa(JSON.stringify(payload)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `h.${b64}.s`
}

describe('isJwtExpired', () => {
  const nowSec = Math.floor(Date.now() / 1000)
  it('is false for a token valid well into the future', () => {
    expect(isJwtExpired(token({ exp: nowSec + 3600 }))).toBe(false)
  })
  it('is true for a past exp', () => {
    expect(isJwtExpired(token({ exp: nowSec - 10 }))).toBe(true)
  })
  it('respects the skew window', () => {
    expect(isJwtExpired(token({ exp: nowSec + 30 }))).toBe(true)
    expect(isJwtExpired(token({ exp: nowSec + 30 }), 0)).toBe(false)
  })
  it('treats malformed tokens and missing exp as expired', () => {
    expect(isJwtExpired('garbage')).toBe(true)
    expect(isJwtExpired('a.!!!.c')).toBe(true)
    expect(isJwtExpired(token({}))).toBe(true)
    expect(isJwtExpired(token({ exp: 'soon' }))).toBe(true)
  })
})
