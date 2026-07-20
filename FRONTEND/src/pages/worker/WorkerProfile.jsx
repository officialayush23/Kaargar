import { useState, useEffect } from 'react'
import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { Loader2, Save, User, MapPin, FileText, Image, ChevronRight } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { ProfilePhotoUpload } from '@/components/kaargar/MediaUpload'
import { PUNE_AREAS, getInitials } from '@/lib/utils'
import { GlassSelect } from '@/components/glass/GlassSelect'
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
    years_experience: '',
    instant_available: true,
    allow_multi_day_booking: false,
  })

  useEffect(() => {
    if (user || profile) {
      setForm({
        full_name: user?.full_name || '',
        bio: profile?.bio || '',
        area: profile?.pune_area || '',
        // API returns this field as `experience_years` (not `years_experience` —
        // that name only exists as the write-side alias on the PATCH payload).
        years_experience: profile?.experience_years ?? '',
        instant_available: profile?.is_instant_available ?? true,
        allow_multi_day_booking: profile?.allow_multi_day_booking ?? false,
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
      years_experience: form.years_experience ? Number(form.years_experience) : undefined,
      instant_available: form.instant_available,
      allow_multi_day_booking: form.allow_multi_day_booking,
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
            <Avatar className="w-24 h-24 border-2 border-[--g-border]">
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
            className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-[--text-primary] placeholder:text-[--text-muted] focus:outline-none focus:border-brand/50 transition-all"
          />
        </Field>

        <Field label="Bio" icon={FileText}>
          <textarea
            value={form.bio}
            onChange={set('bio')}
            placeholder="Tell customers about yourself and your experience…"
            rows={3}
            className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-[--text-primary] placeholder:text-[--text-muted] focus:outline-none resize-none"
          />
        </Field>

        <Field label="Service area" icon={MapPin}>
          <GlassSelect
            value={form.area}
            onChange={(v) => setForm((f) => ({ ...f, area: v }))}
            placeholder="Select area"
            options={PUNE_AREAS}
          />
        </Field>

        <Field label="Years of experience">
          <input
            type="number"
            value={form.years_experience}
            onChange={set('years_experience')}
            placeholder="e.g. 5"
            min={0}
            max={50}
            className="w-full glass-input rounded-xl px-4 py-2.5 text-sm text-[--text-primary] placeholder:text-[--text-muted] focus:outline-none"
          />
        </Field>

        <div className="flex items-center justify-between py-1">
          <div>
            <p className="text-sm font-medium text-[--text-primary]">Available for instant jobs</p>
            <p className="text-xs text-[--text-muted] mt-0.5">Accept same-day service requests</p>
          </div>
          <button
            onClick={() => setForm((f) => ({ ...f, instant_available: !f.instant_available }))}
            className={`w-12 h-6 rounded-full transition-colors relative ${form.instant_available ? 'bg-instant' : 'bg-[--card-bg]'}`}
          >
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${form.instant_available ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
        </div>

        <div className="flex items-center justify-between py-1" style={{ borderTop: '1px solid var(--g-border)', paddingTop: 16 }}>
          <div>
            <p className="text-sm font-medium text-[--text-primary]">Allow multi-day booking</p>
            <p className="text-xs text-[--text-muted] mt-0.5">Let Discovery customers book you across several days at once</p>
          </div>
          <button
            onClick={() => setForm((f) => ({ ...f, allow_multi_day_booking: !f.allow_multi_day_booking }))}
            className={`w-12 h-6 rounded-full transition-colors relative ${form.allow_multi_day_booking ? 'bg-instant' : 'bg-[--card-bg]'}`}
          >
            <div className={`absolute top-1 w-4 h-4 rounded-full bg-white transition-transform ${form.allow_multi_day_booking ? 'translate-x-7' : 'translate-x-1'}`} />
          </button>
        </div>
      </motion.div>

      {/* Portfolio moved off the bottom nav to make room for Schedule — still
          reachable here so workers can manage their photos/videos. */}
      <Link to="/worker/media">
        <motion.div
          whileHover={{ y: -1 }}
          whileTap={{ scale: 0.98 }}
          className="flex items-center gap-3 rounded-xl p-3.5 cursor-pointer transition-colors"
          style={{ background: 'var(--accent-deep)', border: '1px solid var(--accent-mid)' }}
        >
          <div className="w-9 h-9 rounded-lg flex items-center justify-center shrink-0" style={{ background: 'var(--accent-bg-md)' }}>
            <Image size={16} style={{ color: 'var(--accent)' }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold" style={{ color: 'var(--accent)' }}>Portfolio</p>
            <p className="text-[12px]" style={{ color: 'var(--text-secondary)' }}>Photos & videos of your work</p>
          </div>
          <ChevronRight size={16} style={{ color: 'var(--accent)' }} className="shrink-0" />
        </motion.div>
      </Link>

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
