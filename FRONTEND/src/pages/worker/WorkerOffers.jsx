import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Edit3, Loader2, Check, Tag, Percent, IndianRupee } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

const inputClass = "w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-all"
function inputStyle(extra = {}) {
  return { background: 'var(--g-bg)', border: '1px solid var(--g-border)', color: 'var(--text-primary)', ...extra }
}

function formatDate(d) {
  if (!d) return ''
  return new Date(d).toISOString().slice(0, 10)
}

function daysLeft(d) {
  if (!d) return null
  const diff = Math.ceil((new Date(d) - Date.now()) / 86400000)
  return diff
}

function OfferForm({ initial, services, packages, onSave, onCancel }) {
  const [title, setTitle]           = useState(initial?.title || '')
  const [description, setDesc]      = useState(initial?.description || '')
  const [discountType, setType]     = useState(initial?.discount_type || 'percent')
  const [discountValue, setValue]   = useState(initial?.discount_value || '')
  const [minOrder, setMinOrder]     = useState(initial?.min_order_value || '')
  const [promoCode, setPromoCode]   = useState(initial?.promo_code || '')
  const [validUntil, setValid]      = useState(initial?.valid_until ? formatDate(initial.valid_until) : '')
  const [usageLimit, setLimit]      = useState(initial?.usage_limit || '')
  const [targetType, setTargetType] = useState(initial?.package_id ? 'package' : initial?.service_id ? 'service' : 'all')
  const [targetId, setTargetId]     = useState(initial?.package_id || initial?.service_id || '')
  const [loading, setLoading]       = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim() || !discountValue || !validUntil) {
      toast.error('Title, discount value and expiry are required')
      return
    }
    setLoading(true)
    try {
      const payload = {
        title: title.trim(),
        discount_type: discountType,
        discount_value: Number(discountValue),
        valid_until: new Date(validUntil).toISOString(),
      }
      if (description.trim()) payload.description = description.trim()
      if (minOrder) payload.min_order_value = Number(minOrder)
      if (promoCode.trim()) payload.promo_code = promoCode.trim().toUpperCase()
      if (usageLimit) payload.usage_limit = Number(usageLimit)
      if (targetType === 'service' && targetId) payload.service_id = targetId
      if (targetType === 'package' && targetId) payload.package_id = targetId
      await onSave(payload)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl p-4 space-y-3" style={{ background: 'var(--g-bg-mid)', border: '1px solid rgba(52,211,153,0.2)' }}>
      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        {initial ? 'Edit offer' : 'New offer'}
      </p>

      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Offer name (e.g. Summer Sale 20% off)"
        required
        className={inputClass}
        style={inputStyle()}
      />

      <textarea
        value={description}
        onChange={e => setDesc(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        className={inputClass + ' resize-none'}
        style={inputStyle()}
      />

      {/* Discount type + value */}
      <div>
        <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Discount</p>
        <div className="flex gap-2">
          <div className="flex rounded-xl p-0.5 gap-0.5 shrink-0" style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}>
            {[['percent', '%'], ['flat', '₹']].map(([v, icon]) => (
              <button key={v} type="button" onClick={() => setType(v)}
                className="w-10 h-9 rounded-[10px] text-sm font-bold flex items-center justify-center transition-all"
                style={discountType === v
                  ? { background: 'rgba(52,211,153,0.15)', color: '#34d399', border: '1px solid rgba(52,211,153,0.3)' }
                  : { color: 'var(--text-muted)', border: '1px solid transparent' }}
              >
                {icon}
              </button>
            ))}
          </div>
          <input
            type="number"
            value={discountValue}
            onChange={e => setValue(e.target.value)}
            placeholder={discountType === 'percent' ? '20' : '100'}
            min={0}
            max={discountType === 'percent' ? 100 : undefined}
            required
            className={inputClass}
            style={inputStyle()}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Min order ₹ (opt.)</p>
          <input type="number" value={minOrder} onChange={e => setMinOrder(e.target.value)}
            placeholder="e.g. 500" min={0} className={inputClass} style={inputStyle()} />
        </div>
        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Usage limit (opt.)</p>
          <input type="number" value={usageLimit} onChange={e => setLimit(e.target.value)}
            placeholder="e.g. 50" min={1} className={inputClass} style={inputStyle()} />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Promo code (opt.)</p>
          <input value={promoCode} onChange={e => setPromoCode(e.target.value.toUpperCase())}
            placeholder="e.g. SUMMER20" maxLength={30} className={inputClass} style={inputStyle({ textTransform: 'uppercase' })} />
        </div>
        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Valid until</p>
          <input type="date" value={validUntil} onChange={e => setValid(e.target.value)}
            required className={inputClass} style={inputStyle()} />
        </div>
      </div>

      {/* Target */}
      {(services.length > 0 || packages.length > 0) && (
        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Apply to</p>
          <div className="flex rounded-xl p-0.5 gap-0.5 mb-2" style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}>
            {[['all','All services'],['service','A service'],['package','A package']].map(([v,l]) => (
              <button key={v} type="button" onClick={() => { setTargetType(v); setTargetId('') }}
                className="flex-1 py-1.5 rounded-[10px] text-xs font-semibold transition-all"
                style={targetType === v
                  ? { background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.25)' }
                  : { color: 'var(--text-muted)', border: '1px solid transparent' }}
              >
                {l}
              </button>
            ))}
          </div>
          {targetType === 'service' && (
            <select value={targetId} onChange={e => setTargetId(e.target.value)}
              className={inputClass} style={inputStyle()}>
              <option value="">Select a service...</option>
              {services.map(s => <option key={s.id} value={s.id}>{s.title}</option>)}
            </select>
          )}
          {targetType === 'package' && (
            <select value={targetId} onChange={e => setTargetId(e.target.value)}
              className={inputClass} style={inputStyle()}>
              <option value="">Select a package...</option>
              {packages.map(p => <option key={p.id} value={p.id}>{p.title}</option>)}
            </select>
          )}
        </div>
      )}

      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium"
          style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)', color: 'var(--text-secondary)' }}>
          Cancel
        </button>
        <button type="submit" disabled={loading}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.25)' }}>
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Save offer
        </button>
      </div>
    </form>
  )
}

