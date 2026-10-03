import { describe, expect, it } from 'vitest'
import en from '../locales/en.json'
import sv from '../locales/sv.json'
import { ApiError } from '../api/client'
import { apiErrorMessage, CONFLICT_CODES, isApiCode } from './apiErrors'

const t = (key: string) => key.split('.').reduce<unknown>((o, k) => (o as Record<string, unknown>)?.[k], sv) as string

describe('apiErrorMessage', () => {
  it('maps the contract codes to friendly Swedish', () => {
    expect(apiErrorMessage(new ApiError('x', 409, 'RIDE_TAKEN'), t)).toBe('Någon annan tog resan')
    expect(apiErrorMessage(new ApiError('x', 409, 'RIDE_CANCELLED'), t)).toBe('Resan är avbokad')
    expect(apiErrorMessage(new ApiError('x', 409, 'RIDE_CHANGED'), t)).toBe('Resan har ändrats')
  })

  it('has a message in both locales for every code', () => {
    for (const code of CONFLICT_CODES) {
      expect((sv.apiErrors as Record<string, string>)[code], code).toBeTruthy()
      expect((en.apiErrors as Record<string, string>)[code], code).toBeTruthy()
    }
  })

  it('never shows raw server text or English fallbacks', () => {
    expect(apiErrorMessage(new ApiError('Boom', 500), t)).toBe('Något gick fel. Försök igen.')
    expect(apiErrorMessage(new ApiError('Request failed (400)', 400, 'WHATEVER'), t)).toBe(sv.errors.generic)
    expect(apiErrorMessage(new Error('Offline'), t)).toBe(sv.errors.generic)
    expect(apiErrorMessage('weird', t)).toBe(sv.errors.generic)
  })

  it('shows "no connection" for status 0 and network failures', () => {
    expect(apiErrorMessage(new ApiError('x', 0), t)).toBe('Ingen anslutning')
    expect(apiErrorMessage(new TypeError('Failed to fetch'), t)).toBe('Ingen anslutning')
  })

  it('isApiCode checks the code', () => {
    expect(isApiCode(new ApiError('x', 409, 'PROXIMITY_WARNING'), 'PROXIMITY_WARNING')).toBe(true)
    expect(isApiCode(new Error('x'), 'PROXIMITY_WARNING')).toBe(false)
  })
})
