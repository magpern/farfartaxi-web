import { useEffect, useState, type PointerEvent as ReactPointerEvent } from 'react'

const CX = 120
const CY = 120
const R_OUT = 88
const R_IN = 58
/** Minute selection ring inner / outer radius (donut). */
const R_MIN_IN = 38
const R_MIN_OUT = 100

type Mode = 'hour' | 'minute'

export type Clock24hTimePickerProps = {
  open: boolean
  onClose: () => void
  onConfirm: (hour: number, minute: number) => void
  initialHour: number
  initialMinute: number
  title: string
  cancelLabel: string
  okLabel: string
  keyboardAria: string
  keyboardHourLabel: string
  keyboardMinuteLabel: string
}

function pad2(n: number) {
  return String(n).padStart(2, '0')
}

function hourDialPosition(h: number) {
  const slot = h % 12
  const angle = (-Math.PI / 2) + (slot * Math.PI) / 6
  const r = h < 12 ? R_OUT : R_IN
  return {
    x: CX + r * Math.cos(angle),
    y: CY + r * Math.sin(angle),
    angle,
    handX: CX + (r - 10) * Math.cos(angle),
    handY: CY + (r - 10) * Math.sin(angle)
  }
}

function minuteFromPointer(clientX: number, clientY: number, svg: SVGSVGElement): number | null {
  const pt = svg.createSVGPoint()
  pt.x = clientX
  pt.y = clientY
  const ctm = svg.getScreenCTM()
  if (!ctm) return null
  const loc = pt.matrixTransform(ctm.inverse())
  const dx = loc.x - CX
  const dy = loc.y - CY
  const dist = Math.hypot(dx, dy)
  if (dist < R_MIN_IN || dist > R_MIN_OUT) return null
  const deg = (Math.atan2(dy, dx) * 180) / Math.PI
  const normalized = (deg + 90 + 360) % 360
  return Math.round((normalized / 360) * 60) % 60
}

