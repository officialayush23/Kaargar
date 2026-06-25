import { useState, useRef } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Edit3, Loader2, Check, MapPin, Store, Tag, X } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

const MODE_OPTIONS = [
  { value: 'walkin', label: 'Walk-in', icon: Store, tip: 'Customer comes to you' },
  { value: 'onsite', label: 'On-site', icon: MapPin, tip: 'You go to customer' },
  { value: 'both',   label: 'Both',    icon: null,  tip: 'Either works' },
]

const MODE_COLORS = {
  walkin: { bg: 'rgba(168,85,247,0.12)', color: '#a855f7', border: 'rgba(168,85,247,0.25)' },
  onsite: { bg: 'rgba(59,130,246,0.12)', color: '#60a5fa', border: 'rgba(59,130,246,0.25)' },
  both:   { bg: 'rgba(52,211,153,0.12)', color: '#34d399', border: 'rgba(52,211,153,0.25)' },
}

function ServiceModeToggle({ value, onChange }) {
  return (
    <div>
      <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Service mode</p>
      <div className="flex rounded-xl p-0.5 gap-0.5" style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}>
        {MODE_OPTIONS.map(opt => {
          const active = value === opt.value
          return (
            <button key={opt.value} type="button" onClick={() => onChange(opt.value)}
              className="flex-1 py-2 px-2 rounded-[10px] text-xs font-semibold transition-all duration-150 flex items-center justify-center gap-1"
              style={active ? { background: MODE_COLORS[opt.value].bg, color: MODE_COLORS[opt.value].color, border: `1px solid ${MODE_COLORS[opt.value].border}` } : { color: 'var(--text-muted)', border: '1px solid transparent' }}
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

// ── Tag input ─────────────────────────────────────────────────────────────────
function TagInput({ selectedTags, onChange }) {
  const [input, setInput]             = useState('')
  const [suggestions, setSuggestions] = useState([])
  const [showDrop, setShowDrop]       = useState(false)
  const [timer, setTimer]             = useState(null)
  const inputRef = useRef()

  const fetchSugg = async (q) => {
    if (!q.trim()) { setSuggestions([]); return }
    try {
      const { data } = await api.get('/workers/tags', { params: { q } })
      setSuggestions(data.filter(t => !selectedTags.find(s => s.id === t.id)))
    } catch { setSuggestions([]) }
  }

  const handleInput = (e) => {
    const val = e.target.value
    setInput(val)
    setShowDrop(true)
    clearTimeout(timer)
    setTimer(setTimeout(() => fetchSugg(val), 220))
  }

  const addExisting = (tag) => {
    onChange([...selectedTags, tag])
    setInput(''); setSuggestions([]); setShowDrop(false)
    inputRef.current?.focus()
  }

  const addNew = () => {
    const name = input.trim()
    if (name.length < 2) return
    const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
    if (selectedTags.find(t => t.slug === slug || t.name.toLowerCase() === name.toLowerCase())) {
      setInput(''); return
    }
    onChange([...selectedTags, { id: `__new__${slug}`, name, slug, isNew: true }])
    setInput(''); setSuggestions([]); setShowDrop(false)
    inputRef.current?.focus()
  }

  const removeTag = (id) => onChange(selectedTags.filter(t => t.id !== id))

  const handleKeyDown = (e) => {
    if ((e.key === 'Enter' || e.key === ',') && input.trim()) {
      e.preventDefault()
      if (suggestions.length > 0 && suggestions[0].name.toLowerCase() === input.trim().toLowerCase()) {
        addExisting(suggestions[0])
      } else {
        addNew()
      }
    }
    if (e.key === 'Backspace' && !input && selectedTags.length > 0) removeTag(selectedTags[selectedTags.length - 1].id)
    if (e.key === 'Escape') setShowDrop(false)
  }

  return (
    <div>
      <p className="text-xs font-medium mb-1.5 flex items-center gap-1" style={{ color: 'var(--text-muted)' }}>
        <Tag size={11} /> Tags
        <span style={{ fontWeight: 400 }}> — helps customers find you</span>
      </p>
      <div
        className="flex flex-wrap gap-1.5 rounded-xl px-3 py-2 min-h-[42px] cursor-text"
        style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}
        onClick={() => inputRef.current?.focus()}
      >
        {selectedTags.map(tag => (
          <span key={tag.id} className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full font-medium"
            style={{ background: '#2D1A06', color: '#F59E0B', border: `1px solid #92400E` }}>
            {tag.name}
            <button type="button" onClick={(e) => { e.stopPropagation(); removeTag(tag.id) }} className="opacity-60 hover:opacity-100">
              <X size={10} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (input) setShowDrop(true) }}
          onBlur={() => setTimeout(() => setShowDrop(false), 150)}
          placeholder={selectedTags.length === 0 ? 'Type a tag, press Enter...' : ''}
          className="flex-1 bg-transparent text-sm outline-none"
          style={{ color: 'var(--text-primary)', minWidth: 80 }}
        />
      </div>
      <AnimatePresence>
        {showDrop && (suggestions.length > 0 || input.trim().length >= 2) && (
          <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.1 }} className="mt-1 rounded-xl overflow-hidden"
            style={{ background: 'var(--g-bg-mid)', border: '1px solid var(--g-border)', position: 'relative', zIndex: 20 }}>
            {suggestions.map(tag => (
              <button key={tag.id} type="button" onMouseDown={() => addExisting(tag)}
                className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-white/5 transition-colors text-left"
                style={{ color: 'var(--text-primary)' }}>
                <span>{tag.name}</span>
                {tag.usage_count > 0 && <span className="text-xs" style={{ color: 'var(--text-muted)' }}>{tag.usage_count} uses</span>}
              </button>
            ))}
            {input.trim().length >= 2 && !suggestions.find(t => t.name.toLowerCase() === input.trim().toLowerCase()) && (
              <button type="button" onMouseDown={addNew}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm hover:bg-white/5 transition-colors text-left"
                style={{ color: '#F59E0B' }}>
                <Plus size={12} /> Create "{input.trim()}"
              </button>
            )}
          </motion.div>
        )}
      </AnimatePresence>
      <p className="text-[10px] mt-1" style={{ color: 'var(--text-muted)' }}>
        Press Enter or comma to add · Backspace to remove
      </p>
    </div>
  )
}

// ── Service form ──────────────────────────────────────────────────────────────
function ServiceForm({ initial, onSave, onCancel, minPrice }) {
  const [title, setTitle]             = useState(initial?.title || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [hourlyRate, setHourlyRate]   = useState(initial?.hourly_rate || initial?.price || '')
  const [serviceMode, setServiceMode] = useState(initial?.service_mode || 'both')
  const [visitFee, setVisitFee]       = useState(initial?.visit_fee || '')
  const [tags, setTags]               = useState(initial?.tags || [])
  const [loading, setLoading]         = useState(false)
  const [priceError, setPriceError]   = useState('')
  const showVisitFee = serviceMode === 'onsite' || serviceMode === 'both'

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    // Frontend price floor guard (mirrors backend)
    if (minPrice && hourlyRate && Number(hourlyRate) < Number(minPrice)) {
      setPriceError(`Minimum price for this category is ₹${minPrice}`)
      return
    }
    setPriceError('')
    setLoading(true)
    try {
      const payload = { title: title.trim(), service_mode: serviceMode, _tags: tags }
      if (description.trim()) payload.description = description.trim()
      if (hourlyRate && !isNaN(Number(hourlyRate))) payload.hourly_rate = Number(hourlyRate)
      if (showVisitFee && visitFee && !isNaN(Number(visitFee))) payload.visit_fee = Number(visitFee)
      await onSave(payload)
    } finally {
      setLoading(false)
    }
  }

  const inp = "w-full rounded-xl px-4 py-2.5 text-sm focus:outline-none transition-all"
  const inpStyle = { background: 'var(--g-bg)', border: '1px solid var(--g-border)', color: 'var(--text-primary)' }
  const inpErrorStyle = { ...inpStyle, border: '1px solid rgba(239,68,68,0.5)' }

  return (
    <form onSubmit={handleSubmit} className="rounded-2xl p-4 space-y-3"
      style={{ background: 'var(--g-bg-mid)', border: '1px solid var(--border)' }}>
      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
        {initial ? 'Edit service' : 'Add service'}
      </p>
      <input value={title} onChange={e => setTitle(e.target.value)}
        placeholder="Service title (e.g. Plumbing repair)" required className={inp} style={inpStyle} />
      <textarea value={description} onChange={e => setDescription(e.target.value)}
        placeholder="Brief description (optional)" rows={2} className={inp + ' resize-none'} style={inpStyle} />
      <div className="grid grid-cols-2 gap-2">
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <p className="text-xs font-medium" style={{ color: 'var(--text-muted)' }}>Base rate ₹</p>
            {minPrice && (
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded-md"
                style={{ background: '#251606', color: '#f59e0b' }}>
                Min ₹{minPrice}
              </span>
            )}
          </div>
          <input type="number" value={hourlyRate}
            onChange={e => { setHourlyRate(e.target.value); setPriceError('') }}
            placeholder={minPrice ? `Min ₹${minPrice}` : 'e.g. 499'}
            min={minPrice || 0} className={inp}
            style={priceError ? inpErrorStyle : inpStyle} />
          {priceError && (
            <p className="text-[10px] mt-1" style={{ color: '#f87171' }}>{priceError}</p>
          )}
        </div>
        <AnimatePresence>
          {showVisitFee && (
            <motion.div initial={{ opacity: 0, x: 8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 8 }} transition={{ duration: 0.15 }}>
              <p className="text-xs font-medium mb-1.5" style={{ color: 'var(--text-muted)' }}>Visit fee ₹</p>
              <input type="number" value={visitFee} onChange={e => setVisitFee(e.target.value)}
                placeholder="e.g. 99" min={0} className={inp} style={inpStyle} />
            </motion.div>
          )}
        </AnimatePresence>
      </div>
      <ServiceModeToggle value={serviceMode} onChange={setServiceMode} />
      <TagInput selectedTags={tags} onChange={setTags} />
      <div className="flex gap-2 pt-1">
        <button type="button" onClick={onCancel} className="flex-1 py-2.5 rounded-xl text-sm font-medium transition-colors"
          style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)', color: 'var(--text-secondary)' }}>
          Cancel
        </button>
        <button type="submit" disabled={loading || !title.trim()}
          className="flex-1 py-2.5 rounded-xl btn-brand text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-50">
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
          Save
        </button>
      </div>
    </form>
  )
}

// ── Service card ──────────────────────────────────────────────────────────────
function ServiceCard({ svc, onEdit, onDelete, deleting }) {
  const modeColor = MODE_COLORS[svc.service_mode || 'both']
  const modeLabel = MODE_OPTIONS.find(o => o.value === (svc.service_mode || 'both'))?.label || 'Both'
  const tags = svc.tags || []

  return (
    <motion.div initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, scale: 0.97 }}
      className="rounded-xl p-4" style={{ background: 'var(--g-bg-mid)', border: '1px solid var(--g-border)' }}>
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{svc.title}</p>
            <span className="text-[10px] px-2 py-0.5 rounded-full font-medium"
              style={{ background: modeColor.bg, color: modeColor.color, border: `1px solid ${modeColor.border}` }}>
              {modeLabel}
            </span>
          </div>
          {svc.description && (
            <p className="text-xs mt-0.5 line-clamp-2" style={{ color: 'var(--text-muted)' }}>{svc.description}</p>
          )}
          <div className="flex items-center gap-3 mt-1.5">
            {(svc.price > 0 || svc.hourly_rate > 0) && (
              <span className="text-xs font-semibold" style={{ color: 'var(--azure, #60a5fa)' }}>{formatCurrency(svc.price || svc.hourly_rate)}</span>
            )}
            {svc.visit_fee > 0 && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>+{formatCurrency(svc.visit_fee)} visit fee</span>
            )}
            {svc.avg_rating > 0 && (
              <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                ★ {Number(svc.avg_rating).toFixed(1)} ({svc.rating_count})
              </span>
            )}
          </div>
          {tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {tags.map(tag => (
                <span key={tag.id} className="text-[10px] px-2 py-0.5 rounded-full"
                  style={{ background: 'rgba(245,158,11,0.10)', color: 'var(--brand)', border: '1px solid rgba(245,158,11,0.25)' }}>
                  {tag.name}
                </span>
              ))}
            </div>
          )}
        </div>
        <div className="flex gap-1 shrink-0">
          <button onClick={onEdit} className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
            style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}>
            <Edit3 size={13} style={{ color: 'var(--text-muted)' }} />
          </button>
          <button onClick={onDelete} disabled={deleting} className="w-8 h-8 rounded-xl flex items-center justify-center transition-colors"
            style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)' }}>
            {deleting ? <Loader2 size={13} className="animate-spin" style={{ color: '#f87171' }} /> : <Trash2 size={13} style={{ color: '#f87171' }} />}
          </button>
        </div>
      </div>
    </motion.div>
  )
}

