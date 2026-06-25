import { useState, useRef } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Pencil, Trash2, Power, PowerOff, Zap, Search, ChevronUp, ChevronDown, Upload, Loader2, ImageIcon } from 'lucide-react'
import { api } from '@/lib/api'
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
import { Badge } from '@/components/ui/badge'

const MODE_COLORS = {
  instant:   { bg: 'rgba(34,197,94,0.12)',  text: '#4ade80',  label: 'Instant'   },
  discovery: { bg: '#251606', text: '#fbbf24',  label: 'Discovery' },
  both:      { bg: 'rgba(99,102,241,0.12)', text: '#a5b4fc',  label: 'Both'      },
}

const ICON_OPTIONS = [
  'Zap','Droplets','Wind','Hammer','WashingMachine','Sparkles','Brush',
  'KeyRound','Laptop','Bug','Wrench','PackageOpen','Car','Armchair',
  'Camera','Video','Music','Disc3','Home','Heart','PartyPopper',
  'Dumbbell','Leaf','GraduationCap','ChefHat','Scissors','Hand',
  'UtensilsCrossed','Shield','Users','Briefcase',
]

const EMPTY_FORM = {
  name: '', slug: '', description: '', icon_name: 'Wrench', icon_emoji: '',
  icon_url: '', color_hex: '#6B7280', mode: 'instant', is_featured: false,
  sort_order: 99, min_price: 150,
}

