import { useEffect, useState } from 'react'
import { useI18n } from '../i18n/context'
import { api } from '../api/client'
import { useShell } from '../shell/ShellContext'

type AdminUserRow = {
  id: number
  fullName: string
  email: string
  role: string
  mustChangePassword: boolean
  hasLocalPassword: boolean
  enabled: boolean
  approved?: boolean
  createdAt?: string
}

export function AdminPage() {
  const { token, user, onToast } = useShell()
  const currentUserId = user.id
  const { t } = useI18n()
  const [users, setUsers] = useState<AdminUserRow[]>([])
  const [rideIdToDelete, setRideIdToDelete] = useState('')

  async function load() {
    const list = await api<AdminUserRow[]>('/api/admin/users', { token })
    setUsers(list)
  }

  useEffect(() => {
    load()
  // eslint-disable-next-line react-hooks/exhaustive-deps -- legacy: intentionally runs on mount only; load() is recreated each render (pre-existing)
  }, [])

  async function promoteDriver(userId: number) {
    await api(`/api/admin/users/${userId}/promote-driver`, { method: 'POST', token })
    onToast(t('admin.toastPromoted'))
    load()
  }

  async function promoteAdmin(userId: number) {
    await api(`/api/admin/users/${userId}/promote-admin`, { method: 'POST', token })
    onToast(t('admin.toastPromotedAdmin'))
    load()
  }

  async function demoteAdminToDriver(userId: number) {
    await api(`/api/admin/users/${userId}/demote-admin-to-driver`, { method: 'POST', token })
    onToast(t('admin.toastDemotedAdminToDriver'))
    load()
  }

  async function demoteToUser(userId: number) {
    await api(`/api/admin/users/${userId}/demote-user`, { method: 'POST', token })
    onToast(t('admin.toastDemoted'))
    load()
  }

  async function forcePassword(userId: number) {
    await api(`/api/admin/users/${userId}/force-password-change`, {
      method: 'POST',
      token,
      body: JSON.stringify({ mustChangePassword: true })
    })
    onToast(t('admin.toastForcePw'))
    load()
  }

  async function setBlocked(userId: number, enabled: boolean) {
    await api(`/api/admin/users/${userId}/enabled`, {
      method: 'POST',
      token,
      body: JSON.stringify({ enabled })
    })
    onToast(enabled ? t('admin.toastUnblocked') : t('admin.toastBlocked'))
    load()
  }

  async function deleteUser(userId: number) {
    if (!window.confirm(t('admin.deleteUserConfirm'))) return
    await api(`/api/admin/users/${userId}`, { method: 'DELETE', token })
    onToast(t('admin.toastUserDeleted'))
    load()
  }

  async function logoutEverywhere(userId: number) {
    if (!window.confirm(t('admin.logoutEverywhereConfirm'))) return
    try {
      await api(`/api/admin/users/${userId}/logout-everywhere`, { method: 'POST', token })
      onToast(t('admin.toastLoggedOutEverywhere'))
    } catch {
      onToast(t('admin.toastActionFailed'))
    }
  }

  async function approveUser(userId: number) {
    try {
      await api(`/api/admin/users/${userId}/approve`, { method: 'POST', token })
      onToast(t('admin.toastApproved'))
      load()
    } catch {
      onToast(t('admin.toastActionFailed'))
    }
  }

  async function rejectUser(userId: number) {
    if (!window.confirm(t('admin.rejectConfirm'))) return
    try {
      await api(`/api/admin/users/${userId}`, { method: 'DELETE', token })
      onToast(t('admin.toastRejected'))
      load()
    } catch {
      onToast(t('admin.toastActionFailed'))
    }
  }

  const pendingUsers = users.filter((u) => u.approved === false)
  const approvedUsers = users.filter((u) => u.approved !== false)

  async function deleteRide() {
    await api(`/api/admin/rides/${rideIdToDelete}`, { method: 'DELETE', token })
    onToast(t('admin.toastRideDeleted'))
  }

  return (
    <div className="subpage-wrap stack">
      {pendingUsers.length > 0 && (
        <div className="card admin-pending-card">
          <h3>
            {t('admin.pendingTitle')} ({pendingUsers.length})
          </h3>
          {pendingUsers.map((u) => (
            <article key={u.id} className="ride-item">
              <p>
                <strong>{u.fullName}</strong> ({u.email}) — {u.role}
                {u.createdAt && <span className="tiny"> {new Date(u.createdAt).toLocaleDateString()}</span>}{' '}
                <span className="tiny">[{u.hasLocalPassword ? t('admin.signInPassword') : t('admin.signInGoogle')}]</span>
              </p>
              <div className="admin-pending-actions">
                <button type="button" className="btn btn-primary" onClick={() => approveUser(u.id)}>
                  {t('admin.approve')}
                </button>
                <button type="button" className="btn btn-danger" onClick={() => rejectUser(u.id)}>
                  {t('admin.reject')}
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
      <div className="card">
        <h3>{t('admin.users')}</h3>
        {approvedUsers.map((u) => {
          const isSelf = u.id === currentUserId
          return (
            <article key={u.id} className="ride-item">
              <p>
                <strong>{u.fullName}</strong> ({u.email}) — {u.role}
                {!u.enabled && <span className="admin-badge-blocked"> {t('admin.blocked')}</span>}
                {u.mustChangePassword && u.hasLocalPassword && (
                  <span className="admin-badge-pw"> {t('admin.mustChangePwBadge')}</span>
                )}
              </p>
              <div className="row admin-user-actions">
                {u.role === 'USER' && (
                  <button type="button" className="btn" onClick={() => promoteDriver(u.id)}>
                    {t('admin.promote')}
                  </button>
                )}
                {u.role !== 'ADMIN' && (
                  <button type="button" className="btn" onClick={() => promoteAdmin(u.id)}>
                    {t('admin.promoteAdmin')}
                  </button>
                )}
                {u.role === 'ADMIN' && (
                  <button type="button" className="btn" onClick={() => demoteAdminToDriver(u.id)} disabled={isSelf}>
                    {t('admin.demoteAdminToDriver')}
                  </button>
                )}
                {(u.role === 'DRIVER' || u.role === 'ADMIN') && (
                  <button type="button" className="btn" onClick={() => demoteToUser(u.id)} disabled={isSelf}>
                    {t('admin.demote')}
                  </button>
                )}
                <button type="button" className="btn" onClick={() => logoutEverywhere(u.id)}>
                  {t('admin.logoutEverywhere')}
                </button>
                {u.hasLocalPassword && (
                  <button type="button" className="btn" onClick={() => forcePassword(u.id)}>
                    {t('admin.forcePassword')}
                  </button>
                )}
                {u.enabled ? (
                  <button
                    type="button"
                    className="btn"
                    onClick={() => setBlocked(u.id, false)}
                    disabled={isSelf}
                  >
                    {t('admin.blockUser')}
                  </button>
                ) : (
                  <button type="button" className="btn btn-primary" onClick={() => setBlocked(u.id, true)}>
                    {t('admin.unblockUser')}
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-danger"
                  onClick={() => deleteUser(u.id)}
                  disabled={isSelf}
                >
                  {t('admin.deleteUser')}
                </button>
              </div>
            </article>
          )
        })}
      </div>
      <div className="card">
        <h3>{t('admin.deleteRideTitle')}</h3>
        <input
          value={rideIdToDelete}
          onChange={(e) => setRideIdToDelete(e.target.value)}
          placeholder={t('admin.rideIdPlaceholder')}
        />
        <button className="btn btn-danger" onClick={deleteRide}>
          {t('admin.deleteRideBtn')}
        </button>
      </div>
    </div>
  )
}
