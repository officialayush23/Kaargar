import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Edit3, Loader2, Check, Package, X, ChevronDown, ChevronUp } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { Badge } from '@/components/ui/badge'
import { toast } from 'sonner'

const REDEMPTION_OPTIONS = [
  { value: 'multi_use',         label: 'Multi-use',   desc: 'Redeem services separately over time (e.g. 3 haircuts)' },
  { value: 'single_use_bundle', label: 'Bundle',      desc: 'All services used together in one visit' },
]

const inputClass = "w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-all"

function inputStyle(extra = {}) {
  return {
    background: 'var(--g-bg)',
    border: '1px solid var(--g-border)',
    color: 'var(--text-primary)',
    ...extra,
  }
}

function ServicePicker({ services, items, onChange }) {
  function addItem(serviceId) {
    if (items.find(i => i.service_id === serviceId)) return
    onChange([...items, { service_id: serviceId, quantity: 1, redeem_type: 'repeatable' }])
  }
  function removeItem(serviceId) {
    onChange(items.filter(i => i.service_id !== serviceId))
  }
  function updateItem(serviceId, patch) {
    onChange(items.map(i => i.service_id === serviceId ? { ...i, ...patch } : i))
  }

  const unusedServices = services.filter(s => !items.find(i => i.service_id === s.id))

  return (
    <div className="space-y-2">
      <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Included services</p>

      {/* Selected items */}
      <AnimatePresence>
        {items.map(item => {
          const svc = services.find(s => s.id === item.service_id)
          if (!svc) return null
          return (
            <motion.div
              key={item.service_id}
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="rounded-xl p-3 space-y-2"
              style={{ background: 'rgba(59,130,246,0.06)', border: '1px solid rgba(59,130,246,0.15)' }}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium flex-1 truncate" style={{ color: 'var(--text-primary)' }}>{svc.title}</p>
                <button type="button" onClick={() => removeItem(item.service_id)}>
                  <X size={13} style={{ color: 'var(--text-muted)' }} />
                </button>
              </div>
              <div className="flex gap-2">
                <div className="flex-1">
                  <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Qty</p>
                  <input
                    type="number"
                    min={1}
                    max={50}
                    value={item.quantity}
                    onChange={e => updateItem(item.service_id, { quantity: Math.max(1, parseInt(e.target.value) || 1) })}
                    className="w-full rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                    style={inputStyle()}
                  />
                </div>
                <div className="flex-1">
                  <p className="text-[10px] mb-1" style={{ color: 'var(--text-muted)' }}>Redeem</p>
                  <select
                    value={item.redeem_type}
                    onChange={e => updateItem(item.service_id, { redeem_type: e.target.value })}
                    className="w-full rounded-lg px-3 py-1.5 text-sm focus:outline-none"
                    style={inputStyle()}
                  >
                    <option value="repeatable">Repeatable</option>
                    <option value="once">Once only</option>
                  </select>
                </div>
              </div>
            </motion.div>
          )
        })}
      </AnimatePresence>

      {/* Add service dropdown */}
      {unusedServices.length > 0 && (
        <select
          value=""
          onChange={e => { if (e.target.value) addItem(e.target.value) }}
          className={inputClass}
          style={inputStyle({ color: items.length === 0 ? 'var(--text-muted)' : 'var(--text-primary)' })}
        >
          <option value="">+ Add a service...</option>
          {unusedServices.map(s => (
            <option key={s.id} value={s.id}>{s.title}</option>
          ))}
        </select>
      )}
    </div>
  )
}