function OfferCard({ offer, onEdit, onDelete, deleting }) {
  const days = daysLeft(offer.valid_until)
  const expired = days !== null && days <= 0
  const urgentExpiry = days !== null && days > 0 && days <= 3

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="rounded-xl p-4"
      style={{
        background: 'var(--g-bg-mid)',
        border: expired ? '1px solid rgba(239,68,68,0.2)' : '1px solid var(--g-border)',
        opacity: expired ? 0.7 : 1,
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{offer.title}</p>
            <span
              className="text-xs px-2 py-0.5 rounded-full font-bold"
              style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }}
            >
              {offer.discount_type === 'percent' ? `${offer.discount_value}% off` : `₹${offer.discount_value} off`}
            </span>
            {!offer.is_active && (
              <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                Inactive
              </span>
            )}
          </div>

          {offer.promo_code && (
            <p className="text-xs mt-1 font-mono font-bold tracking-wide" style={{ color: 'var(--text-secondary)' }}>
              {offer.promo_code}
            </p>
          )}

          <div className="flex items-center gap-3 mt-1.5 flex-wrap">
            {offer.min_order_value > 0 && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                Min {formatCurrency(offer.min_order_value)}
              </span>
            )}
            {offer.usage_limit && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                {offer.usage_count}/{offer.usage_limit} used
              </span>
            )}
            {days !== null && (
              <span
                className="text-xs font-medium"
                style={{ color: expired ? '#f87171' : urgentExpiry ? 'var(--accent)' : 'var(--text-muted)' }}
              >
                {expired ? 'Expired' : `${days}d left`}
              </span>
            )}
          </div>
        </div>

        <div className="flex gap-1 shrink-0">
          <button onClick={onEdit}
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}>
            <Edit3 size={13} style={{ color: 'var(--text-muted)' }} />
          </button>
          <button onClick={onDelete} disabled={deleting}
            className="w-8 h-8 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
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

export default function WorkerOffers() {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd]     = useState(false)
  const [editingId, setEditingId] = useState(null)

  const { data: offers = [], isLoading }   = useQuery({
    queryKey: ['my-offers'],
    queryFn: () => api.get('/workers/me/offers').then(r => r.data),
  })
  const { data: services = [] } = useQuery({
    queryKey: ['my-services'],
    queryFn: () => api.get('/workers/me/services').then(r => r.data),
  })
  const { data: packages = [] } = useQuery({
    queryKey: ['my-packages'],
    queryFn: () => api.get('/workers/me/packages').then(r => r.data),
  })

  const extractError = (err) => {
    const d = err.response?.data?.detail
    if (Array.isArray(d)) return `${d[0]?.loc?.slice(1).join('.')}: ${d[0]?.msg}`
    return typeof d === 'string' ? d : 'Failed to save'
  }

  const addMut = useMutation({
    mutationFn: (data) => api.post('/workers/me/offers', data),
    onSuccess: () => { queryClient.invalidateQueries(['my-offers']); setShowAdd(false); toast.success('Offer created') },
    onError: (err) => toast.error(extractError(err)),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/workers/me/offers/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries(['my-offers']); setEditingId(null); toast.success('Updated') },
    onError: (err) => toast.error(extractError(err)),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/workers/me/offers/${id}`),
    onSuccess: () => { queryClient.invalidateQueries(['my-offers']); toast.success('Deleted') },
    onError: () => toast.error('Failed to delete'),
  })

  const editingOffer = offers.find(o => o.id === editingId)
  const active = offers.filter(o => o.is_active && daysLeft(o.valid_until) > 0)
  const inactive = offers.filter(o => !o.is_active || daysLeft(o.valid_until) <= 0)

  return (
    <div className="px-4 pt-5 pb-8 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-syne font-bold text-xl" style={{ color: 'var(--text-primary)' }}>Offers</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {active.length} active · {inactive.length} expired/inactive
          </p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setEditingId(null) }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl btn-brand text-sm font-medium"
        >
          <Plus size={15} /> New
        </button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <OfferForm services={services} packages={packages}
              onSave={(data) => addMut.mutate(data)} onCancel={() => setShowAdd(false)} />
          </motion.div>
        )}
        {editingId && editingOffer && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <OfferForm initial={editingOffer} services={services} packages={packages}
              onSave={(data) => updateMut.mutate({ id: editingId, data })} onCancel={() => setEditingId(null)} />
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : offers.length === 0 && !showAdd ? (
        <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}>
          <Tag className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No offers yet</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Create discount offers or promo codes to attract more customers.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {[...active, ...inactive].filter(o => o.id !== editingId).map(offer => (
              <OfferCard
                key={offer.id}
                offer={offer}
                onEdit={() => { setEditingId(offer.id); setShowAdd(false) }}
                onDelete={() => deleteMut.mutate(offer.id)}
                deleting={deleteMut.isPending && deleteMut.variables === offer.id}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
