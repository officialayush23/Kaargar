import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Plus, Trash2, Edit3, Loader2, X, Check } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { formatCurrency } from '@/lib/utils'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

function ServiceForm({ initial, onSave, onCancel }) {
  const [title, setTitle] = useState(initial?.title || '')
  const [description, setDescription] = useState(initial?.description || '')
  const [hourlyRate, setHourlyRate] = useState(initial?.hourly_rate || '')
  const [loading, setLoading] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return
    setLoading(true)
    try {
      await onSave({ title: title.trim(), description: description.trim() || undefined, hourly_rate: hourlyRate ? Number(hourlyRate) : undefined })
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="glass rounded-2xl p-4 space-y-3 border border-brand/20">
      <p className="text-sm font-semibold text-[--text-primary]">{initial ? 'Edit service' : 'Add service'}</p>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Service title (e.g. Plumbing repair)"
        required
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-[--text-primary] placeholder:text-[--text-muted] focus:outline-none focus:border-brand/50 transition-all"
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Brief description (optional)"
        rows={2}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-[--text-primary] placeholder:text-[--text-muted] focus:outline-none resize-none"
      />
      <input
        type="number"
        value={hourlyRate}
        onChange={(e) => setHourlyRate(e.target.value)}
        placeholder="Hourly rate ₹ (optional)"
        min={0}
        className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-[--text-primary] placeholder:text-[--text-muted] focus:outline-none"
      />
      <div className="flex gap-2">
        <button
          type="button"
          onClick={onCancel}
          className="flex-1 py-2.5 rounded-xl glass-light text-sm text-[--text-muted] font-medium"
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

export default function WorkerServices() {
  const queryClient = useQueryClient()
  const [showAdd, setShowAdd] = useState(false)
  const [editingId, setEditingId] = useState(null)

  const { data: services = [], isLoading } = useQuery({
    queryKey: ['my-services'],
    queryFn: () => api.get('/workers/me/services').then(r => r.data),
  })

  const addMut = useMutation({
    mutationFn: (data) => api.post('/workers/me/services', data),
    onSuccess: () => {
      queryClient.invalidateQueries(['my-services'])
      setShowAdd(false)
      toast.success('Service added')
    },
    onError: () => toast.error('Failed to add service'),
  })

  const updateMut = useMutation({
    mutationFn: ({ id, data }) => api.patch(`/workers/me/services/${id}`, data),
    onSuccess: () => {
      queryClient.invalidateQueries(['my-services'])
      setEditingId(null)
      toast.success('Updated')
    },
    onError: () => toast.error('Failed to update'),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/workers/me/services/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['my-services'])
      toast.success('Deleted')
    },
    onError: () => toast.error('Failed to delete'),
  })

  return (
    <div className="px-4 pt-5 pb-4 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="font-syne font-bold text-xl text-[--text-primary]">My services</h2>
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
            <ServiceForm onSave={(data) => addMut.mutate(data)} onCancel={() => setShowAdd(false)} />
          </motion.div>
        )}
      </AnimatePresence>

      {isLoading ? (
        [...Array(3)].map((_, i) => <Skeleton key={i} className="h-20 rounded-2xl" />)
      ) : services.length === 0 ? (
        <div className="glass-light rounded-2xl p-8 text-center">
          <p className="text-[--text-muted] text-sm">No services yet. Add your first!</p>
        </div>
      ) : (
        <div className="space-y-2">
          {services.map((svc) => (
            <AnimatePresence key={svc.id}>
              {editingId === svc.id ? (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                  <ServiceForm
                    initial={svc}
                    onSave={(data) => updateMut.mutate({ id: svc.id, data })}
                    onCancel={() => setEditingId(null)}
                  />
                </motion.div>
              ) : (
                <motion.div
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  className="glass-light rounded-xl p-4 flex items-start justify-between"
                >
                  <div className="flex-1">
                    <p className="text-sm font-medium text-[--text-primary]">{svc.title}</p>
                    {svc.description && (
                      <p className="text-xs text-[--text-muted] mt-0.5 line-clamp-2">{svc.description}</p>
                    )}
                    {svc.hourly_rate && (
                      <p className="text-xs text-brand mt-1">{formatCurrency(svc.hourly_rate)}/hr</p>
                    )}
                  </div>
                  <div className="flex gap-1 ml-3">
                    <button
                      onClick={() => setEditingId(svc.id)}
                      className="w-8 h-8 rounded-xl glass-light flex items-center justify-center"
                    >
                      <Edit3 size={13} className="text-[--text-muted]" />
                    </button>
                    <button
                      onClick={() => deleteMut.mutate(svc.id)}
                      disabled={deleteMut.isPending}
                      className="w-8 h-8 rounded-xl glass-light flex items-center justify-center"
                    >
                      {deleteMut.isPending ? <Loader2 size={13} className="animate-spin text-red-400" /> : <Trash2 size={13} className="text-red-400" />}
                    </button>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          ))}
        </div>
      )}
    </div>
  )
}