export function Clock24hTimePicker({
  open,
  onClose,
  onConfirm,
  initialHour,
  initialMinute,
  title,
  cancelLabel,
  okLabel,
  keyboardAria,
  keyboardHourLabel,
  keyboardMinuteLabel
}: Clock24hTimePickerProps) {
  const [mode, setMode] = useState<Mode>('hour')
  const [hour, setHour] = useState(initialHour)
  const [minute, setMinute] = useState(initialMinute)
  const [keyboardMode, setKeyboardMode] = useState(false)
  const [kbdH, setKbdH] = useState('')
  const [kbdM, setKbdM] = useState('')

  useEffect(() => {
    if (open) {
      setHour(initialHour)
      setMinute(initialMinute)
      setMode('hour')
      setKeyboardMode(false)
      setKbdH(pad2(initialHour))
      setKbdM(pad2(initialMinute))
    }
  }, [open, initialHour, initialMinute])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [open])

  if (!open) return null

  function handleHourPick(h: number) {
    setHour(h)
    setMode('minute')
  }

  function onClockPointerDown(e: ReactPointerEvent<SVGSVGElement>) {
    if (mode !== 'minute') return
    const m = minuteFromPointer(e.clientX, e.clientY, e.currentTarget)
    if (m !== null) setMinute(m)
  }

  function confirm() {
    if (keyboardMode) {
      let h = parseInt(kbdH, 10)
      let mm = parseInt(kbdM, 10)
      if (Number.isNaN(h)) h = 0
      if (Number.isNaN(mm)) mm = 0
      h = Math.min(23, Math.max(0, h))
      mm = Math.min(59, Math.max(0, mm))
      onConfirm(h, mm)
    } else {
      onConfirm(hour, minute)
    }
    onClose()
  }

  const hp = hourDialPosition(hour)
  const minuteAngle = (-Math.PI / 2) + (minute / 60) * Math.PI * 2
  const minHandLen = 82

  const minuteTicks = [0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55]

  return (
    <div className="mtp-backdrop" role="presentation" onClick={onClose}>
      <div
        className="mtp-sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="mtp-title">{title}</h2>

        {!keyboardMode ? (
          <>
            <div className="mtp-digital">
              <button
                type="button"
                className={mode === 'hour' ? 'mtp-digital-seg mtp-digital-active' : 'mtp-digital-seg'}
                onClick={() => setMode('hour')}
              >
                {pad2(hour)}
              </button>
              <span className="mtp-digital-colon">:</span>
              <button
                type="button"
                className={mode === 'minute' ? 'mtp-digital-seg mtp-digital-active' : 'mtp-digital-seg'}
                onClick={() => setMode('minute')}
              >
                {pad2(minute)}
              </button>
            </div>

            <svg
              className="mtp-clock"
              viewBox="0 0 240 240"
              onPointerDown={onClockPointerDown}
            >
              <circle cx={CX} cy={CY} r={112} className="mtp-clock-face" />

              {mode === 'hour' &&
                Array.from({ length: 24 }, (_, h) => {
                  const { x, y } = hourDialPosition(h)
                  const active = h === hour
                  return (
                    <g key={h}>
                      <circle
                        cx={x}
                        cy={y}
                        r={active ? 22 : 20}
                        className={active ? 'mtp-hour-bubble mtp-hour-bubble-active' : 'mtp-hour-bubble'}
                        onPointerDown={(e) => {
                          e.stopPropagation()
                          handleHourPick(h)
                        }}
                      />
                      <text
                        x={x}
                        y={y + 5}
                        textAnchor="middle"
                        className={active ? 'mtp-hour-text mtp-hour-text-active' : 'mtp-hour-text'}
                        pointerEvents="none"
                      >
                        {h}
                      </text>
                    </g>
                  )
                })}

              {mode === 'minute' &&
                minuteTicks.map((mm) => {
                  const ang = (-Math.PI / 2) + (mm / 60) * Math.PI * 2
                  const x = CX + 90 * Math.cos(ang)
                  const y = CY + 90 * Math.sin(ang)
                  const active = minute === mm
                  return (
                    <text
                      key={mm}
                      x={x}
                      y={y + 4}
                      textAnchor="middle"
                      className={active ? 'mtp-minute-tick mtp-minute-tick-active' : 'mtp-minute-tick'}
                      pointerEvents="none"
                    >
                      {pad2(mm)}
                    </text>
                  )
                })}

              {mode === 'hour' && (
                <line
                  x1={CX}
                  y1={CY}
                  x2={hp.handX}
                  y2={hp.handY}
                  className="mtp-hand"
                />
              )}
              {mode === 'minute' && (
                <line
                  x1={CX}
                  y1={CY}
                  x2={CX + minHandLen * Math.cos(minuteAngle)}
                  y2={CY + minHandLen * Math.sin(minuteAngle)}
                  className="mtp-hand"
                />
              )}
              <circle cx={CX} cy={CY} r={7} className="mtp-center-cap" />
            </svg>
          </>
        ) : (
          <div className="mtp-keyboard">
            <label className="mtp-kbd-label">
              {keyboardHourLabel}
              <input
                className="mtp-kbd-input"
                value={kbdH}
                onChange={(e) => setKbdH(e.target.value.replace(/\D/g, '').slice(0, 2))}
                inputMode="numeric"
                maxLength={2}
                placeholder="00–23"
              />
            </label>
            <label className="mtp-kbd-label">
              {keyboardMinuteLabel}
              <input
                className="mtp-kbd-input"
                value={kbdM}
                onChange={(e) => setKbdM(e.target.value.replace(/\D/g, '').slice(0, 2))}
                inputMode="numeric"
                maxLength={2}
                placeholder="00–59"
              />
            </label>
          </div>
        )}

        <div className="mtp-toolbar">
          <button
            type="button"
            className="mtp-keyboard-toggle"
            aria-label={keyboardAria}
            onClick={() =>
              setKeyboardMode((k) => {
                if (!k) {
                  setKbdH(pad2(hour))
                  setKbdM(pad2(minute))
                }
                return !k
              })
            }
          >
            <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden>
              <path
                fill="currentColor"
                d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 2H5v-2h2v2zm0-3H5V8h2v2zm9 7H8v-2h8v2zm0-4h-2v-2h2v2zm0-3h-2V8h2v2zm3 3h-2v-2h2v2zm0-3h-2V8h2v2z"
              />
            </svg>
          </button>
          <div className="mtp-toolbar-actions">
            <button type="button" className="mtp-text-btn" onClick={onClose}>
              {cancelLabel}
            </button>
            <button type="button" className="mtp-text-btn mtp-text-btn-primary" onClick={confirm}>
              {okLabel}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
