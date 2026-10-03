import type { ReactNode } from 'react'
import { Button } from './Button'
import { useOverlayOpen } from './overlayRegistry'

type Props = {
  open: boolean
  title: string
  body?: string
  confirmLabel: string
  cancelLabel: string
  onConfirm: () => void
  onCancel: () => void
  busy?: boolean
  confirmDisabled?: boolean
  danger?: boolean
  children?: ReactNode
}

/** Modal confirm: big buttons, cancel on the left, confirm on the right. */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  busy,
  confirmDisabled,
  danger,
  children
}: Props) {
  useOverlayOpen(open)
  if (!open) return null
  return (
    <div
      className="install-modal-layer"
      role="dialog"
      aria-modal="true"
      aria-label={title}
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel()
      }}
    >
      <div className="card install-modal-card" onClick={(e) => e.stopPropagation()}>
        <h3>{title}</h3>
        {body && <p className="install-modal-lead">{body}</p>}
        {children}
        <div className="install-modal-actions">
          <Button variant="secondary" size="lg" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            variant={danger ? 'danger' : 'primary'}
            size="lg"
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
          >
            {confirmLabel}
          </Button>
        </div>
      </div>
    </div>
  )
}