function PackageForm({ initial, services, onSave, onCancel }) {
  const [title, setTitle]             = useState(initial?.title || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [origPrice, setOrigPrice]     = useState(initial?.original_price || '')
  const [discPrice, setDiscPrice]     = useState(initial?.discounted_price || '')
  const [validity, setValidity]       = useState(initial?.validity_days || '')
  const [redemption, setRedemption]   = useState(initial?.redemption_type || 'multi_use')
  const [items, setItems]             = useState(initial?.items?.map(i => ({
    service_id: i.service_id, quantity: i.quantity, redeem_type: i.redeem_type
  })) || [])
  const [loading, setLoading]         = useState(false)

  const discount = origPrice && discPrice
    ? Math.round((1 - discPrice / origPrice) * 100)
    : 0

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim() || !origPrice || !discPrice) {
      toast.error('Title and pricing are required')
      return
    }
    if (items.length === 0) {
      toast.error('Add at least one service')
      return
    }
    setLoading(true)
    try {
      const payload = {
        title: title.trim(),
        original_price: Number(origPrice),
        discounted_price: Number(discPrice),
        redemption_type: redemption,
        items,
      }
      if (description.trim()) payload.description = description.trim()
      if (validity) payload.validity_days = Number(validity)
      await onSave(payload)
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl p-4 space-y-4" style={{ background: 'var(--g-bg-mid)', border: '1px solid rgba(245,158,11,0.2)' }}>
      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        {initial ? 'Edit package' : 'New package'}
      </p>

      <input
        value={title}
        onChange={e => setTitle(e.target.value)}
        placeholder="Package name (e.g. Monthly Clean Package)"
        required
        className={inputClass}
        style={inputStyle()}
      />

      <textarea
        value={description}
        onChange={e => setDescription(e.target.value)}
        placeholder="Description (optional)"
        rows={2}
        className={inputClass + ' resize-none'}
        style={inputStyle()}
      />

      {/* Pricing row */}
      <div className="grid grid-cols-2 gap-2">
        <div>
          <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Original price ₹</p>
          <input
            type="number"
            value={origPrice}
            onChange={e => setOrigPrice(e.target.value)}
            placeholder="e.g. 1200"
            min={0}
            required
            className={inputClass}
            style={inputStyle()}
          />
        </div>
        <div>
          <p className="text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
            Discounted price ₹
            {discount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full font-bold" style={{ background: 'rgba(52,211,153,0.15)', color: '#34d399' }}>
                -{discount}%
              </span>
            )}
          </p>
          <input
            type="number"
            value={discPrice}
            onChange={e => setDiscPrice(e.target.value)}
            placeholder="e.g. 999"
            min={0}
            required
            className={inputClass}
            style={inputStyle()}
          />
        </div>
      </div>

      {/* Redemption type */}
      <div>
        <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Package type</p>
        <div className="flex rounded-xl p-0.5 gap-0.5" style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}>
          {REDEMPTION_OPTIONS.map(opt => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setRedemption(opt.value)}
              className="flex-1 py-2 px-2 rounded-[10px] text-xs font-semibold transition-all"
              style={
                redemption === opt.value
                  ? { background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }
                  : { color: 'var(--text-muted)', border: '1px solid transparent' }
              }
            >
              {opt.label}
            </button>
          ))}
        </div>
        <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
          {REDEMPTION_OPTIONS.find(o => o.value === redemption)?.desc}
        </p>
      </div>

      {/* Validity */}
      <div>
        <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Validity (days, optional)</p>
        <input
          type="number"
          value={validity}
          onChange={e => setValidity(e.target.value)}
          placeholder="e.g. 30 — leave blank for no expiry"
          min={1}
          className={inputClass}
          style={inputStyle()}
        />
      </div>

      {/* Services */}
      <ServicePicker services={services} items={items} onChange={setItems} />

      <div className="flex gap-2 pt-1">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium"
          style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)', color: 'var(--text-secondary)' }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 py-2.5 rounded-xl text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50"
          style={{ background: 'rgba(245,158,11,0.15)', color: '#f59e0b', border: '1px solid rgba(245,158,11,0.3)' }}
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Save package
        </button>
      </div>
    </form>
  )
}

