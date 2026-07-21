/**
 * AdminConfig — grouped platform settings panel with full CRUD.
 *
 * `platform_config` is a generic key/value table — GET /admin/config only
 * returns rows that actually exist in the DB. Every business-tunable
 * constant in the backend (see services/config.py::get_config) has a
 * hardcoded fallback default that's used whenever a row is missing, so an
 * empty table is never a hard failure — it's just "everything running on
 * defaults". CONFIG_SCHEMA below is the full known-key catalogue (mirrors
 * every `get_config(db, "<key>", <default>)` call in the backend); it is
 * reconciled client-side against whatever the API actually returns so we
 * can honestly show, per row, whether it's SET (a real DB row exists,
 * admin-tunable value in effect) or BLANK (falling back to the hardcoded
 * default shown inline). Blank rows get an inline "Set now" quick-action
 * that creates the row via POST /admin/config, pre-filled with the
 * default value and its description.
 */
import { useMemo, useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import {
  Settings, Edit2, Check, X, Percent, Wallet,
  Zap, Search, AlertTriangle, ChevronDown, ChevronUp,
  Plus, Trash2, CalendarClock, KeyRound, ImageIcon, Archive,
} from 'lucide-react'
import { api } from '@/lib/api'
import { getErrorMessage } from '@/lib/utils'
import { toast } from 'sonner'
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog'
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel,
  AlertDialogContent, AlertDialogDescription, AlertDialogFooter,
  AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'

// ── Known key catalogue ──────────────────────────────────────────────
// One entry per `get_config(db, "<key>", <default>)` call in the backend.
// `description` doubles as the fallback shown for blank rows and matches
// the DB `description` column that's seeded alongside each key.
const pct = v => `${(parseFloat(v) * 100).toFixed(0)}%`

const CONFIG_SCHEMA = {
  // Commission & Revenue
  commission_instant_rate:        { label: 'Instant Commission',            default: '0.12',   transform: pct, description: 'Platform commission taken on Instant job payments.' },
  commission_discovery_base:      { label: 'Discovery Base Commission',     default: '0.10',   transform: pct, description: "Base platform commission on Discovery bookings before the value-based increment is added." },
  commission_discovery_increment: { label: 'Discovery Commission Increment',default: '0.05',   transform: pct, description: 'Extra commission added as a Discovery booking value approaches the threshold, capped at commission_discovery_threshold.' },
  commission_discovery_threshold: { label: 'Discovery Commission Threshold',default: '50000',  transform: v => `₹${Number(v).toLocaleString('en-IN')}`, description: "Booking value (₹) at which the Discovery commission increment maxes out." },
  gst_rate:                       { label: 'GST on Commission',             default: '0.18',   transform: pct, description: "GST rate applied on top of the platform's commission fee." },

  // Worker Payouts & Escrow
  payment_min_amount_inr:         { label: 'Min Payment Amount',            default: '1',      transform: v => `₹${v}`, description: 'Minimum payment amount (₹) accepted when creating a Razorpay order.' },
  escrow_hold_hours:              { label: 'Escrow Hold Duration',          default: '2',      transform: v => `${v}h`, description: "Hours a completed job's payment is held in escrow before payout release." },

  // Cancellation & Penalties
  penalty_worker_cancel_amount:   { label: 'Worker Cancel Penalty',         default: '100.00', transform: v => `₹${v}`, description: 'Flat penalty charged to a worker who cancels a job after accepting it.' },
  cancellation_score_deduct:      { label: 'Score Deduct on Cancel',        default: '0.10',   transform: v => `-${v}`, description: "Amount deducted from a worker's cancellation score for each cancellation." },
  cancellation_score_recover:     { label: 'Score Recover per Job',         default: '0.02',   transform: v => `+${v}`, description: "Amount a worker's cancellation score recovers per completed job." },
  auto_offline_reject_threshold:  { label: 'Rejections → Auto-Offline',     default: '5',      transform: v => `${v} jobs`, description: 'Consecutive job rejections before a worker is automatically forced offline.' },
  auto_offline_minutes:           { label: 'Auto-Offline Duration',         default: '5',      transform: v => `${v} min`, description: 'Minutes a worker stays forced offline after hitting the auto-offline threshold.' },
  no_show_rating_penalty:         { label: 'No-Show Rating Penalty',       default: '0.50',   transform: v => `-${v}`, description: 'Rating penalty applied to a worker judged a no-show.' },
  no_show_proximity_km:           { label: 'No-Show Proximity Radius',      default: '0.5',    transform: v => `${v} km`, description: "Distance (km) within which a worker's last known location must fall to avoid a no-show penalty." },
  no_show_location_lookup_window_min: { label: 'No-Show Location Lookback', default: '30',   transform: v => `${v} min`, description: 'How far back the no-show check looks for a worker location ping.' },
  cancellation_free_reschedule_min_hours: { label: 'Free Reschedule Window', default: '2',   transform: v => `${v}h`, description: 'Minimum hours before a scheduled job start that a user can reschedule for free.' },
  cancellation_late_cutoff_hours: { label: 'Late Cancellation Cutoff',      default: '6',      transform: v => `${v}h`, description: 'Hours before job start after which a cancellation is considered late.' },
  cancellation_repeat_offense_pct: { label: 'Repeat Offense Penalty',       default: '0.50',   transform: pct, description: 'Penalty percentage applied for a repeat late-cancellation offense.' },

  // Matching Engine
  dispatch_radius_start_km:       { label: 'Start Radius',                 default: '2',      transform: v => `${v} km`, description: 'Starting search radius for instant job dispatch.' },
  dispatch_radius_max_km:         { label: 'Max Radius',                   default: '5',      transform: v => `${v} km`, description: 'Maximum search radius before an instant job dispatch fails.' },
  dispatch_radius_step_km:        { label: 'Radius Step',                  default: '1',      transform: v => `${v} km`, description: 'How much the search radius expands each dispatch round.' },
  dispatch_accept_window_sec:     { label: 'Accept Window',                default: '10',     transform: v => `${v}s`, description: 'Seconds a worker has to accept or reject an incoming instant job request.' },
  dispatch_max_workers_per_round: { label: 'Workers per Round',            default: '5',      transform: v => `${v}`, description: 'Maximum number of workers notified per dispatch round.' },

  // Scheduling & Slots
  slot_duration_buffer_min:       { label: 'Slot Buffer',                  default: '60',     transform: v => `${v} min`, description: 'Buffer minutes added around booked Discovery slots to prevent back-to-back overbooking.' },
  slot_rolling_window_days:       { label: 'Slot Rolling Window',          default: '14',     transform: v => `${v} days`, description: 'How many days ahead worker availability slots are rolled forward.' },

  // Completion Codes
  completion_code_expiry_hours:   { label: 'Code Expiry',                  default: '4',      transform: v => `${v}h`, description: 'Hours before a job completion code expires.' },
  completion_code_max_attempts:   { label: 'Max Attempts',                 default: '5',      transform: v => `${v}`, description: 'Max attempts allowed to enter a job completion code before lockout.' },
  completion_code_lockout_minutes:{ label: 'Lockout Duration',             default: '15',     transform: v => `${v} min`, description: 'Minutes a completion code is locked out after too many failed attempts.' },
  max_extra_items_per_job:        { label: 'Max Extra Items',              default: '20',     transform: v => `${v}`, description: 'Maximum number of extra line items that can be added to a job.' },

  // Search & Ranking
  search_weight_rating:           { label: 'Rating Weight',                default: '0.45',   transform: pct, description: 'Search ranking: weight given to worker rating.' },
  search_weight_distance:         { label: 'Distance Weight',              default: '0.35',   transform: pct, description: 'Search ranking: weight given to distance from the user.' },
  search_weight_price:            { label: 'Price Weight',                 default: '0.20',   transform: pct, description: 'Search ranking: weight given to price competitiveness.' },
  search_rating_service_weight:   { label: 'Service Rating Weight',        default: '0.70',   transform: pct, description: 'Within the rating score: weight given to service-specific reviews.' },
  search_rating_worker_weight:    { label: 'Worker Rating Weight',         default: '0.30',   transform: pct, description: "Within the rating score: weight given to the worker's overall rating." },

  // Media & Upload Limits
  max_image_upload_mb:            { label: 'Max Image Upload',             default: '10',     transform: v => `${v} MB`, description: 'Maximum image upload size accepted by the upload endpoints.' },
  max_video_upload_mb:            { label: 'Max Video Upload',             default: '100',    transform: v => `${v} MB`, description: 'Maximum worker-post video upload size.' },
  max_verification_video_mb:      { label: 'Max Verification Video',       default: '200',    transform: v => `${v} MB`, description: 'Maximum verification video size accepted during worker onboarding.' },
  max_category_icon_mb:           { label: 'Max Category Icon',            default: '5',      transform: v => `${v} MB`, description: 'Maximum category icon file size.' },

  // Legacy / no longer read by any live code path
  scheduled_assign_ahead_hours:   { label: 'Scheduled Assign-Ahead (legacy)', default: '—',    transform: v => v, description: 'Legacy: used by the old Discovery lazy-assignment job. No longer read now that that system has been removed.', legacy: true },
  scheduled_search_radius_km:     { label: 'Scheduled Search Radius (legacy)', default: '—',   transform: v => v, description: 'Legacy: used by the old Discovery lazy-assignment job. No longer read now that that system has been removed.', legacy: true },
}

const GROUPS = [
  { id: 'commission', label: 'Commission & Revenue', icon: Percent, keys: ['commission_instant_rate', 'commission_discovery_base', 'commission_discovery_increment', 'commission_discovery_threshold', 'gst_rate'] },
  { id: 'payouts', label: 'Worker Payouts & Escrow', icon: Wallet, keys: ['payment_min_amount_inr', 'escrow_hold_hours'] },
  { id: 'cancellation', label: 'Cancellation & Penalties', icon: AlertTriangle, keys: ['penalty_worker_cancel_amount', 'cancellation_score_deduct', 'cancellation_score_recover', 'auto_offline_reject_threshold', 'auto_offline_minutes', 'no_show_rating_penalty', 'no_show_proximity_km', 'no_show_location_lookup_window_min', 'cancellation_free_reschedule_min_hours', 'cancellation_late_cutoff_hours', 'cancellation_repeat_offense_pct'] },
  { id: 'matching', label: 'Matching Engine', icon: Zap, keys: ['dispatch_radius_start_km', 'dispatch_radius_max_km', 'dispatch_radius_step_km', 'dispatch_accept_window_sec', 'dispatch_max_workers_per_round'] },
  { id: 'scheduling', label: 'Scheduling & Slots', icon: CalendarClock, keys: ['slot_duration_buffer_min', 'slot_rolling_window_days'] },
  { id: 'completion', label: 'Completion Codes', icon: KeyRound, keys: ['completion_code_expiry_hours', 'completion_code_max_attempts', 'completion_code_lockout_minutes', 'max_extra_items_per_job'] },
  { id: 'search', label: 'Search & Ranking', icon: Search, keys: ['search_weight_rating', 'search_weight_distance', 'search_weight_price', 'search_rating_service_weight', 'search_rating_worker_weight'] },
  { id: 'limits', label: 'Media & Upload Limits', icon: ImageIcon, keys: ['max_image_upload_mb', 'max_video_upload_mb', 'max_verification_video_mb', 'max_category_icon_mb'] },
]

const LEGACY_KEYS = ['scheduled_assign_ahead_hours', 'scheduled_search_radius_km']
const KNOWN_KEYS = new Set([...GROUPS.flatMap(g => g.keys), ...LEGACY_KEYS])

// ── New Setting Dialog (for keys outside the known catalogue) ────────
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
          <DialogTitle>Custom Config Setting</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-1">
          <div>
            <Label>Key</Label>
            <Input
              value={key}
              onChange={e => setKey(e.target.value.toLowerCase().replace(/\s/g, '_'))}
              placeholder="e.g. my_custom_setting"
              className="font-mono"
            />
            <p className="text-[11px] mt-1" style={{ color: 'var(--text-muted)' }}>Lowercase letters and underscores only. Use this for one-off keys not already in the catalogue above.</p>
          </div>
          <div>
            <Label>Value</Label>
            <Input value={value} onChange={e => setValue(e.target.value)} placeholder="e.g. 0.15" className="font-mono" />
          </div>
          <div>
            <Label>Description <span style={{ color: 'var(--text-secondary)' }}>(optional)</span></Label>
            <Textarea rows={2} value={desc} onChange={e => setDesc(e.target.value)} placeholder="What does this setting do?" />
          </div>
          <DialogFooter className="gap-2 pt-1">
            <Button variant="ghost" onClick={handleClose} className="flex-1">Cancel</Button>
            <Button onClick={handleSave} disabled={saving || !key.trim() || !value.trim()} className="flex-1">
              {saving ? 'Saving…' : 'Add Setting'}
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  )
}

