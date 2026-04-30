import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Loader2, Save, User, MapPin, FileText, DollarSign } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { ProfilePhotoUpload } from '@/components/kaargar/MediaUpload'
import { PUNE_AREAS, getInitials } from '@/lib/utils'
import { toast } from 'sonner'

function Field({ label, icon: Icon, children }) {
  return (
    <div className="space-y-1.5">
      <label className="flex items-center gap-1.5 text-xs font-semibold text-[--text-muted] uppercase tracking-wider">
        {Icon && <Icon size={11} />} {label}
      </label>
      {children}
    </div>
  )
}

export default function WorkerProfile() {
  const queryClient = useQueryClient()
  const { user, updateUser } = useAuthStore()

  const { data: profile, isLoading } = useQuery({
    queryKey: ['my-worker-profile'],
    queryFn: () => api.get('/workers/me/profile').then(r => r.data).catch(() => null),
  })

  const [form, setForm] = useState({
    full_name: '',
    bio: '',
    area: '',
    min_rate: '',
    max_rate: '',
    years_experience: '',
    instant_available: true,
  })

  useEffect(() => {
    if (user || profile) {
      setForm({
        full_name: user?.full_name || '',
        bio: profile?.bio || '',
        area: profile?.pune_area || '',
        min_rate: profile?.min_rate || '',
        max_rate: profile?.max_rate || '',
        years_experience: profile?.years_experience || '',
        instant_available: profile?.is_instant_available ?? true,
      })
    }
  }, [user, profile])

  const saveMut = useMutation({
    mutationFn: (data) => api.patch('/workers/profile', data),
    onSuccess: (res) => {
      queryClient.invalidateQueries(['my-worker-profile'])
      updateUser({ full_name: form.full_name })
      toast.success('Profile saved')
    },
    onError: () => toast.error('Failed to save'),
  })

  const handlePhotoSuccess = (url) => {
    updateUser({ avatar_url: url })
    toast.success('Photo updated')
  }

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }))
  const setCheck = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.checked }))

  const handleSave = () => {
    saveMut.mutate({
      full_name: form.full_name.trim() || undefined,
      bio: form.bio.trim() || undefined,
      area: form.area || undefined,
      min_rate: form.min_rate ? Number(form.min_rate) : undefined,
      max_rate: form.max_rate ? Number(form.max_rate) : undefined,
      years_experience: form.years_experience ? Number(form.years_experience) : undefined,
      instant_available: form.instant_available,
    })
  }

  if (isLoading) return (
    <div className="flex items-center justify-center py-20">
      <Loader2 size={24} className="animate-spin text-brand" />
    </div>
  )

  return (
    <div className="px-4 pt-5 pb-24 space-y-5">
      <h2 className="font-syne font-bold text-xl text-[--text-primary]">My profile</h2>

      {/* Avatar */}
      <div className="flex flex-col items-center gap-3">
        <ProfilePhotoUpload currentUrl={user?.avatar_url} onSuccess={handlePhotoSuccess}>
          <div className="relative">
            <Avatar className="w-24 h-24 border-2 border-white/15">
              <AvatarImage src={user?.avatar_url} />
              <AvatarFallback className="bg-brand/20 text-brand font-bold text-xl">
                {getInitials(form.full_name || '')}
              </AvatarFallback>
            </Avatar>
            <div className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-brand border-2 border-[--bg-base] flex items-center justify-center">
              <User size={12} className="text-white" />
            </div>
          </div>
        </ProfilePhotoUpload>
        <p className="text-xs text-[--text-muted]">Tap to change photo</p>
      </div>

      {/* Form */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} className="glass rounded-2xl p-5 space-y-4">
        <Field label="Full name" icon={User}>
          <input
            value={form.full_name}
            onChange={set('full_name')}
            placeholder="Your name"
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-[--text-primary] placeholder:text-[--text-muted] focus:outline-none focus:border-brand/50 transition-all"
          />
        </Field>

        <Field label="Bio" icon={FileText}>
          <textarea
            value={form.bio}
            onChange={set('bio')}
            placeholder="Tell customers about yourself and your experience…"
            rows={3}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-[--text-primary] placeholder:text-[--text-muted] focus:outline-none resize-none"
          />
        </Field>

        <Field label="Service area" icon={MapPin}>
          <select
            value={form.area}
            onChange={set('area')}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-[--text-primary] focus:outline-none appearance-none"
          >
            <option value="">Select area</option>
            {PUNE_AREAS.map((a) => <option key={a} value={a}>{a}</option>)}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Min rate ₹/hr" icon={DollarSign}>
            <input
              type="number"
              value={form.min_rate}
              onChange={set('min_rate')}
              placeholder="200"
              min={0}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-[--text-primary] placeholder:text-[--text-muted] focus:outline-none"
            />
          </Field>
          <Field label="Max rate ₹/hr">
            <input
              type="number"
              value={form.max_rate}
              onChange={set('max_rate')}
              placeholder="800"
              min={0}
              className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-[--text-primary] placeholder:text-[--text-muted] focus:outline-none"
            />
          </Field>
        </div>

        <Field label="Years of experience">
          <input
            type="number"
            value={form.years_experience}
            onChange={set('years_experience')}
            placeholder="e.g. 5"
            min={0}
            max={50}
            className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-[--text-primary] placeholder:text-[--text-muted] focus:outline-none"
          />
        </Field>

        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm font-medium text-[--text-primary]">Available for instant jobs</p>
            <p className="text-xs text-[--text-muted] mt-0.5">Accept same-day service requests</p>
          </div>
          <button
            onClick={() => setForm((f) => ({ ...f, instant_available: !f.instant_available }))}
            className={`w-12 h-6 rounded-full transition-colors relative ${form.instant_available ? 'bg-instant' : 'bg-white/10'}`}
          >
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${form.instant_available ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
        </div>
      </motion.div>

      <button
        onClick={handleSave}
        disabled={saveMut.isPending}
        className="w-full btn-brand py-4 rounded-2xl font-semibold flex items-center justify-center gap-2 disabled:opacity-50"
      >
        {saveMut.isPending ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />}
        Save changes
      </button>
    </div>
  )
}
