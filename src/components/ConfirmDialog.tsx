import type { ReactNode } from 'react'

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

/** Minimal modal confirm; M2 replaces this with the shared ui/ConfirmDialog. */
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
          <button type="button" className="btn btn-touch btn-outline" onClick={onCancel} disabled={busy}>
            {cancelLabel}
          </button>
          <button
            type="button"
            className={`btn btn-touch ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={onConfirm}
            disabled={busy || confirmDisabled}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}