function PackageCard({ pkg, onEdit, onDelete, deleting }) {
  const [expanded, setExpanded] = useState(false)
  const discount = pkg.original_price && pkg.discounted_price
    ? Math.round((1 - pkg.discounted_price / pkg.original_price) * 100)
    : 0

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.97 }}
      className="rounded-xl overflow-hidden"
      style={{ background: 'var(--g-bg-mid)', border: '1px solid var(--g-border)' }}
    >
      <div className="p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{pkg.title}</p>
              {!pkg.is_active && (
                <span className="text-[10px] px-2 py-0.5 rounded-full" style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171' }}>
                  Inactive
                </span>
              )}
              {discount > 0 && (
                <span className="text-[10px] px-2 py-0.5 rounded-full font-bold" style={{ background: 'rgba(52,211,153,0.12)', color: '#34d399', border: '1px solid rgba(52,211,153,0.2)' }}>
                  -{discount}% off
                </span>
              )}
            </div>
            {pkg.description && (
              <p className="text-xs mt-0.5 line-clamp-1" style={{ color: 'var(--text-muted)' }}>{pkg.description}</p>
            )}
            <div className="flex items-center gap-2 mt-1.5">
              <span className="text-sm font-bold text-amber-400">{formatCurrency(pkg.discounted_price)}</span>
              {pkg.original_price > pkg.discounted_price && (
                <span className="text-xs line-through" style={{ color: 'var(--text-muted)' }}>{formatCurrency(pkg.original_price)}</span>
              )}
              {pkg.validity_days && (
                <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{pkg.validity_days}d validity</span>
              )}
            </div>
          </div>

          <div className="flex gap-1 shrink-0">
            <button
              onClick={() => setExpanded(e => !e)}
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}
            >
              {expanded
                ? <ChevronUp size={13} style={{ color: 'var(--text-muted)' }} />
                : <ChevronDown size={13} style={{ color: 'var(--text-muted)' }} />
              }
            </button>
            <button
              onClick={onEdit}
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}
            >
              <Edit3 size={13} style={{ color: 'var(--text-muted)' }} />
            </button>
            <button
              onClick={onDelete}
              disabled={deleting}
              className="w-8 h-8 rounded-xl flex items-center justify-center"
              style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}
            >
              {deleting
                ? <Loader2 size={13} className="animate-spin" style={{ color: '#f87171' }} />
                : <Trash2 size={13} style={{ color: '#f87171' }} />
              }
            </button>
          </div>
        </div>
      </div>

      <AnimatePresence>
        {expanded && pkg.items?.length > 0 && (
          <motion.div
            initial={{ height: 0 }}
            animate={{ height: 'auto' }}
            exit={{ height: 0 }}
            className="overflow-hidden"
          >
            <div className="px-4 pb-4 pt-0 space-y-1.5" style={{ borderTop: '1px solid var(--g-border)' }}>
              <p className="text-[10px] uppercase tracking-widest font-medium pt-3" style={{ color: 'var(--text-muted)' }}>
                {pkg.items.length} service{pkg.items.length !== 1 ? 's' : ''} included
              </p>
              {pkg.items.map((item, i) => (
                <div key={i} className="flex items-center justify-between">
                  <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                    {item.service?.title || 'Service'}
                  </p>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'var(--g-bg)', color: 'var(--text-muted)' }}>
                      ×{item.quantity}
                    </span>
                    <span className="text-[10px]" style={{ color: 'var(--text-muted)' }}>
                      {item.redeem_type === 'once' ? 'once' : 'repeatable'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  )
}

export default function WorkerPackages() {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd]     = useState(false)
  const [editingId, setEditingId] = useState(null)

  const { data: packages = [], isLoading: pkgLoading } = useQuery({
    queryKey: ['my-packages'],
    queryFn: () => api.get('/workers/me/packages').then(r => r.data),
  })

  const { data: services = [] } = useQuery({
    queryKey: ['my-services'],
    queryFn: () => api.get('/workers/me/services').then(r => r.data),
  })

  const extractError = (err) => {
    const d = err.response?.data?.detail
    if (Array.isArray(d)) return `${d[0]?.loc?.slice(1).join('.')}: ${d[0]?.msg}`
    return typeof d === 'string' ? d : 'Failed to save'
  }

  const addMut = useMutation({
    mutationFn: (data) => api.post('/workers/me/packages', data),
    onSuccess: () => { queryClient.invalidateQueries(['my-packages']); setShowAdd(false); toast.success('Package created') },
    onError: (err) => toast.error(extractError(err)),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/workers/me/packages/${id}`, data),
    onSuccess: () => { queryClient.invalidateQueries(['my-packages']); setEditingId(null); toast.success('Updated') },
    onError: (err) => toast.error(extractError(err)),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/workers/me/packages/${id}`),
    onSuccess: () => { queryClient.invalidateQueries(['my-packages']); toast.success('Deleted') },
    onError: () => toast.error('Failed to delete'),
  })

  const editingPkg = packages.find(p => p.id === editingId)

  return (
    <div className="px-4 pt-5 pb-8 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="font-syne font-bold text-xl" style={{ color: 'var(--text-primary)' }}>Packages</h2>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Bundle services at a discount
          </p>
        </div>
        <button
          onClick={() => { setShowAdd(true); setEditingId(null) }}
          disabled={services.length === 0}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl btn-brand text-sm font-medium disabled:opacity-40"
          title={services.length === 0 ? 'Add services first' : undefined}
        >
          <Plus size={15} /> New
        </button>
      </div>

      {services.length === 0 && (
        <div className="rounded-xl p-4 text-center" style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)' }}>
          <p className="text-sm font-medium" style={{ color: '#f59e0b' }}>Add services first</p>
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Go to Services and add at least one service before creating packages.
          </p>
        </div>
      )}

      <AnimatePresence>
        {showAdd && services.length > 0 && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <PackageForm
              services={services}
              onSave={(data) => addMut.mutate(data)}
              onCancel={() => setShowAdd(false)}
            />
          </motion.div>
        )}
        {editingId && editingPkg && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <PackageForm
              initial={editingPkg}
              services={services}
              onSave={(data) => updateMut.mutate({ id: editingId, data })}
              onCancel={() => setEditingId(null)}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {pkgLoading ? (
        <div className="space-y-2">
          {[...Array(2)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
      ) : packages.length === 0 && !showAdd ? (
        <div className="rounded-2xl p-10 text-center" style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}>
          <Package className="h-10 w-10 mx-auto mb-3" style={{ color: 'var(--text-muted)' }} />
          <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No packages yet</p>
          <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
            Create bundles like "3 Haircuts - 15% off" to attract repeat customers.
          </p>
        </div>
      ) : (
        <div className="space-y-2">
          <AnimatePresence>
            {packages.filter(p => !editingId || p.id !== editingId).map(pkg => (
              <PackageCard
                key={pkg.id}
                pkg={pkg}
                onEdit={() => { setEditingId(pkg.id); setShowAdd(false) }}
                onDelete={() => deleteMut.mutate(pkg.id)}
                deleting={deleteMut.isPending && deleteMut.variables === pkg.id}
              />
            ))}
          </AnimatePresence>
        </div>
      )}
    </div>
  )
}
