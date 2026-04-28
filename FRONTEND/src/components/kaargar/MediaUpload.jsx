import { useState, useRef } from 'react'
import { api } from '@/lib/api'
import { Upload, Loader2, X, Play } from 'lucide-react'
import { toast } from 'sonner'

export function ProfilePhotoUpload({ currentUrl, onSuccess, children }) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef()

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    setUploading(true)
    try {
      const { data } = await api.post('/upload/profile-photo', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      onSuccess?.(data.url)
      toast.success('Photo updated!')
    } catch {
      toast.error('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="relative cursor-pointer" onClick={() => inputRef.current?.click()}>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={handleFile} />
      {children}
      {uploading && (
        <div className="absolute inset-0 flex items-center justify-center bg-black/60 rounded-full">
          <Loader2 className="h-6 w-6 animate-spin text-white" />
        </div>
      )}
    </div>
  )
}

export function WorkerPostUpload({ onSuccess, serviceId }) {
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef()

  const handleFile = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    const formData = new FormData()
    formData.append('file', file)
    if (serviceId) formData.append('service_id', serviceId)
    setUploading(true)
    try {
      const { data } = await api.post('/upload/worker-post', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      })
      onSuccess?.(data)
      toast.success('Uploaded!')
    } catch {
      toast.error('Upload failed')
    } finally {
      setUploading(false)
    }
  }

  return (
    <div>
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp,video/mp4,video/quicktime,video/webm"
        className="hidden"
        onChange={handleFile}
      />
      <button
        onClick={() => inputRef.current?.click()}
        className="glass-light rounded-2xl flex flex-col items-center justify-center gap-2.5 p-8 w-full border-dashed border border-white/10 hover:border-brand/30 transition-all active:scale-95"
      >
        {uploading ? (
          <Loader2 className="h-8 w-8 animate-spin text-brand" />
        ) : (
          <Upload className="h-8 w-8 text-[--text-muted]" />
        )}
        <span className="text-sm text-[--text-muted]">
          {uploading ? 'Uploading…' : 'Tap to add photo or video'}
        </span>
      </button>
    </div>
  )
}

export function MediaGrid({ items, onDelete }) {
  return (
    <div className="grid grid-cols-3 gap-2">
      {items?.map((item) => (
        <div key={item.id} className="relative aspect-square rounded-xl overflow-hidden group">
          {item.type === 'video' ? (
            <div className="w-full h-full bg-bg-elevated flex items-center justify-center">
              <Play size={24} className="text-white/60" />
            </div>
          ) : (
            <img src={item.url} alt={item.caption || ''} className="w-full h-full object-cover" />
          )}
          {onDelete && (
            <button
              onClick={() => onDelete(item.id)}
              className="absolute top-1.5 right-1.5 w-6 h-6 rounded-full bg-black/70 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X size={12} className="text-white" />
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
