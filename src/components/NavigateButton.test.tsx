import { fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { I18nProvider } from '../i18n/context'
import { getMapChoice } from '../lib/navigation'
import { ContactButtons } from './ContactButtons'
import { NavigateButton } from './NavigateButton'

const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148'
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/120 Mobile Safari/537.36'

const wrap = (ui: React.ReactElement) => {
  localStorage.setItem('farfartaxi-locale', 'sv')
  return render(<I18nProvider>{ui}</I18nProvider>)
}

afterEach(() => {
  localStorage.clear()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('NavigateButton', () => {
  it('on Android is a plain Google Maps link opening in a new tab', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ANDROID)
    wrap(<NavigateButton lat={59.3293} lon={18.0686} label="Navigera till Lisa" />)
    const a = screen.getByRole('link', { name: 'Navigera till Lisa' })
    expect(a).toHaveAttribute('href', 'https://www.google.com/maps/dir/?api=1&destination=59.329300,18.068600&travelmode=driving')
    expect(a).toHaveAttribute('target', '_blank')
    expect(a.getAttribute('rel')).toContain('noopener')
  })

  it('on iOS asks once, remembers the choice, then links straight to it', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE)
    wrap(<NavigateButton lat={59.3} lon={18.1} label="Navigera till Lisa" />)
    fireEvent.click(screen.getByRole('button', { name: 'Navigera till Lisa' }))
    expect(screen.getByText('Vilken karta vill du använda?')).toBeInTheDocument()
    const apple = screen.getByRole('link', { name: 'Apple Kartor' })
    expect(apple).toHaveAttribute('href', 'https://maps.apple.com/?daddr=59.300000,18.100000&dirflg=d')
    expect(screen.getByRole('link', { name: 'Google Maps' })).toBeInTheDocument()
    fireEvent.click(apple)
    expect(getMapChoice()).toBe('apple')
    expect(screen.queryByText('Vilken karta vill du använda?')).toBeNull()
    expect(screen.getByRole('link', { name: 'Navigera till Lisa' })).toHaveAttribute('href', expect.stringContaining('maps.apple.com'))
  })

  it('on iOS with a remembered choice does not ask', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE)
    localStorage.setItem('farfartaxi-map-app', 'google')
    wrap(<NavigateButton lat={1} lon={2} label="Navigera till Hem" />)
    expect(screen.getByRole('link', { name: 'Navigera till Hem' })).toHaveAttribute('href', expect.stringContaining('google.com/maps'))
  })
})

describe('ContactButtons', () => {
  it('shows Ring <name> as tel: and SMS with a platform-specific prefilled body', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ANDROID)
    wrap(<ContactButtons phone="070-123 45 67" name="Lisa" prefilledSms="Jag är här" callWithName />)
    expect(screen.getByRole('link', { name: 'Ring Lisa' })).toHaveAttribute('href', 'tel:0701234567')
    expect(screen.getByRole('link', { name: 'Skicka SMS till Lisa' })).toHaveAttribute('href', 'sms:0701234567?body=Jag%20%C3%A4r%20h%C3%A4r')
  })
  it('uses &body= on iOS and renders nothing without a phone', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(IPHONE)
    const { unmount } = wrap(<ContactButtons phone="0701234567" name="Lisa" prefilledSms="Jag är här" />)
    expect(screen.getByRole('link', { name: 'Skicka SMS till Lisa' }).getAttribute('href')).toContain('sms:0701234567&body=')
    unmount()
    const { container } = wrap(<ContactButtons phone={null} name="Lisa" />)
    expect(container).toBeEmptyDOMElement()
  })
  it('supports a secondary variant and a muted no-phone note on driver screens', () => {
    vi.spyOn(navigator, 'userAgent', 'get').mockReturnValue(ANDROID)
    const { unmount } = wrap(<ContactButtons phone="0701234567" name="Lisa" callWithName variant="secondary" />)
    expect(screen.getByRole('link', { name: 'Ring Lisa' })).toHaveClass('ui-btn-secondary')
    unmount()
    wrap(<ContactButtons phone={null} name="Lisa" noPhoneNote />)
    expect(screen.getByText('Inget telefonnummer sparat')).toBeInTheDocument()
  })
})
