/**
 * AdminConfig — grouped platform settings panel with full CRUD.
 *
 * - If table is empty, shows "Add Setting" to seed keys manually.
 * - Each row: inline edit (click pencil) + delete (click trash).
 * - "New Setting" button always visible in header to add new keys.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Settings, Edit2, Check, X, Percent, Wallet,
  Zap, Search, Shield, AlertTriangle, ChevronDown, ChevronUp,
  Plus, Trash2,
} from 'lucide-react'
import { api } from '@/lib/api'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'

// ── Config groups & metadata ─────────────────────────────────────────
const GROUPS = [
  {
    id: 'commission',
    label: 'Commission & Revenue',
    icon: Percent,
    keys: ['commission_instant_rate', 'commission_discovery_base', 'commission_discovery_max', 'gst_rate'],
  },
  {
    id: 'payouts',
    label: 'Worker Payouts',
    icon: Wallet,
    keys: ['payout_min_amount', 'escrow_release_hours'],
  },
  {
    id: 'cancellation',
    label: 'Cancellation & Penalties',
    icon: AlertTriangle,
    keys: ['penalty_worker_cancel', 'cancellation_score_deduct', 'cancellation_score_recover', 'auto_offline_rejections', 'auto_offline_minutes'],
  },
  {
    id: 'matching',
    label: 'Matching Engine',
    icon: Zap,
    keys: ['dispatch_radius_start_km', 'dispatch_radius_max_km', 'dispatch_request_timeout_s', 'dispatch_poll_interval_ms'],
  },
  {
    id: 'search',
    label: 'Search & Ranking',
    icon: Search,
    keys: ['search_results_per_page', 'score_weight_distance', 'score_weight_rating', 'score_weight_acceptance', 'score_weight_completion', 'score_weight_response', 'score_weight_price'],
  },
  {
    id: 'limits',
    label: 'Platform Limits',
    icon: Shield,
    keys: ['otp_rate_limit_per_hour', 'loc_update_rate_limit_s', 'max_active_jobs_per_user'],
  },
]

const KEY_LABELS = {
  commission_instant_rate:    { label: 'Instant Commission',     transform: v => `${(parseFloat(v) * 100).toFixed(0)}%` },
  commission_discovery_base:  { label: 'Discovery Base Rate',    transform: v => `${(parseFloat(v) * 100).toFixed(0)}%` },
  commission_discovery_max:   { label: 'Discovery Max Rate',     transform: v => `${(parseFloat(v) * 100).toFixed(0)}%` },
  gst_rate:                   { label: 'GST on Commission',      transform: v => `${(parseFloat(v) * 100).toFixed(0)}%` },
  payout_min_amount:          { label: 'Min Payout',             transform: v => `₹${v}` },
  escrow_release_hours:       { label: 'Escrow Release Delay',   transform: v => `${v}h` },
  penalty_worker_cancel:      { label: 'Cancel Penalty',         transform: v => `₹${v}` },
  cancellation_score_deduct:  { label: 'Score Deduct on Cancel', transform: v => `-${v}` },
  cancellation_score_recover: { label: 'Score Recover per Job',  transform: v => `+${v}` },
  auto_offline_rejections:    { label: 'Rejections → Auto-Off',  transform: v => `${v} jobs` },
  auto_offline_minutes:       { label: 'Auto-Offline Duration',  transform: v => `${v} min` },
  dispatch_radius_start_km:   { label: 'Start Radius',           transform: v => `${v} km` },
  dispatch_radius_max_km:     { label: 'Max Radius',             transform: v => `${v} km` },
  dispatch_request_timeout_s: { label: 'Request Timeout',        transform: v => `${v}s` },
  dispatch_poll_interval_ms:  { label: 'Poll Interval',          transform: v => `${v}ms` },
  search_results_per_page:    { label: 'Results per Page',       transform: v => v },
  score_weight_distance:      { label: 'Distance Weight',        transform: v => `${Math.round(parseFloat(v) * 100)}%` },
  score_weight_rating:        { label: 'Rating Weight',          transform: v => `${Math.round(parseFloat(v) * 100)}%` },
  score_weight_acceptance:    { label: 'Acceptance Weight',      transform: v => `${Math.round(parseFloat(v) * 100)}%` },
  score_weight_completion:    { label: 'Completion Weight',      transform: v => `${Math.round(parseFloat(v) * 100)}%` },
  score_weight_response:      { label: 'Response Weight',        transform: v => `${Math.round(parseFloat(v) * 100)}%` },
  score_weight_price:         { label: 'Price Weight',           transform: v => `${Math.round(parseFloat(v) * 100)}%` },
  otp_rate_limit_per_hour:    { label: 'OTP Rate Limit',         transform: v => `${v}/hr` },
  loc_update_rate_limit_s:    { label: 'Location Update Limit',  transform: v => `every ${v}s` },
  max_active_jobs_per_user:   { label: 'Max Concurrent Jobs',    transform: v => `${v} jobs` },
}

// ── New Setting Dialog ───────────────────────────────────────────────
function NewSettingDialog({ open, onClose, onSave, saving }) {
  const [key, setKey] = useState('')
  const [value, setValue] = useState('')
  const [desc, setDesc] = useState('')

  function reset() { setKey(''); setValue(''); setDesc('') }

  function handleClose() { reset(); onClose() }

  function handleSave() {
    if (!key.trim() || !value.trim()) { toast.error('Key and value are required'); return }
    onSave({ key: key.trim(), value: value.trim(), description: desc.trim() || undefined }, () => {
      reset(); onClose()
    })
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>New Config Setting</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: '#64748B' }}>Key</label>
            <input
              value={key}
              onChange={e => setKey(e.target.value.toLowerCase().replace(/\s/g, '_'))}
              placeholder="e.g. commission_instant_rate"
              className="w-full px-3 py-2.5 rounded-xl text-sm font-mono outline-none"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.10)',
                color: '#F1F5F9',
              }}
            />
            <p className="text-[11px] mt-1" style={{ color: '#475569' }}>Lowercase letters and underscores only</p>
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: '#64748B' }}>Value</label>
            <input
              value={value}
              onChange={e => setValue(e.target.value)}
              placeholder="e.g. 0.15"
              className="w-full px-3 py-2.5 rounded-xl text-sm font-mono outline-none"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.10)',
                color: '#F1F5F9',
              }}
            />
          </div>
          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: '#64748B' }}>Description <span style={{ color: '#334155' }}>(optional)</span></label>
            <input
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="What does this setting do?"
              className="w-full px-3 py-2.5 rounded-xl text-sm outline-none"
              style={{
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.10)',
                color: '#F1F5F9',
              }}
            />
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={handleClose}
              className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-all"
              style={{ background: 'rgba(255,255,255,0.05)', color: '#94A3B8', border: 'none', cursor: 'pointer' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={saving || !key.trim() || !value.trim()}
              className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all"
              style={{
                background: saving ? 'rgba(75,123,255,0.3)' : 'rgba(75,123,255,0.2)',
                border: '1px solid rgba(75,123,255,0.3)',
                color: '#6B94FF',
                cursor: saving ? 'not-allowed' : 'pointer',
              }}
            >
              {saving ? 'Saving…' : 'Add Setting'}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Config row ────────────────────────────────────────────────────────
function ConfigRow({ item, onEdit, onDelete, editKey, editValue, setEditValue, onSave, onCancel, saving }) {
  const meta = KEY_LABELS[item.key] || { label: item.key, transform: v => v }
  const isEditing = editKey === item.key

  return (
    <div
      className="flex items-center gap-3 px-4 py-3.5 group/row"
      style={{ borderBottom: '1px solid rgba(255,255,255,0.05)' }}
    >
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
          {meta.label}
        </p>
        {item.description && (
          <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
            {item.description}
          </p>
        )}
        <p className="text-[10px] mt-0.5 font-mono" style={{ color: '#334155' }}>{item.key}</p>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {isEditing ? (
          <>
            <input
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }}
              className="rounded-lg px-3 py-1.5 text-sm font-mono outline-none w-28 text-right"
              style={{
                background: 'rgba(255,255,255,0.07)',
                border: '1.5px solid rgba(255,255,255,0.15)',
                color: 'var(--text-primary)',
              }}
              autoFocus
            />
            <button onClick={onSave} disabled={saving} className="p-1.5 rounded-lg"
              style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80', border: 'none', cursor: 'pointer' }}>
              <Check size={13} />
            </button>
            <button onClick={onCancel} className="p-1.5 rounded-lg"
              style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171', border: 'none', cursor: 'pointer' }}>
              <X size={13} />
            </button>
          </>
        ) : (
          <>
            <span className="text-sm font-mono font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-primary)', minWidth: 64, textAlign: 'right' }}>
              {meta.transform(item.value)}
            </span>
            <button onClick={() => onEdit(item.key, item.value)}
              className="p-1.5 rounded-lg opacity-0 group-hover/row:opacity-100 transition-opacity hover:bg-white/5"
              style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
              <Edit2 size={13} />
            </button>
            <button onClick={() => onDelete(item)}
              className="p-1.5 rounded-lg opacity-0 group-hover/row:opacity-100 transition-opacity hover:bg-red-500/10"
              style={{ color: '#6B7280', background: 'none', border: 'none', cursor: 'pointer' }}>
              <Trash2 size={13} />
            </button>
          </>
        )}
      </div>
    </div>
  )
}

// ── Group accordion ───────────────────────────────────────────────────
function ConfigGroup({ group, items, ...rowProps }) {
  const [open, setOpen] = useState(true)
  const Icon = group.icon
  const groupItems = items.filter(c => group.keys.includes(c.key))
  if (groupItems.length === 0) return null

  return (
    <div className="rounded-2xl overflow-hidden"
      style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(13,17,23,0.7)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4"
        style={{
          background: 'rgba(255,255,255,0.03)', border: 'none', cursor: 'pointer',
          borderBottom: open ? '1px solid rgba(255,255,255,0.06)' : 'none',
        }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.06)' }}>
            <Icon size={15} style={{ color: 'var(--text-secondary)' }} />
          </div>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{group.label}</span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
            style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
            {groupItems.length}
          </span>
        </div>
        {open ? <ChevronUp size={15} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={15} style={{ color: 'var(--text-muted)' }} />}
      </button>

      {open && groupItems.map((item, i) => (
        <div key={item.key} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
          <ConfigRow item={item} {...rowProps} />
        </div>
      ))}
    </div>
  )
}

// ── Main page ─────────────────────────────────────────────────────────
export default function AdminConfig() {
  const qc = useQueryClient()
  const [editKey, setEditKey] = useState(null)
  const [editValue, setEditValue] = useState('')
  const [showNew, setShowNew] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const { data: config = [], isLoading } = useQuery({
    queryKey: ['admin', 'config'],
    queryFn: async () => {
      const { data } = await api.get('/admin/config')
      return Array.isArray(data)
        ? data
        : Object.entries(data).map(([key, value]) => ({ key, value }))
    },
  })

  const update = useMutation({
    mutationFn: ({ key, value }) => api.patch('/admin/config', { key, value }),
    onSuccess: () => { toast.success('Setting updated'); setEditKey(null); qc.invalidateQueries({ queryKey: ['admin', 'config'] }) },
    onError: () => toast.error('Failed to update'),
  })

  const create = useMutation({
    mutationFn: body => api.post('/admin/config', body),
    onSuccess: () => { toast.success('Setting created'); qc.invalidateQueries({ queryKey: ['admin', 'config'] }) },
    onError: (err) => {
      const msg = err?.response?.data?.detail || 'Failed to create'
      toast.error(msg)
    },
  })

  const remove = useMutation({
    mutationFn: key => api.delete(`/admin/config/${key}`),
    onSuccess: () => { toast.success('Setting deleted'); setDeleteTarget(null); qc.invalidateQueries({ queryKey: ['admin', 'config'] }) },
    onError: () => toast.error('Failed to delete'),
  })

  function startEdit(key, value) { setEditKey(key); setEditValue(value) }

  const allGroupedKeys = GROUPS.flatMap(g => g.keys)
  const ungrouped = config.filter(c => !allGroupedKeys.includes(c.key))

  const rowProps = {
    onEdit: startEdit,
    onDelete: setDeleteTarget,
    editKey,
    editValue,
    setEditValue,
    onSave: () => update.mutate({ key: editKey, value: editValue }),
    onCancel: () => setEditKey(null),
    saving: update.isPending,
  }

  return (
    <div className="space-y-6 max-w-3xl">

      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: '#F1F5F9' }}>Platform Config</h1>
          <p className="text-sm mt-1" style={{ color: '#475569' }}>
            Changes take effect immediately across all services.
          </p>
        </div>
        <button
          onClick={() => setShowNew(true)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold transition-all"
          style={{
            background: 'rgba(75,123,255,0.15)',
            border: '1px solid rgba(75,123,255,0.25)',
            color: '#6B94FF',
            cursor: 'pointer',
            flexShrink: 0,
          }}
        >
          <Plus size={14} /> New Setting
        </button>
      </div>

      {/* Empty state */}
      {!isLoading && config.length === 0 && (
        <div
          className="rounded-2xl p-8 flex flex-col items-center gap-4 text-center"
          style={{ background: 'rgba(13,17,23,0.7)', border: '1px dashed rgba(255,255,255,0.1)' }}
        >
          <div className="w-12 h-12 rounded-2xl flex items-center justify-center"
            style={{ background: 'rgba(255,255,255,0.06)' }}>
            <Settings size={20} style={{ color: '#475569' }} />
          </div>
          <div>
            <p className="text-sm font-semibold" style={{ color: '#94A3B8' }}>No settings yet</p>
            <p className="text-xs mt-1" style={{ color: '#475569' }}>
              Add settings manually or run <code className="px-1.5 py-0.5 rounded text-[11px] font-mono" style={{ background: 'rgba(255,255,255,0.08)' }}>backend/seed_platform_config.sql</code> to populate defaults.
            </p>
          </div>
          <button
            onClick={() => setShowNew(true)}
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-sm font-semibold"
            style={{ background: 'rgba(75,123,255,0.15)', border: '1px solid rgba(75,123,255,0.25)', color: '#6B94FF', cursor: 'pointer' }}
          >
            <Plus size={14} /> Add First Setting
          </button>
        </div>
      )}

      {/* Skeleton */}
      {isLoading && (
        <div className="space-y-4">
          {[1,2,3].map(i => (
            <div key={i} className="h-32 rounded-2xl animate-pulse" style={{ background: 'rgba(255,255,255,0.04)' }} />
          ))}
        </div>
      )}

      {/* Groups */}
      {!isLoading && config.length > 0 && (
        <div className="space-y-4">
          {GROUPS.map(group => (
            <ConfigGroup key={group.id} group={group} items={config} {...rowProps} />
          ))}

          {/* Ungrouped */}
          {ungrouped.length > 0 && (
            <div className="rounded-2xl overflow-hidden"
              style={{ border: '1px solid rgba(255,255,255,0.08)', background: 'rgba(13,17,23,0.7)' }}>
              <div className="flex items-center gap-3 px-5 py-4"
                style={{ borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)' }}>
                <Settings size={15} style={{ color: 'var(--text-secondary)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Other</span>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(255,255,255,0.06)', color: 'var(--text-muted)' }}>
                  {ungrouped.length}
                </span>
              </div>
              {ungrouped.map((item, i) => (
                <div key={item.key} style={{ background: i % 2 === 0 ? 'rgba(255,255,255,0.01)' : 'transparent' }}>
                  <ConfigRow item={item} {...rowProps} />
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* New setting dialog */}
      <NewSettingDialog
        open={showNew}
        onClose={() => setShowNew(false)}
        saving={create.isPending}
        onSave={(body, done) => create.mutate(body, { onSuccess: done })}
      />

      {/* Delete confirm */}
      <AlertDialog open={!!deleteTarget} onOpenChange={open => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete setting?</AlertDialogTitle>
            <AlertDialogDescription>
              <code className="font-mono text-sm px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.08)' }}>
                {deleteTarget?.key}
              </code> will be permanently removed from the platform.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDeleteTarget(null)}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => remove.mutate(deleteTarget.key)}
              disabled={remove.isPending}
              style={{ background: 'rgba(239,68,68,0.15)', color: '#f87171', border: '1px solid rgba(239,68,68,0.25)' }}
            >
              {remove.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
