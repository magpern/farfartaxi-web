import { afterEach, describe, expect, it } from 'vitest'
import {
  appleMapsUrl, formatCoord, getMapChoice, googleMapsUrl, isIos, navigationUrl, resolveMapApp, setMapChoice, shortPlaceName, smsHrefWithBody
} from './navigation'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 Chrome/120 Mobile Safari/537.36'
const MAC_UA = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 Safari/605.1.15'

afterEach(() => localStorage.clear())

describe('coordinates and URLs', () => {
  it('formats with dot decimals and 6 decimals', () => {
    expect(formatCoord(59.3293)).toBe('59.329300')
    expect(formatCoord(18)).toBe('18.000000')
    expect(formatCoord(-0.1234567)).toBe('-0.123457')
  })
  it('builds the Google Maps URL', () => {
    expect(googleMapsUrl(59.3293, 18.0686)).toBe(
      'https://www.google.com/maps/dir/?api=1&destination=59.329300,18.068600&travelmode=driving'
    )
  })
  it('builds the Apple Maps URL', () => {
    expect(appleMapsUrl(59.3293, 18.0686)).toBe('https://maps.apple.com/?daddr=59.329300,18.068600&dirflg=d')
  })
  it('navigationUrl picks the app', () => {
    expect(navigationUrl('apple', 1, 2)).toContain('maps.apple.com')
    expect(navigationUrl('google', 1, 2)).toContain('google.com/maps')
  })
})

describe('iOS detection', () => {
  it('detects iPhone, iPad UA, and iPadOS posing as a Mac', () => {
    expect(isIos({ userAgent: IPHONE })).toBe(true)
    expect(isIos({ userAgent: 'Mozilla/5.0 (iPad; CPU OS 16_0 like Mac OS X)' })).toBe(true)
    expect(isIos({ userAgent: MAC_UA, platform: 'MacIntel', maxTouchPoints: 5 })).toBe(true)
  })
  it('does not treat Android or a real Mac as iOS', () => {
    expect(isIos({ userAgent: ANDROID, platform: 'Linux armv8l', maxTouchPoints: 5 })).toBe(false)
    expect(isIos({ userAgent: MAC_UA, platform: 'MacIntel', maxTouchPoints: 0 })).toBe(false)
  })
})

describe('map choice', () => {
  it('remembers and clears the choice, ignoring junk', () => {
    expect(getMapChoice()).toBeNull()
    setMapChoice('apple')
    expect(getMapChoice()).toBe('apple')
    localStorage.setItem('farfartaxi-map-app', 'bing')
    expect(getMapChoice()).toBeNull()
    setMapChoice('google')
    setMapChoice(null)
    expect(getMapChoice()).toBeNull()
  })
  it('resolves google off iOS and the choice (or null) on iOS', () => {
    expect(resolveMapApp({ userAgent: ANDROID })).toBe('google')
    expect(resolveMapApp({ userAgent: IPHONE })).toBeNull()
    setMapChoice('apple')
    expect(resolveMapApp({ userAgent: IPHONE })).toBe('apple')
    expect(resolveMapApp({ userAgent: ANDROID })).toBe('google')
  })
})

describe('text helpers', () => {
  it('shortPlaceName keeps the part before the first comma', () => {
    expect(shortPlaceName('Storgatan 5, Stockholm')).toBe('Storgatan 5')
    expect(shortPlaceName('Hem')).toBe('Hem')
    expect(shortPlaceName(', X')).toBe(', X')
  })
  it('smsHrefWithBody uses & on iOS and ? elsewhere, encoding the body', () => {
    expect(smsHrefWithBody('070-123 45 67', 'Jag är här', true)).toBe('sms:0701234567&body=Jag%20%C3%A4r%20h%C3%A4r')
    expect(smsHrefWithBody('+46701234567', 'Jag är här', false)).toBe('sms:+46701234567?body=Jag%20%C3%A4r%20h%C3%A4r')
  })
})
