import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Edit3, Loader2, Check, MapPin, Store } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

const MODE_OPTIONS = [
  { value: 'walkin',  label: 'Walk-in',  icon: Store,  tip: 'Customer comes to you' },
  { value: 'onsite',  label: 'On-site',  icon: MapPin, tip: 'You go to customer' },
  { value: 'both',    label: 'Both',     icon: null,   tip: 'Either works' },
]

const MODE_COLORS = {
  walkin: { bg: 'rgba(168,85,247,0.12)', color: '#a855f7', border: 'rgba(168,85,247,0.25)' },
  onsite: { bg: 'rgba(59,130,246,0.12)',  color: '#60a5fa', border: 'rgba(59,130,246,0.25)' },
  both:   { bg: 'rgba(52,211,153,0.12)', color: '#34d399', border: 'rgba(52,211,153,0.25)' },
}

function ServiceModeToggle({ value, onChange }) {
  return (
    <div>
      <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Service mode</p>
      <div
        className="flex rounded-xl p-0.5 gap-0.5"
        style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}
      >
        {MODE_OPTIONS.map(opt => {
          const active = value === opt.value
          return (
            <button
              key={opt.value}
              type="button"
              onClick={() => onChange(opt.value)}
              className="flex-1 py-2 px-2 rounded-[10px] text-xs font-semibold transition-all duration-150 flex items-center justify-center gap-1"
              style={
                active
                  ? {
                      background: MODE_COLORS[opt.value].bg,
                      color: MODE_COLORS[opt.value].color,
                      border: `1px solid ${MODE_COLORS[opt.value].border}`,
                    }
                  : { color: 'var(--text-muted)', border: '1px solid transparent' }
              }
            >
              {opt.label}
            </button>
          )
        })}
      </div>
      <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
        {MODE_OPTIONS.find(o => o.value === value)?.tip}
      </p>
    </div>
  )
}

function ServiceForm({ initial, onSave, onCancel }) {
  const [title, setTitle]             = useState(initial?.title || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [hourlyRate, setHourlyRate]   = useState(initial?.hourly_rate || '')
  const [serviceMode, setServiceMode] = useState(initial?.service_mode || 'both')
  const [visitFee, setVisitFee]       = useState(initial?.visit_fee || '')
  const [loading, setLoading]         = useState(false)

  const showVisitFee = serviceMode === 'onsite' || serviceMode === 'both'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true)
    try {
      const payload = { title: title.trim(), service_mode: serviceMode }
      if (description.trim()) payload.description = description.trim()
      if (hourlyRate && !isNaN(Number(hourlyRate))) payload.hourly_rate = Number(hourlyRate)
      if (showVisitFee && visitFee && !isNaN(Number(visitFee))) payload.visit_fee = Number(visitFee)
      await onSave(payload)
    } finally {
      setLoading(false)
    }
  }

  const inputClass = "w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-all"
  const inputStyle = {
    background: 'var(--g-bg)',
    border: '1px solid var(--g-border)',
    color: 'var(--text-primary)',
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--g-bg-mid)', border: '1px solid rgba(var(--brand-rgb, 59,130,246),0.2)' }}>
      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        {initial ? 'Edit service' : 'Add service'}
      </p>

      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Service title (e.g. Plumbing repair)"
        required
        className={inputClass}
        style={inputStyle}
      />

      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Brief description (optional)"
        rows={2}
        className={inputClass + ' resize-none'}
        style={inputStyle}
      />

      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Base rate ₹</p>
          <input
            type="number"
            value={hourlyRate}
            onChange={e => setHourlyRate(e.target.value)}
            placeholder="e.g. 499"
            min={0}
            className={inputClass}
            style={inputStyle}
          />
        </div>
        <AnimatePresence>
          {showVisitFee && (
            <motion.div
              initial={{ opacity: 0, x: 8 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 8 }}
              transition={{ duration: 0.15 }}
            >
              <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Visit fee ₹</p>
              <input
                type="number"
                value={visitFee}
                onChange={e => setVisitFee(e.target.value)}
                placeholder="e.g. 99"
                min={0}
                className={inputClass}
                style={inputStyle}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <ServiceModeToggle value={serviceMode} onChange={setServiceMode} />

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
          style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)', color: 'var(--text-secondary)' }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || !title.trim()}
          className="flex-1 py-2.5 rounded-xl btn-brand text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Save
        </button>
      </div>
    </form>
  )
}