/* ── Icon Upload Button ── */
function IconUploadButton({ categoryId, currentUrl, onUploaded }) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef()

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    setUploading(true)
    try {
      const { data } = await api.post(`/admin/categories/${categoryId}/upload-icon`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      onUploaded(data.icon_url)
      toast.success('Icon uploaded')
    } catch (err) {
      toast.error(err.response?.data?.detail || 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="flex items-center gap-2">
      {currentUrl && (
        <img src={currentUrl} alt="icon" style={{ width: 28, height: 28, objectFit: 'contain', borderRadius: 6 }} />
      )}
      <input ref={inputRef} type="file" accept="image/png,image/webp,image/svg+xml,application/json,image/gif" className="hidden" onChange={handleFile} />
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={uploading}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors"
        style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-secondary)' }}
      >
        {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
        {currentUrl ? 'Replace' : 'Upload PNG/Lottie'}
      </button>
    </div>
  )
}

function slugify(str) {
  return str.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

function CategoryForm({ initial, onSubmit, onCancel, loading }) {
  const [form, setForm] = useState(initial || EMPTY_FORM)
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }))

  const handleName = (e) => {
    const name = e.target.value
    set('name', name)
    if (!initial) set('slug', slugify(name))   // auto-slug only on create
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Name *
          </label>
          <Input value={form.name} onChange={handleName} placeholder="e.g. Electrician" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Slug *
          </label>
          <Input value={form.slug}
            onChange={e => set('slug', e.target.value)}
            placeholder="electrician" />
        </div>
      </div>

      <div className="space-y-1">
        <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
          Description
        </label>
        <Input value={form.description || ''}
          onChange={e => set('description', e.target.value)}
          placeholder="Short description (optional)" />
      </div>

      <div className="grid grid-cols-3 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Mode *
          </label>
          <select value={form.mode} onChange={e => set('mode', e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            <option value="instant">Instant</option>
            <option value="discovery">Discovery</option>
            <option value="both">Both</option>
          </select>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Min Price (₹)
          </label>
          <Input type="number" value={form.min_price}
            onChange={e => set('min_price', Number(e.target.value))}
            placeholder="150" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Sort Order
          </label>
          <Input type="number" value={form.sort_order}
            onChange={e => set('sort_order', Number(e.target.value))}
            placeholder="99" />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Color
          </label>
          <div className="flex items-center gap-2">
            <input type="color" value={form.color_hex || '#6B7280'}
              onChange={e => set('color_hex', e.target.value)}
              className="h-9 w-12 rounded cursor-pointer"
              style={{ border: '1px solid var(--border)', background: 'none', padding: '2px' }} />
            <Input value={form.color_hex || ''} onChange={e => set('color_hex', e.target.value)}
              placeholder="#6B7280" className="font-mono text-sm" />
          </div>
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Icon (Lucide name)
          </label>
          <select value={form.icon_name || ''} onChange={e => set('icon_name', e.target.value)}
            className="w-full px-3 py-2 rounded-lg text-sm"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
            {ICON_OPTIONS.map(ic => (
              <option key={ic} value={ic}>{ic}</option>
            ))}
          </select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Emoji (optional)
          </label>
          <Input value={form.icon_emoji || ''} onChange={e => set('icon_emoji', e.target.value)}
            placeholder="e.g. ⚡" className="text-xl" maxLength={4} />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium" style={{ color: 'var(--text-secondary)' }}>
            Custom Icon URL (PNG/SVG/Lottie)
          </label>
          <p className="text-[11px]" style={{ color: 'var(--text-muted)' }}>
            Save the category first, then upload via the icon button in the table.
          </p>
        </div>
      </div>

      <div className="flex items-center gap-2">
        <input type="checkbox" id="featured" checked={!!form.is_featured}
          onChange={e => set('is_featured', e.target.checked)}
          className="rounded" />
        <label htmlFor="featured" className="text-sm" style={{ color: 'var(--text-secondary)' }}>
          Featured (shown prominently in app)
        </label>
      </div>

      <DialogFooter className="gap-2 pt-2">
        <Button variant="ghost" onClick={onCancel} disabled={loading}>Cancel</Button>
        <Button onClick={() => onSubmit(form)} disabled={loading || !form.name || !form.slug}>
          {loading ? 'Saving…' : (initial ? 'Save Changes' : 'Create Profession')}
        </Button>
      </DialogFooter>
    </div>
  )
}

export default function AdminCategories() {
  const qc = useQueryClient()
  const [search, setSearch] = useState('')
  const [modeFilter, setModeFilter] = useState('all')
  const [showInactive, setShowInactive] = useState(false)
  const [creating, setCreating] = useState(false)
  const [editing, setEditing] = useState(null)   // category object
  const [deleting, setDeleting] = useState(null) // category object

  const { data: categories = [], isLoading } = useQuery({
    queryKey: ['admin-categories'],
    queryFn: () => api.get('/admin/categories').then(r => r.data),
  })

  const createMut = useMutation({
    mutationFn: body => api.post('/admin/categories', body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-categories'] })
      qc.invalidateQueries({ queryKey: ['categories'] })
      setCreating(false)
      toast.success('Profession created')
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Create failed'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, body }) => api.patch(`/admin/categories/${id}`, body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['admin-categories'] })
      qc.invalidateQueries({ queryKey: ['categories'] })
      setEditing(null)
      toast.success('Profession updated')
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Update failed'),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/admin/categories/${id}`).then(r => r.data),
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['admin-categories'] })
      qc.invalidateQueries({ queryKey: ['categories'] })
      setDeleting(null)
      toast.success(data.message || 'Done')
    },
    onError: (e) => toast.error(e.response?.data?.detail || 'Delete failed'),
  })

  const toggleActive = (cat) => {
    updateMut.mutate({ id: cat.id, body: { is_active: !cat.is_active } })
  }

  const reorder = (cat, dir) => {
    updateMut.mutate({ id: cat.id, body: { sort_order: cat.sort_order + dir } })
  }

  const filtered = categories.filter(c => {
    if (!showInactive && !c.is_active) return false
    if (modeFilter !== 'all' && c.mode !== modeFilter) return false
    if (search && !c.name.toLowerCase().includes(search.toLowerCase())) return false
    return true
  })

  const stats = {
    total: categories.length,
    active: categories.filter(c => c.is_active).length,
    instant: categories.filter(c => c.mode === 'instant' && c.is_active).length,
    discovery: categories.filter(c => c.mode === 'discovery' && c.is_active).length,
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ color: 'var(--text-primary)' }}>
            Professions
          </h1>
          <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
            Control which professions workers can register under
          </p>
        </div>
        <Button onClick={() => setCreating(true)} className="flex items-center gap-2">
          <Plus className="h-4 w-4" />
          Add Profession
        </Button>
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label: 'Total', value: stats.total },
          { label: 'Active', value: stats.active, color: '#4ade80' },
          { label: 'Instant', value: stats.instant, color: '#4ade80' },
          { label: 'Discovery', value: stats.discovery, color: '#fbbf24' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-4"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
            <div className="text-2xl font-bold font-mono" style={{ color: s.color || 'var(--text-primary)' }}>
              {s.value}
            </div>
            <div className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-48">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4" style={{ color: 'var(--text-muted)' }} />
          <Input className="pl-9" placeholder="Search professions…"
            value={search} onChange={e => setSearch(e.target.value)} />
        </div>
        <select value={modeFilter} onChange={e => setModeFilter(e.target.value)}
          className="px-3 py-2 rounded-lg text-sm"
          style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}>
          <option value="all">All modes</option>
          <option value="instant">Instant</option>
          <option value="discovery">Discovery</option>
          <option value="both">Both</option>
        </select>
        <label className="flex items-center gap-2 text-sm cursor-pointer select-none"
          style={{ color: 'var(--text-secondary)' }}>
          <input type="checkbox" checked={showInactive} onChange={e => setShowInactive(e.target.checked)} />
          Show inactive
        </label>
      </div>

      {/* Table */}
      <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
        <table className="w-full text-sm">
          <thead>
            <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
              {['Order', 'Profession', 'Mode', 'Min Price', 'Status', 'Actions'].map(h => (
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
              <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>No professions found</td></tr>
            ) : filtered.map((cat, idx) => {
              const mc = MODE_COLORS[cat.mode] || MODE_COLORS.both
              return (
                <tr key={cat.id}
                  style={{
                    borderBottom: idx < filtered.length - 1 ? '1px solid var(--border)' : 'none',
                    background: cat.is_active ? 'transparent' : 'rgba(255,255,255,0.02)',
                    opacity: cat.is_active ? 1 : 0.5,
                  }}>
                  {/* Order */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <span className="font-mono text-xs w-6 text-center"
                        style={{ color: 'var(--text-muted)' }}>{cat.sort_order}</span>
                      <div className="flex flex-col">
                        <button onClick={() => reorder(cat, -1)}
                          className="hover:text-white transition-colors p-0.5"
                          style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                          <ChevronUp className="h-3 w-3" />
                        </button>
                        <button onClick={() => reorder(cat, 1)}
                          className="hover:text-white transition-colors p-0.5"
                          style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}>
                          <ChevronDown className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  </td>

                  {/* Name + icon */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-3">
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center flex-shrink-0 overflow-hidden"
                        style={{ background: (cat.color_hex || '#6B7280') + '22', flexShrink: 0 }}>
                        {cat.icon_url ? (
                          <img src={cat.icon_url} alt="" style={{ width: 24, height: 24, objectFit: 'contain' }} />
                        ) : (
                          <span style={{ color: cat.color_hex || '#6B7280', fontSize: 14 }}>
                            {cat.icon_emoji || '⚙'}
                          </span>
                        )}
                      </div>
                      <div>
                        <div className="font-medium" style={{ color: 'var(--text-primary)' }}>
                          {cat.name}
                          {cat.is_featured && (
                            <span className="ml-2 text-xs px-1.5 py-0.5 rounded"
                              style={{ background: 'rgba(245,158,11,0.1)', color: 'var(--amber)' }}>
                              Featured
                            </span>
                          )}
                        </div>
                        <div className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>{cat.slug}</div>
                      </div>
                    </div>
                  </td>

                  {/* Mode badge */}
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 rounded-full text-xs font-medium"
                      style={{ background: mc.bg, color: mc.text }}>
                      {mc.label}
                    </span>
                  </td>

                  {/* Min price */}
                  <td className="px-4 py-3 font-mono text-sm" style={{ color: 'var(--text-secondary)' }}>
                    ₹{cat.min_price}
                  </td>

                  {/* Status */}
                  <td className="px-4 py-3">
                    <span className="px-2 py-1 rounded-full text-xs font-medium"
                      style={{
                        background: cat.is_active ? 'rgba(34,197,94,0.12)' : 'rgba(107,114,128,0.12)',
                        color: cat.is_active ? '#4ade80' : '#6b7280',
                      }}>
                      {cat.is_active ? 'Active' : 'Inactive'}
                    </span>
                  </td>

                  {/* Actions */}
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1 flex-wrap">
                      <IconUploadButton
                        categoryId={cat.id}
                        currentUrl={cat.icon_url}
                        onUploaded={() => qc.invalidateQueries({ queryKey: ['admin-categories'] })}
                      />
                      <button onClick={() => setEditing(cat)} title="Edit"
                        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                        style={{ color: 'var(--text-secondary)', background: 'none', border: 'none', cursor: 'pointer' }}>
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                      <button onClick={() => toggleActive(cat)}
                        title={cat.is_active ? 'Deactivate' : 'Activate'}
                        className="p-1.5 rounded-lg hover:bg-white/10 transition-colors"
                        style={{ color: cat.is_active ? '#f87171' : '#4ade80', background: 'none', border: 'none', cursor: 'pointer' }}>
                        {cat.is_active ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />}
                      </button>
                      <button onClick={() => setDeleting(cat)} title="Delete"
                        className="p-1.5 rounded-lg hover:bg-red-500/10 transition-colors"
                        style={{ color: '#f87171', background: 'none', border: 'none', cursor: 'pointer' }}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>

      {/* Create dialog */}
      <Dialog open={creating} onOpenChange={setCreating}>
        <DialogContent style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', maxWidth: 520 }}>
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--text-primary)' }}>Add Profession</DialogTitle>
          </DialogHeader>
          <CategoryForm
            onSubmit={(form) => createMut.mutate(form)}
            onCancel={() => setCreating(false)}
            loading={createMut.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Edit dialog */}
      <Dialog open={!!editing} onOpenChange={v => !v && setEditing(null)}>
        <DialogContent style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)', maxWidth: 520 }}>
          <DialogHeader>
            <DialogTitle style={{ color: 'var(--text-primary)' }}>Edit Profession</DialogTitle>
          </DialogHeader>
          {editing && (
            <CategoryForm
              initial={editing}
              onSubmit={(form) => updateMut.mutate({ id: editing.id, body: form })}
              onCancel={() => setEditing(null)}
              loading={updateMut.isPending}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* Delete confirm */}
      <AlertDialog open={!!deleting} onOpenChange={v => !v && setDeleting(null)}>
        <AlertDialogContent style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border)' }}>
          <AlertDialogHeader>
            <AlertDialogTitle style={{ color: 'var(--text-primary)' }}>
              Delete "{deleting?.name}"?
            </AlertDialogTitle>
            <AlertDialogDescription style={{ color: 'var(--text-muted)' }}>
              If workers are already using this profession it will be deactivated instead of deleted.
              New workers won't be able to register under it.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel style={{ background: 'var(--bg-surface)', color: 'var(--text-primary)', border: '1px solid var(--border)' }}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMut.mutate(deleting.id)}
              style={{ background: '#ef4444', color: '#fff' }}>
              {deleteMut.isPending ? 'Deleting…' : 'Delete'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  )
}
