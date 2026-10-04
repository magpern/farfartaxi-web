import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, fireEvent, screen } from '@testing-library/react'
import { Clock24hTimePicker } from './Clock24hTimePicker'

const props = {
  open: true,
  onClose: vi.fn(),
  onConfirm: vi.fn(),
  initialHour: 9,
  initialMinute: 0,
  title: 'Välj tid',
  cancelLabel: 'Avbryt',
  okLabel: 'OK',
  keyboardAria: 'Tangentbord',
  keyboardHourLabel: 'Timme',
  keyboardMinuteLabel: 'Minut'
}

// Dial geometry in viewBox units (centre 120,120; outer ring r=88, inner ring r=58).
const at = (angleDeg: number, r: number) => {
  const a = ((angleDeg - 90) * Math.PI) / 180
  return { clientX: 120 + r * Math.cos(a), clientY: 120 + r * Math.sin(a) }
}

function setup() {
  const utils = render(<Clock24hTimePicker {...props} />)
  const svg = utils.container.querySelector('svg.mtp-clock') as SVGSVGElement
  // jsdom has no layout: pretend the clock is rendered 1:1 at the page origin.
  svg.getBoundingClientRect = () =>
    ({ left: 0, top: 0, right: 240, bottom: 240, width: 240, height: 240, x: 0, y: 0, toJSON: () => ({}) }) as DOMRect
  const [hourBtn, minuteBtn] = Array.from(utils.container.querySelectorAll('.mtp-digital-seg')) as HTMLButtonElement[]
  const press = (p: { clientX: number; clientY: number }) => fireEvent.pointerDown(svg, { ...p, pointerId: 1, button: 0, pointerType: 'touch' })
  const move = (p: { clientX: number; clientY: number }) => fireEvent.pointerMove(svg, { ...p, pointerId: 1, pointerType: 'touch' })
  const lift = () => fireEvent.pointerUp(svg, { pointerId: 1, pointerType: 'touch' })
  const cancel = () => fireEvent.pointerCancel(svg, { pointerId: 1, pointerType: 'touch' })
  return { svg, hourBtn, minuteBtn, press, move, lift, cancel }
}

describe('Clock24hTimePicker touch dragging', () => {
  beforeEach(() => {
    props.onConfirm.mockClear()
    props.onClose.mockClear()
  })

  it('declares that it owns touch gestures so the browser does not scroll or cancel the drag', () => {
    const { svg } = setup()
    expect(svg.style.touchAction).toBe('none')
  })

  it('follows the finger across hours and stays on the hour dial until the finger is lifted', () => {
    const { hourBtn, minuteBtn, press, move, lift } = setup()
    press(at(90, 88)) // 3 o'clock, outer ring -> 3
    expect(hourBtn.textContent).toBe('03')
    move(at(180, 88)) // 6 o'clock -> 6
    expect(hourBtn.textContent).toBe('06')
    move(at(270, 88)) // 9 o'clock -> 9
    expect(hourBtn.textContent).toBe('09')
    expect(hourBtn.className).toContain('mtp-digital-active') // still choosing the hour mid-drag
    expect(minuteBtn.className).not.toContain('mtp-digital-active')
    lift()
    expect(hourBtn.textContent).toBe('09') // keeps the hour it ended on
    expect(minuteBtn.className).toContain('mtp-digital-active') // then moves on to the minutes
  })

  it('selects the inner ring (12-23) and keeps tracking when the finger leaves the dial', () => {
    const { hourBtn, press, move } = setup()
    press(at(0, 58)) // top, inner ring -> 12
    expect(hourBtn.textContent).toBe('12')
    move(at(90, 58)) // 3 o'clock inner -> 15
    expect(hourBtn.textContent).toBe('15')
    move(at(180, 130)) // outside the face, 6 o'clock -> outer ring -> 6
    expect(hourBtn.textContent).toBe('06')
  })

  it('drags the minute hand continuously, even outside the minute ring', () => {
    const { minuteBtn, press, move, lift } = setup()
    press(at(0, 80)); lift() // pick hour 0 and advance to minutes
    expect(minuteBtn.className).toContain('mtp-digital-active')
    press(at(90, 80)) // 3 o'clock -> 15
    expect(minuteBtn.textContent).toBe('15')
    move(at(180, 80)) // 30
    expect(minuteBtn.textContent).toBe('30')
    move(at(270, 150)) // far outside the ring: still follows -> 45
    expect(minuteBtn.textContent).toBe('45')
    lift()
    expect(minuteBtn.textContent).toBe('45')
    expect(minuteBtn.className).toContain('mtp-digital-active') // stays on minutes after the last drag
  })

  it('can go back to the hour dial from the header and re-pick', () => {
    const { hourBtn, minuteBtn, press, lift } = setup()
    press(at(90, 88)); lift()
    expect(minuteBtn.className).toContain('mtp-digital-active')
    fireEvent.click(hourBtn)
    expect(hourBtn.className).toContain('mtp-digital-active')
    press(at(180, 88)); lift()
    expect(hourBtn.textContent).toBe('06')
  })

  it('ignores touches in the dead zone at the centre and moves without a press', () => {
    const { hourBtn, press, move } = setup()
    move(at(90, 88)) // no press yet: nothing happens
    expect(hourBtn.textContent).toBe('09')
    press({ clientX: 120, clientY: 121 }) // centre cap
    expect(hourBtn.textContent).toBe('09')
  })

  it('a cancelled gesture keeps the value but stays on the hour dial', () => {
    const { hourBtn, minuteBtn, press, move, cancel } = setup()
    press(at(90, 88))
    move(at(180, 88))
    cancel()
    expect(hourBtn.textContent).toBe('06')
    expect(hourBtn.className).toContain('mtp-digital-active')
    expect(minuteBtn.className).not.toContain('mtp-digital-active')
  })

  it('confirms the dragged time', () => {
    const { press, move, lift } = setup()
    press(at(90, 88)); move(at(180, 88)); lift() // hour 6
    press(at(90, 80)); lift() // minute 15
    fireEvent.click(screen.getByText('OK'))
    expect(props.onConfirm).toHaveBeenCalledWith(6, 15)
    expect(props.onClose).toHaveBeenCalled()
  })
})