function ServiceCard({ svc, onEdit, onDelete, deleting }) {
  const modeColor = MODE_COLORS[svc.service_mode || 'both']
  const modeLabel = MODE_OPTIONS.find(o => o.value === (svc.service_mode || 'both'))?.label || 'Both'

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="rounded-xl p-4"
      style={{ background: 'var(--g-bg-mid)', border: '1px solid var(--g-border)' }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{svc.title}</p>
            <span
              className="text-[10px] px-2 py-0.5 rounded-full font-medium"
              style={{ background: modeColor.bg, color: modeColor.color, border: `1px solid ${modeColor.border}` }}
            >
              {modeLabel}
            </span>
          </div>
          {svc.description && (
            <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{svc.description}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5">
            {svc.hourly_rate > 0 && (
              <span className="text-xs font-semibold text-azure">{formatCurrency(svc.hourly_rate)}</span>
            )}
            {svc.visit_fee > 0 && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                +{formatCurrency(svc.visit_fee)} visit fee
              </span>
            )}
            {(svc.avg_rating > 0) && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                ★ {Number(svc.avg_rating).toFixed(1)} ({svc.rating_count})
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-1 shrink-0">
          <button
            onClick={onEdit}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
            style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}
          >
            <Edit3 size={13} style={{ color: 'var(--text-muted)' }} />
          </button>
          <button
            onClick={onDelete}
            disabled={deleting}
            className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
          >
            {deleting
              ? <Loader2 size={13} className="animate-spin" style={{ color: '#f87171' }} />
              : <Trash2 size={13} style={{ color: '#f87171' }} />
            }
          </button>
        </div>
      </div>
    </motion.div>
  )
}

export default function WorkerServices() {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd]     = useState(false)
  const [editingId, setEditingId] = useState(null)

  const { data: services = [], isLoading } = useQuery({
    queryKey: ['my-services'],
    queryFn: () => api.get('/workers/me/services').then(r => r.data),
  })

  const extractError = (err) => {
    const detail = err.response?.data?.detail
    if (Array.isArray(detail)) {
      const loc = detail[0]?.loc?.slice(1).join('.') || 'Field'
      return `${loc}: ${detail[0]?.msg}`
    }
    return typeof detail === 'string' ? detail : 'Failed to save service'
  }

  const addMut = useMutation({
    mutationFn: (data) => api.post('/workers/me/services', data),
    onSuccess: () => { queryClient.invalidateQueries(['my-services']); setShowAdd(false); toast.success('Service added') },
    onError: (err) => { console.error('422:', err.response?.data); toast.error(extractError(err)) },
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/workers/me/services/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries(['my-services']); setEditingId(null); toast.success('Updated') },
    onError: (err) => { console.error('422:', err.response?.data); toast.error(extractError(err)) },
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/workers/me/services/${id}`),
    onSuccess: () => { queryClient.invalidateQueries(['my-services']); toast.success('Deleted') },
    onError: () => toast.error('Failed to delete'),
  })

  return (
    <div className="px-4 pt-5 pb-8 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-syne font-bold text-xl" style={{ color: 'var(--text-primary)' }}>My Services</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {services.length} service{services.length !== 1 ? 's' : ''} listed
          </p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setEditingId(null) }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl btn-brand text-sm font-medium"
        >
          <Plus size={15} /> Add
        </button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <ServiceForm
              onSave={(data) => addMut.mutate(data)}
              onCancel={() => setShowAdd(false)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : services.length === 0 ? (
        <div className="rounded-2xl p-8 text-center" style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No services yet. Add your first!</p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {services.map((svc) =>
              editingId === svc.id ? (
                <motion.div key={svc.id} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <ServiceForm
                    initial={svc}
                    onSave={(data) => updateMut.mutate({ id: svc.id, data })}
                    onCancel={() => setEditingId(null)}
                  />
                </motion.div>
              ) : (
                <ServiceCard
                  key={svc.id}
                  svc={svc}
                  onEdit={() => { setEditingId(svc.id); setShowAdd(false) }}
                  onDelete={() => deleteMut.mutate(svc.id)}
                  deleting={deleteMut.isPending && deleteMut.variables === svc.id}
                />
              )
            )}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
