import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { X, Play, Loader2, ZoomIn } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { WorkerPostUpload } from '@/components/kaargar/MediaUpload'
import { Skeleton } from '@/components/ui/skeleton'
import { toast } from 'sonner'

function MediaViewer({ item, onClose }) {
  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-50 bg-black/90 flex items-center justify-center"
      onClick={onClose}
    >
      <button className="absolute top-4 right-4 w-10 h-10 rounded-full glass flex items-center justify-center">
        <X size={18} className="text-white" />
      </button>
      <div className="max-w-lg w-full px-4" onClick={(e) => e.stopPropagation()}>
        {item.type === 'video' ? (
          <video src={item.url} controls autoPlay className="w-full rounded-2xl" />
        ) : (
          <img src={item.url} alt={item.caption || ''} className="w-full rounded-2xl" />
        )}
        {item.caption && (
          <p className="text-sm text-[--text-secondary] text-center mt-3">{item.caption}</p>
        )}
      </div>
    </motion.div>
  )
}

export default function WorkerMedia() {
  const queryClient = useQueryClient()
  const [viewing, setViewing] = useState(null)

  const { data: media = [], isLoading } = useQuery({
    queryKey: ['my-media'],
    queryFn: () => api.get('/workers/me/services').then(async (r) => {
      const { data: mediaItems } = await api.get('/workers/me/media').catch(() => ({ data: [] }))
      return mediaItems
    }),
  })

  const { data: myMedia = [], isLoading: mediaLoading } = useQuery({
    queryKey: ['my-portfolio'],
    queryFn: () => api.get('/workers/me/media').then(r => r.data).catch(() => []),
  })

  const deleteMut = useMutation({
    mutationFn: (id) => api.delete(`/upload/worker-post/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries(['my-portfolio'])
      toast.success('Deleted')
    },
    onError: () => toast.error('Failed to delete'),
  })

  const handleUploadSuccess = () => {
    queryClient.invalidateQueries(['my-portfolio'])
    toast.success('Added to portfolio!')
  }

  const items = myMedia.map(m => ({
    id: m.id,
    url: m.cloudinary_url || m.url,
    type: m.type,
    caption: m.caption,
  }))

  return (
    <div className="px-4 pt-5 pb-4 space-y-5">
      <div className="flex items-center justify-between">
        <h2 className="font-syne font-bold text-xl text-[--text-primary]">Portfolio</h2>
        <span className="text-xs text-[--text-muted]">{items.length} items</span>
      </div>

      <WorkerPostUpload onSuccess={handleUploadSuccess} />

      {mediaLoading ? (
        <div className="grid grid-cols-3 gap-2">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="aspect-square rounded-xl" />)}
        </div>
      ) : items.length === 0 ? (
        <div className="glass-light rounded-2xl p-8 text-center">
          <p className="text-[--text-muted] text-sm">No portfolio items yet</p>
          <p className="text-xs text-[--text-muted] mt-1">Upload photos or videos of your work</p>
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-2">
          {items.map((item, i) => (
            <motion.div
              key={item.id}
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ delay: i * 0.03 }}
              className="relative aspect-square rounded-xl overflow-hidden group"
            >
              {item.type === 'video' ? (
                <div className="w-full h-full bg-[--bg-elevated] flex items-center justify-center">
                  <Play size={24} className="text-white/60" />
                </div>
              ) : (
                <img src={item.url} alt={item.caption || ''} className="w-full h-full object-cover" />
              )}

              {/* Overlay */}
              <div className="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition-all flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                <button
                  onClick={() => setViewing(item)}
                  className="w-8 h-8 rounded-full bg-white/20 backdrop-blur-sm flex items-center justify-center"
                >
                  <ZoomIn size={14} className="text-white" />
                </button>
                <button
                  onClick={() => deleteMut.mutate(item.id)}
                  disabled={deleteMut.isPending}
                  className="w-8 h-8 rounded-full bg-red-500/70 backdrop-blur-sm flex items-center justify-center"
                >
                  {deleteMut.isPending ? <Loader2 size={12} className="animate-spin text-white" /> : <X size={14} className="text-white" />}
                </button>
              </div>
            </motion.div>
          ))}
        </div>
      )}

      <AnimatePresence>
        {viewing && <MediaViewer item={viewing} onClose={() => setViewing(null)} />}
      </AnimatePresence>
    </div>
  )
}