// ── Save tags helper ──────────────────────────────────────────────────────────
async function saveTags(serviceId, tags) {
  const tag_ids       = (tags || []).filter(t => !t.isNew).map(t => t.id)
  const new_tag_names = (tags || []).filter(t => t.isNew).map(t => t.name)
  await api.put(`/workers/me/services/${serviceId}/tags`, { tag_ids, new_tag_names })
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function WorkerServices() {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd]     = useState(false)
  const [editingId, setEditingId] = useState(null)

  const { data: services = [], isLoading } = useQuery({
    queryKey: ['my-services'],
    queryFn: () => api.get('/workers/me/services').then(r => r.data),
  })

  // Fetch worker's categories to derive the effective min_price hint
  const { data: minPrice } = useQuery({
    queryKey: ['worker-min-price'],
    queryFn: async () => {
      // Get the worker's first category's min_price from the categories list
      const [profRes, catsRes] = await Promise.all([
        api.get('/workers/profile'),
        api.get('/categories'),
      ])
      // WorkerProfile has category_ids via WorkerCategory join — but the profile
      // endpoint doesn't return them directly. Use the services list to infer
      // the category, or fall back to global categories minimum.
      const allCats = Array.isArray(catsRes.data) ? catsRes.data : []
      if (allCats.length === 0) return null
      // Use the minimum min_price across all active categories as a safe floor
      const floors = allCats.map(c => Number(c.min_price || 0)).filter(n => n > 0)
      return floors.length > 0 ? Math.min(...floors) : null
    },
    staleTime: 5 * 60 * 1000,
  })

  const extractError = (err) => {
    const detail = err.response?.data?.detail
    if (Array.isArray(detail)) return `${detail[0]?.loc?.slice(1).join('.') || 'Field'}: ${detail[0]?.msg}`
    return typeof detail === 'string' ? detail : 'Failed to save service'
  }

  const addMut = useMutation({
    mutationFn: async (data) => {
      const { _tags, ...payload } = data
      const res = await api.post('/workers/me/services', payload)
      if (_tags && _tags.length > 0) await saveTags(res.data.id, _tags)
      return res
    },
    onSuccess: () => { queryClient.invalidateQueries(['my-services']); setShowAdd(false); toast.success('Service added') },
    onError: (err) => { console.error(err.response?.data); toast.error(extractError(err)) },
  })

  const updateMut = useMutation({
    mutationFn: async ({ id, data }) => {
      const { _tags, ...payload } = data
      const res = await api.patch(`/workers/me/services/${id}`, payload)
      await saveTags(id, _tags || [])
      return res
    },
    onSuccess: () => { queryClient.invalidateQueries(['my-services']); setEditingId(null); toast.success('Updated') },
    onError: (err) => { console.error(err.response?.data); toast.error(extractError(err)) },
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
          <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
            {services.length} service{services.length !== 1 ? 's' : ''} listed
          </p>
        </div>
        <button onClick={() => { setShowAdd(true); setEditingId(null) }}
          className="flex items-center gap-1.5 px-3 py-2 rounded-xl btn-brand text-sm font-medium">
          <Plus size={15} /> Add
        </button>
      </div>

      <AnimatePresence>
        {showAdd && (
          <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}>
            <ServiceForm onSave={(data) => addMut.mutate(data)} onCancel={() => setShowAdd(false)} minPrice={minPrice} />
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        <div className="space-y-2">{[...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}</div>
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
                  <ServiceForm initial={svc} onSave={(data) => updateMut.mutate({ id: svc.id, data })} onCancel={() => setEditingId(null)} minPrice={minPrice} />
                </motion.div>
              ) : (
                <ServiceCard key={svc.id} svc={svc}
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
