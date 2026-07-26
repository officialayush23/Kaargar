/**
 * AdminServiceCatalog — manage the admin-curated catalog of Instant-mode
 * services under each profession. This is the ONLY way a service becomes
 * bookable in Instant mode (see SYSTEM_OVERVIEW.md §11) — worker-added
 * free-text services live in Discover only and never need review.
 *
 * Every service created here notifies all workers registered under that
 * profession so they can opt in from their own Services page — this form
 * never touches, renames, or links any worker's existing listing.
 *
 * Can be opened pre-filled from AdminServiceRankings (via navigate state:
 * { category_id, name, description }) — purely a naming suggestion, not a
 * link to the worker service that inspired it.
 */
import { useState, useEffect, useRef } from 'react'
import { useLocation, useNavigate } from 'react-router-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Power, PowerOff, Search, Sparkles, Upload, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { getErrorMessage, formatCurrency } from '@/lib/utils'
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
import { GlassSelect } from '@/components/glass/GlassSelect'

const EMPTY_FORM = { category_id: '', name: '', description: '', base_price: '', sort_order: 0 }

// Icon upload — only meaningful once the catalog entry has an id (a new,
// not-yet-created entry has nowhere to attach the file to yet). Stored in
// the dedicated instant_services Supabase bucket via the admin endpoint.
function IconUploadButton({ entryId, currentUrl, onUploaded }) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef()

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    setUploading(true)
    try {
      const { data } = await api.post(`/admin/service-catalog/${entryId}/upload-icon`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      onUploaded(data.icon_url)
      toast.success('Icon uploaded')
    } catch (err) {
      toast.error(getErrorMessage(err, 'Upload failed'))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {currentUrl && (
        <img src={currentUrl} alt="icon" style={{ width: 32, height: 32, objectFit: 'cover', borderRadius: 8 }} />
      )}
      <input ref={inputRef} type="file" accept="image/png,image/webp,image/jpeg,image/gif" className="hidden" onChange={handleFile} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
      >
        {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
        {currentUrl ? 'Replace icon' : 'Upload icon'}
      </button>
    </div>
  )
}

function ServiceForm({ initial, categories, onSubmit, onCancel, loading, suggested }) {
  const qc = useQueryClient()
  const [form, setForm] = useState(initial || EMPTY_FORM)
  const [iconUrl, setIconUrl] = useState(initial?.icon_url || null)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  return (
    <div className="space-y-4">
      {suggested && (
        <div className="flex items-center gap-2 p-3 rounded-xl"
          style={{ background: 'rgba(245,158,11,0.08)', border: '1px solid rgba(245,158,11,0.25)' }}>
          <Sparkles className="h-4 w-4 flex-shrink-0" style={{ color: 'var(--amber)' }} />
          <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
            Suggested from a top-performing worker listing — this creates a brand new, independent
            Instant service. It won't touch or rename that worker's own listing.
          </p>
        </div>
      )}

      <div className="space-y-1">
        <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Profession *</label>
        <GlassSelect
          value={form.category_id}
          onChange={v => set('category_id', v)}
          placeholder="Select profession"
          options={categories.map(c => ({ value: c.id, label: c.name }))}
        />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Service name *</label>
        <Input value={form.name} onChange={e => set('name', e.target.value)} placeholder="e.g. Ceiling fan installation" />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Description</label>
        <Input value={form.description || ''} onChange={e => set('description', e.target.value)} placeholder="Short description (optional)" />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Base price (₹)</label>
        <Input
          type="number"
          value={form.base_price ?? ''}
          onChange={e => set('base_price', e.target.value)}
          placeholder="Leave blank to use the profession's default minimum"
        />
        <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
          Shown to customers as the starting price before any worker offers it, and enforced as the
          minimum a worker can charge for this exact service — overrides the profession's blanket minimum.
        </p>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Sort order</label>
        <Input type="number" value={form.sort_order} onChange={e => set('sort_order', Number(e.target.value))} placeholder="0" />
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>Icon / photo</label>
        {initial?.id ? (
          <IconUploadButton
            entryId={initial.id}
            currentUrl={iconUrl}
            onUploaded={(url) => { setIconUrl(url); qc.invalidateQueries({ queryKey: ['admin-service-catalog'] }) }}
          />
        ) : (
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Save this service first, then come back to add an icon.</p>
        )}
      </div>

      <DialogFooter className="gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button
          onClick={() => onSubmit({ ...form, base_price: form.base_price === '' ? undefined : Number(form.base_price) })}
          disabled={loading || !form.name || !form.category_id}
        >
          {loading ? 'Saving…' : (initial?.id ? 'Save Changes' : 'Create Service')}
        </Button>
      </DialogFooter>
    </div>
  )
}

export default function AdminServiceCatalog() {
  const qc = useQueryClient()
  const navigate = useNavigate()
  const routeState = useLocation().state || {}

  const [search, setSearch] = useState('')
  const [categoryFilter, setCategoryFilter] = useState('all')
  const [sortBy, setSortBy] = useState('sort_order') // 'sort_order' | 'bookings' | 'date_added'
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)
  const [deleting, setDeleting] = useState(null)
  const [prefill, setPrefill] = useState(null)
  const [suggested, setSuggested] = useState(false)

  const { data: categories = [] } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => api.get('/admin/categories').then(r => r.data),
  })

  const { data: services = [], isLoading } = useQuery({
    queryKey: ['admin-service-catalog', categoryFilter, sortBy],
    queryFn: () => api.get('/admin/service-catalog', {
      params: {
        ...(categoryFilter !== 'all' ? { category_id: categoryFilter } : {}),
        ...(sortBy === 'bookings' ? { sort: 'bookings' } : {}),
      },
    }).then(r => r.data),
  })

  // Arrived via a "suggest as Instant" jump from the rankings page — open
  // the create dialog pre-filled with just a naming suggestion (category +
  // name), never a link to the worker service that inspired it.
  useEffect(() => {
    if (routeState.category_id || routeState.name) {
      setPrefill({
        category_id: routeState.category_id || '',
        name: routeState.name || '',
        description: routeState.description || '',
        base_price: '',
        sort_order: 0,
      })
      setSuggested(true)
      setCreating(true)
      // Clear the location state so a refresh doesn't reopen the dialog.
      navigate('.', { replace: true, state: {} })
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const createMut = useMutation({
    mutationFn: body => api.post('/admin/service-catalog', body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-service-catalog'] })
      qc.invalidateQueries({ queryKey: ['admin-worker-services-top'] })
      setCreating(false)
      setPrefill(null)
      toast.success('Instant service created')
    },
    onError: (e) => toast.error(getErrorMessage(e, 'Create failed')),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, body }) => api.patch(`/admin/service-catalog/${id}`, body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-service-catalog'] })
      setEditing(null)
      toast.success('Service updated')
    },
    onError: (e) => toast.error(getErrorMessage(e, 'Update failed')),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/admin/service-catalog/${id}`).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['admin-service-catalog'] })
      setDeleting(null)
      toast.success(data.message || 'Done')
    },
    onError: (e) => toast.error(getErrorMessage(e, 'Delete failed')),
  })

  const toggleActive = (svc) => updateMut.mutate({ id: svc.id, body: { is_active: !svc.is_active } })

  const catName = (id) => categories.find(c => c.id === id)?.name || '—'

  let filtered = services.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase())
  )
  if (sortBy === 'date_added') {
    filtered = [...filtered].sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>Instant Services</h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            The curated catalog customers pick from in Instant mode — the only path to becoming Instant-eligible.
          </p>
        </div>
        <Button onClick={() => { setPrefill(null); setSuggested(false); setCreating(true) }} className="flex items-center gap-2">
          <Plus className="h-4 w-4" /> Add Service
        </Button>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-muted)' }} />
          <Input className="pl-9" placeholder="Search services…" value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <GlassSelect
          value={categoryFilter}
          onChange={setCategoryFilter}
          options={[{ value: 'all', label: 'All professions' }, ...categories.map(c => ({ value: c.id, label: c.name }))]}
        />
        <GlassSelect
          value={sortBy}
          onChange={setSortBy}
          options={[
            { value: 'sort_order', label: 'Default order' },
            { value: 'bookings', label: 'Most booked' },
            { value: 'date_added', label: 'Newest first' },
          ]}
        />
      </div>

      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
              {['Service', 'Profession', 'Base Price', 'Booked', 'Status', 'Actions'].map(h => (
                <th key={h} className="px-4 py-3 text-left font-medium"
                  style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {isLoading ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading…</td></tr>
            ) : filtered.length === 0 ? (
              <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>No services found</td></tr>
            ) : filtered.map((svc, idx) => (
              <tr key={svc.id} style={{
                borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                opacity: svc.is_active ? 1 : 0.5,
              }}>
                <td className="px-4 py-3">
                  <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{svc.name}</div>
                  {svc.description && (
                    <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{svc.description}</div>
                  )}
                </td>
                <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{catName(svc.category_id)}</td>
                <td className="px-4 py-3 font-mono" style={{ color: 'var(--text-secondary)' }}>
                  {svc.base_price != null ? formatCurrency(svc.base_price) : <span style={{ color: 'var(--text-muted)' }}>—</span>}
                </td>
                <td className="px-4 py-3 font-mono" style={{ color: 'var(--text-secondary)' }}>{svc.total_bookings}</td>
                <td className="px-4 py-3">
                  <span className="px-2 py-1 rounded-full text-xs font-medium"
                    style={{
                      background: svc.is_active ? 'rgba(34,197,94,0.12)' : 'rgba(107,114,128,0.12)',
                      color: svc.is_active ? '#4ade80' : 'var(--text-muted)',
                    }}>
                    {svc.is_active ? 'Active' : 'Inactive'}
                  </span>
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-1">
                    <button onClick={() => setEditing(svc)} title="Edit"
                      className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                      style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}>
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button onClick={() => toggleActive(svc)} title={svc.is_active ? 'Deactivate' : 'Activate'}
                      className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                      style={{ color: svc.is_active ? '#f87171' : '#4ade80', background: 'none', border: 'none', cursor: 'pointer' }}>
                      {svc.is_active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                    </button>
                    <button onClick={() => setDeleting(svc)} title="Delete"
                      className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                      style={{ color: '#f87171', background: 'none', border: 'none', cursor: 'pointer' }}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Dialog open={creating} onOpenChange={(v) => { setCreating(v); if (!v) { setPrefill(null); setSuggested(false) } }}>
        <DialogContent style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', maxWidth: 480 }}>
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--text-primary)' }}>Add Instant Service</DialogTitle>
          </DialogHeader>
          <ServiceForm
            initial={prefill}
            suggested={suggested}
            categories={categories}
            onSubmit={(form) => createMut.mutate(form)}
            onCancel={() => { setCreating(false); setPrefill(null); setSuggested(false) }}
            loading={createMut.isPending}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <DialogContent style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', maxWidth: 480 }}>
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--text-primary)' }}>Edit Instant Service</DialogTitle>
          </DialogHeader>
          {editing && (
            <ServiceForm
              initial={editing}
              categories={categories}
              onSubmit={(form) => updateMut.mutate({ id: editing.id, body: form })}
              onCancel={() => setEditing(null)}
              loading={updateMut.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleting} onOpenChange={v => !v && setDeleting(null)}>
        <AlertDialogContent style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: 'var(--text-primary)' }}>Delete "{deleting?.name}"?</AlertDialogTitle>
            <AlertDialogDescription style={{ color: 'var(--text-muted)' }}>
              If workers are already linked to this service it will be deactivated instead of deleted.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteMut.mutate(deleting.id)} style={{ background: '#ef4444', color: '#fff' }}>
              {deleteMut.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
