/**
 * AdminUsers — full user list with role filter, search, and ban/unban actions.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion } from 'framer-motion'
import {
  Search, Shield, ShieldOff, User, Users, Briefcase, ShieldCheck,
  AlertTriangle, CheckCircle, XCircle, Clock,
} from 'lucide-react'
import { api } from '@/lib/api'
import { getErrorMessage } from '@/lib/utils'
import { toast } from 'sonner'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'
import { GlassSelect } from '@/components/glass/GlassSelect'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar'

const ROLE_CFG = {
  user:   { label: 'User',   color: 'var(--text-secondary)', bg: 'rgba(148,163,184,0.1)', icon: User },
  worker: { label: 'Worker', color: '#60a5fa', bg: 'rgba(96,165,250,0.1)',  icon: Briefcase },
  admin:  { label: 'Admin',  color: 'var(--accent)', bg: 'var(--accent-bg)',  icon: ShieldCheck },
}

function RoleBadge({ role }) {
  const cfg = ROLE_CFG[role] || ROLE_CFG.user
  const Icon = cfg.icon
  return (
    <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
      style={{ background: cfg.bg, color: cfg.color }}>
      <Icon size={9} /> {cfg.label}
    </span>
  )
}

function StatCard({ label, value, color, delay }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, type: 'spring', stiffness: 260, damping: 24 }}
      style={{
        background: 'var(--card-bg)',
        border: '1px solid var(--card-border)',
        borderRadius: 14,
        padding: '16px 18px',
      }}
    >
      <p style={{ color: 'var(--text-muted)', fontSize: 11, fontWeight: 500, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
        {label}
      </p>
      <p style={{ fontSize: 26, fontWeight: 700, fontFamily: 'monospace', color: color || 'var(--text-primary)' }}>
        {value}
      </p>
    </motion.div>
  )
}

export default function AdminUsers() {
  const qc = useQueryClient()
  const [role, setRole] = useState('')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [banTarget, setBanTarget] = useState(null)
  const [banReason, setBanReason] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'users', role, search, page],
    queryFn: () => api.get('/admin/users', {
      params: { role: role || undefined, search: search || undefined, page, limit: 25 },
    }).then(r => r.data),
    keepPreviousData: true,
  })

  const banMut = useMutation({
    mutationFn: ({ userId, reason }) => api.patch(`/admin/users/${userId}/ban`, { reason }).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      setBanTarget(null)
      setBanReason('')
      toast.success('User banned')
    },
    onError: e => toast.error(getErrorMessage(e, 'Ban failed')),
  })

  const unbanMut = useMutation({
    mutationFn: (userId) => api.patch(`/admin/users/${userId}/unban`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin', 'users'] })
      toast.success('User unbanned')
    },
    onError: e => toast.error(getErrorMessage(e, 'Unban failed')),
  })

  const items = data?.items || []
  const total = data?.total || 0
  const pages = data?.pages || 1

  function fmtDate(str) {
    if (!str) return '—'
    return new Date(str).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: '2-digit' })
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <h1 className="text-2xl font-bold font-syne" style={{ color: 'var(--text-primary)' }}>Users</h1>
        <p style={{ color: 'var(--text-muted)', fontSize: 13, marginTop: 4 }}>All registered platform accounts</p>
      </div>

      {/* Quick stats */}
      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Users" value={data?.total ?? '—'} delay={0} />
        <StatCard label="Showing" value={items.length} color="#60a5fa" delay={0.04} />
        <StatCard label="Page" value={`${page} / ${pages}`} color="#a78bfa" delay={0.08} />
      </div>

      {/* Filter row */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-muted)' }} />
          <Input
            className="pl-9"
            placeholder="Search by name or email…"
            value={search}
            onChange={e => { setSearch(e.target.value); setPage(1) }}
          />
        </div>
        <GlassSelect
          value={role}
          onChange={v => { setRole(v); setPage(1) }}
          align="right"
          options={[
            { value: '', label: 'All roles' },
            { value: 'user', label: 'Users' },
            { value: 'worker', label: 'Workers' },
            { value: 'admin', label: 'Admins' },
          ]}
        />
      </div>

      {/* Table */}
      <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 16, overflow: 'hidden' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--card-bg)' }}>
              {['User', 'Role', 'Phone', 'Status', 'Joined', 'Last Seen', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium"
                  style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              Array.from({ length: 10 }).map((_, i) => (
                <tr key={i}>
                  {Array.from({ length: 7 }).map((_, j) => (
                    <td key={j} className="px-4 py-3">
                      <Skeleton style={{ height: 14, background: 'var(--card-bg)', borderRadius: 4 }} />
                    </td>
                  ))}
                </tr>
              ))
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center" style={{ color: 'var(--text-secondary)' }}>No users found</td>
              </tr>
            ) : items.map((u, idx) => {
              const initials = (u.full_name || u.email).split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)
              return (
                <tr key={u.id}
                  style={{ borderTop: idx > 0 ? '1px solid var(--card-border)' : 'none', opacity: u.is_banned ? 0.5 : 1 }}
                  className="hover:bg-white/[0.02] transition-colors"
                >
                  {/* User */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-8 w-8 shrink-0">
                        <AvatarFallback className="text-xs font-bold"
                          style={{ background: 'var(--card-bg)', color: 'var(--text-secondary)' }}>
                          {initials}
                        </AvatarFallback>
                      </Avatar>
                      <div className="min-w-0">
                        <div className="font-medium truncate max-w-[160px]" style={{ color: 'var(--text-primary)' }}>
                          {u.full_name || '—'}
                        </div>
                        <div className="text-xs truncate max-w-[160px]" style={{ color: 'var(--text-muted)' }}>{u.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3"><RoleBadge role={u.role} /></td>
                  <td className="px-4 py-3 text-xs" style={{ color: 'var(--text-muted)' }}>{u.phone || '—'}</td>
                  <td className="px-4 py-3">
                    {u.is_banned ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(248,113,113,0.1)', color: '#f87171' }}>
                        <XCircle size={9} /> Banned
                      </span>
                    ) : u.is_active ? (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                        <CheckCircle size={9} /> Active
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full"
                        style={{ background: 'rgba(107,114,128,0.1)', color: 'var(--text-muted)' }}>
                        <AlertTriangle size={9} /> Inactive
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--text-muted)' }}>{fmtDate(u.created_at)}</td>
                  <td className="px-4 py-3 text-xs whitespace-nowrap" style={{ color: 'var(--text-secondary)' }}>{fmtDate(u.last_seen_at)}</td>
                  {/* Actions */}
                  <td className="px-4 py-3">
                    {u.role !== 'admin' && (
                      u.is_banned ? (
                        <button
                          onClick={() => unbanMut.mutate(u.id)}
                          disabled={unbanMut.isPending}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
                          style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e', border: '1px solid rgba(34,197,94,0.2)' }}
                        >
                          <Shield size={11} /> Unban
                        </button>
                      ) : (
                        <button
                          onClick={() => setBanTarget(u)}
                          className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium transition-colors"
                          style={{ background: 'rgba(248,113,113,0.08)', color: '#f87171', border: '1px solid rgba(248,113,113,0.2)' }}
                        >
                          <ShieldOff size={11} /> Ban
                        </button>
                      )
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>

        {/* Pagination */}
        {pages > 1 && (
          <div className="flex items-center justify-between px-5 py-3" style={{ borderTop: '1px solid var(--card-border)' }}>
            <span style={{ color: 'var(--text-muted)', fontSize: 12 }}>Showing {items.length} of {total} users</span>
            <div className="flex items-center gap-2">
              <button
                disabled={page <= 1}
                onClick={() => setPage(p => p - 1)}
                className="px-3 py-1 rounded-lg text-xs disabled:opacity-30"
                style={{ background: 'var(--card-bg)', color: 'var(--text-secondary)', border: '1px solid var(--card-border)' }}
              >Prev</button>
              <button
                disabled={page >= pages}
                onClick={() => setPage(p => p + 1)}
                className="px-3 py-1 rounded-lg text-xs disabled:opacity-30"
                style={{ background: 'var(--card-bg)', color: 'var(--text-secondary)', border: '1px solid var(--card-border)' }}
              >Next</button>
            </div>
          </div>
        )}
      </div>

      {/* Ban confirm dialog */}
      <AlertDialog open={!!banTarget} onOpenChange={v => !v && setBanTarget(null)}>
        <AlertDialogContent style={{ background: 'var(--bg-surface)', border: '1px solid var(--card-border)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: 'var(--text-primary)' }}>
              Ban "{banTarget?.full_name || banTarget?.email}"?
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: 'var(--text-muted)' }}>
              This will immediately block the user from logging in.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="my-2">
            <input
              className="w-full px-3 py-2 rounded-lg text-sm outline-none"
              style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--text-primary)' }}
              placeholder="Reason for ban (optional)"
              value={banReason}
              onChange={e => setBanReason(e.target.value)}
            />
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ background: 'var(--card-bg)', color: 'var(--text-secondary)', border: '1px solid var(--card-border)' }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => banMut.mutate({ userId: banTarget.id, reason: banReason })}
              style={{ background: '#ef4444', color: '#fff' }}
            >
              {banMut.isPending ? 'Banning…' : 'Ban User'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