// ── Config row ────────────────────────────────────────────────────────
function ConfigRow({ item, isEditing, editValue, setEditValue, onStartEdit, onSave, onCancel, onDelete, saving }) {
  const meta = item.meta

  return (
    <div className="flex items-center gap-3 px-4 py-3.5 group/row" style={{ borderBottom: '1px solid var(--card-border)' }}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{meta.label}</p>
          {item.isSet ? (
            <Badge variant="success" className="text-[10px] py-0">Set</Badge>
          ) : (
            <Badge variant="warning" className="text-[10px] py-0">Using default</Badge>
          )}
        </div>
        <p className="text-xs mt-0.5 leading-relaxed" style={{ color: 'var(--text-muted)' }}>
          {item.isSet ? item.description : (
            <>Not set — using default: <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{meta.transform(meta.default)}</span>. {item.description}</>
          )}
        </p>
        <p className="text-[10px] mt-0.5 font-mono" style={{ color: 'var(--text-secondary)' }}>{item.key}</p>
      </div>

      <div className="flex items-center gap-1.5 shrink-0">
        {isEditing ? (
          <>
            <Input
              value={editValue}
              onChange={e => setEditValue(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') onCancel() }}
              className="h-9 w-28 text-right font-mono text-sm"
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
        ) : item.isSet ? (
          <>
            <span className="text-sm font-mono font-semibold px-3 py-1.5 rounded-lg"
              style={{ background: 'var(--card-bg)', color: 'var(--text-primary)', minWidth: 64, textAlign: 'right' }}>
              {meta.transform(item.value)}
            </span>
            <button onClick={() => onStartEdit(item.value)}
              className="p-1.5 rounded-lg opacity-0 group-hover/row:opacity-100 transition-opacity hover:bg-white/5"
              style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
              <Edit2 size={13} />
            </button>
            <button onClick={() => onDelete(item)}
              className="p-1.5 rounded-lg opacity-0 group-hover/row:opacity-100 transition-opacity hover:bg-red-500/10"
              style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
              <Trash2 size={13} />
            </button>
          </>
        ) : (
          <Button size="sm" variant="outline" onClick={() => onStartEdit(meta.default)}>
            <Plus size={13} className="mr-1" /> Set now
          </Button>
        )}
      </div>
    </div>
  )
}

// ── Group accordion ───────────────────────────────────────────────────
function ConfigGroup({ group, items, defaultOpen = true, ...rowProps }) {
  const [open, setOpen] = useState(defaultOpen)
  const Icon = group.icon
  const groupItems = items.filter(c => group.keys.includes(c.key))
  if (groupItems.length === 0) return null
  const setCount = groupItems.filter(c => c.isSet).length

  return (
    <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--card-border)', background: 'var(--card-bg)' }}>
      <button
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between px-5 py-4"
        style={{ background: 'var(--card-bg)', border: 'none', cursor: 'pointer', borderBottom: open ? '1px solid var(--card-border)' : 'none' }}
      >
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-xl flex items-center justify-center" style={{ background: 'var(--card-bg)' }}>
            <Icon size={15} style={{ color: 'var(--text-secondary)' }} />
          </div>
          <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{group.label}</span>
          <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--card-bg)', color: 'var(--text-muted)' }}>
            {setCount}/{groupItems.length} set
          </span>
        </div>
        {open ? <ChevronUp size={15} style={{ color: 'var(--text-muted)' }} /> : <ChevronDown size={15} style={{ color: 'var(--text-muted)' }} />}
      </button>

      {open && groupItems.map((item, i) => (
        <div key={item.key} style={{ background: i % 2 === 0 ? 'var(--card-bg)' : 'transparent' }}>
          <ConfigRow item={item} {...rowProps} isEditing={rowProps.editKey === item.key}
            editValue={rowProps.editKey === item.key ? rowProps.editValue : ''}
            onStartEdit={(val) => rowProps.onStartEdit(item, val)} />
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

  const { data: rawConfig = [], isLoading } = useQuery({
    queryKey: ['admin', 'config'],
    queryFn: async () => {
      const { data } = await api.get('/admin/config')
      return Array.isArray(data) ? data : Object.entries(data).map(([key, value]) => ({ key, value }))
    },
  })

  const update = useMutation({
    mutationFn: ({ key, value }) => api.patch('/admin/config', { key, value }),
    onSuccess: () => { toast.success('Setting updated'); setEditKey(null); qc.invalidateQueries({ queryKey: ['admin', 'config'] }) },
    onError: () => toast.error('Failed to update'),
  })

  const create = useMutation({
    mutationFn: body => api.post('/admin/config', body),
    onSuccess: () => { toast.success('Setting saved'); setEditKey(null); qc.invalidateQueries({ queryKey: ['admin', 'config'] }) },
    onError: (err) => toast.error(getErrorMessage(err, 'Failed to create')),
  })

  const remove = useMutation({
    mutationFn: key => api.delete(`/admin/config/${key}`),
    onSuccess: () => { toast.success('Setting deleted — reverting to default'); setDeleteTarget(null); qc.invalidateQueries({ queryKey: ['admin', 'config'] }) },
    onError: () => toast.error('Failed to delete'),
  })

  // Reconcile the known-key catalogue against whatever the API actually
  // returned (GET /admin/config only returns rows that exist as real DB
  // rows — there is no all-known-keys-with-nulls mode server-side).
  const configByKey = useMemo(() => Object.fromEntries(rawConfig.map(c => [c.key, c])), [rawConfig])

  const merged = useMemo(() => Object.entries(CONFIG_SCHEMA).map(([key, meta]) => {
    const row = configByKey[key]
    return {
      key,
      meta,
      isSet: !!row,
      value: row?.value,
      description: row?.description || meta.description,
    }
  }), [configByKey])

  const mergedByKey = useMemo(() => Object.fromEntries(merged.map(m => [m.key, m])), [merged])

  // Truly custom rows: real DB rows whose key isn't in our known catalogue at all.
  const customRows = rawConfig.filter(c => !KNOWN_KEYS.has(c.key))

  function onStartEdit(item, prefillValue) {
    setEditKey(item.key)
    setEditValue(prefillValue ?? item.value ?? item.meta.default)
  }

  function onSave() {
    const item = mergedByKey[editKey] || { key: editKey, isSet: customRows.some(c => c.key === editKey) }
    if (item.isSet) {
      update.mutate({ key: editKey, value: editValue })
    } else {
      create.mutate({ key: editKey, value: editValue, description: item.meta?.description })
    }
  }

  const rowProps = {
    editKey,
    editValue,
    setEditValue,
    onStartEdit,
    onSave,
    onCancel: () => setEditKey(null),
    onDelete: setDeleteTarget,
    saving: update.isPending || create.isPending,
  }

  const totalKnown = Object.keys(CONFIG_SCHEMA).length - LEGACY_KEYS.length
  const totalSet = merged.filter(m => m.isSet && !m.meta.legacy).length

  return (
    <div className="space-y-6 max-w-3xl">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Platform Config</h1>
          <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
            {totalSet}/{totalKnown} settings tuned from default · changes take effect within 60s (cached in-process).
          </p>
        </div>
        <Button onClick={() => setShowNew(true)} className="flex items-center gap-2 shrink-0">
          <Plus size={14} /> Custom Setting
        </Button>
      </div>

      {/* Skeleton */}
      {isLoading && (
        <div className="space-y-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="h-32 rounded-2xl animate-pulse" style={{ background: 'var(--card-bg)' }} />
          ))}
        </div>
      )}

      {/* Groups */}
      {!isLoading && (
        <div className="space-y-4">
          {GROUPS.map(group => (
            <ConfigGroup key={group.id} group={group} items={merged} {...rowProps} />
          ))}

          {/* Legacy / unused */}
          <div className="rounded-2xl overflow-hidden" style={{ border: '1px dashed var(--card-border)', background: 'var(--card-bg)', opacity: 0.75 }}>
            <ConfigGroup
              group={{ id: 'legacy', label: 'Legacy / Unused', icon: Archive, keys: LEGACY_KEYS }}
              items={merged}
              defaultOpen={false}
              {...rowProps}
            />
          </div>

          {/* Custom / ungrouped rows not in the known catalogue */}
          {customRows.length > 0 && (
            <div className="rounded-2xl overflow-hidden" style={{ border: '1px solid var(--card-border)', background: 'var(--card-bg)' }}>
              <div className="flex items-center gap-3 px-5 py-4" style={{ borderBottom: '1px solid var(--card-border)', background: 'var(--card-bg)' }}>
                <Settings size={15} style={{ color: 'var(--text-secondary)' }} />
                <span className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Custom</span>
                <span className="text-[10px] font-medium px-2 py-0.5 rounded-full" style={{ background: 'var(--card-bg)', color: 'var(--text-muted)' }}>
                  {customRows.length}
                </span>
              </div>
              {customRows.map((row, i) => {
                const item = { key: row.key, meta: { label: row.key, transform: v => v, default: row.value }, isSet: true, value: row.value, description: row.description }
                return (
                  <div key={row.key} style={{ background: i % 2 === 0 ? 'var(--card-bg)' : 'transparent' }}>
                    <ConfigRow item={item} {...rowProps} isEditing={editKey === row.key}
                      editValue={editKey === row.key ? editValue : ''}
                      onStartEdit={(val) => onStartEdit(item, val)} />
                  </div>
                )
              })}
            </div>
          )}
        </div>
      )}

      {/* Custom setting dialog */}
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
              <code className="font-mono text-sm px-1.5 py-0.5 rounded" style={{ background: 'var(--card-bg)' }}>
                {deleteTarget?.key}
              </code>{' '}
              will be removed from the database.{' '}
              {deleteTarget && CONFIG_SCHEMA[deleteTarget.key] && (
                <>The app will fall back to its hardcoded default: <span className="font-mono">{CONFIG_SCHEMA[deleteTarget.key].transform(CONFIG_SCHEMA[deleteTarget.key].default)}</span>.</>
              )}
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
