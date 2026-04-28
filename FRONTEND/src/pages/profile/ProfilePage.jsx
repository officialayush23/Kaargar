import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LogOut, ChevronRight, Briefcase, Shield, Bell, User, Loader2 } from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/lib/api'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { ProfilePhotoUpload } from '@/components/kaargar/MediaUpload'
import { getInitials } from '@/lib/utils'
import { toast } from 'sonner'

function MenuItem({ icon: Icon, label, sub, onClick, danger }) {
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 px-4 py-4 hover:bg-white/3 transition-colors rounded-xl text-left"
    >
      <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${danger ? 'bg-red-500/10' : 'bg-white/5'}`}>
        <Icon size={17} className={danger ? 'text-red-400' : 'text-[--text-muted]'} />
      </div>
      <div className="flex-1">
        <p className={`text-sm font-medium ${danger ? 'text-red-400' : 'text-[--text-primary]'}`}>{label}</p>
        {sub && <p className="text-xs text-[--text-muted] mt-0.5">{sub}</p>}
      </div>
      {!danger && <ChevronRight size={16} className="text-[--text-muted]" />}
    </button>
  )
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user, updateUser, logout, isWorker } = useAuthStore()
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(user?.full_name || '')
  const [savingName, setSavingName] = useState(false)

  const handlePhotoSuccess = (url) => {
    updateUser({ avatar_url: url })
  }

  const handleSaveName = async () => {
    if (!name.trim()) return
    setSavingName(true)
    try {
      await api.patch('/workers/profile', { full_name: name.trim() })
      updateUser({ full_name: name.trim() })
      setEditingName(false)
      toast.success('Name updated')
    } catch {
      toast.error('Failed to update')
    } finally {
      setSavingName(false)
    }
  }

  const handleLogout = () => {
    logout()
    navigate('/login', { replace: true })
  }

  return (
    <div className="min-h-full pb-28">
      {/* Profile header */}
      <div className="px-4 pt-8 pb-6 flex flex-col items-center gap-4">
        <ProfilePhotoUpload currentUrl={user?.avatar_url} onSuccess={handlePhotoSuccess}>
          <div className="relative">
            <Avatar className="w-24 h-24 border-2 border-white/15">
              <AvatarImage src={user?.avatar_url} />
              <AvatarFallback className="bg-brand/20 text-brand font-bold text-2xl">
                {getInitials(user?.full_name || '')}
              </AvatarFallback>
            </Avatar>
            <div className="absolute bottom-0 right-0 w-7 h-7 rounded-full bg-brand border-2 border-[--bg-base] flex items-center justify-center">
              <User size={12} className="text-white" />
            </div>
          </div>
        </ProfilePhotoUpload>

        {editingName ? (
          <div className="flex items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={handleSaveName}
              autoFocus
              className="bg-white/5 border border-brand/40 rounded-xl px-3 py-1.5 text-center font-syne font-bold text-lg text-[--text-primary] focus:outline-none w-48"
            />
            <button onClick={handleSaveName} disabled={savingName}>
              {savingName ? <Loader2 size={14} className="animate-spin text-brand" /> : <span className="text-xs text-brand">Save</span>}
            </button>
          </div>
        ) : (
          <button onClick={() => setEditingName(true)} className="text-center">
            <h2 className="font-syne font-bold text-xl text-[--text-primary]">{user?.full_name || 'Your name'}</h2>
            <p className="text-xs text-[--text-muted] mt-0.5">Tap to edit name</p>
          </button>
        )}

        <p className="text-sm text-[--text-secondary]">{user?.email}</p>

        {isWorker() && (
          <button
            onClick={() => navigate('/worker')}
            className="btn-brand px-6 py-2.5 rounded-xl text-sm font-medium"
          >
            Worker Dashboard
          </button>
        )}
      </div>

      {/* Menu */}
      <div className="px-4 space-y-1">
        <p className="text-xs font-semibold text-[--text-muted] uppercase tracking-wider px-4 mb-2">Account</p>
        <div className="glass rounded-2xl overflow-hidden divide-y divide-white/5">
          <MenuItem icon={Briefcase} label="My bookings" onClick={() => navigate('/bookings')} />
          <MenuItem icon={Bell} label="Notifications" sub="Manage alerts" onClick={() => {}} />
          <MenuItem icon={Shield} label="Privacy & safety" onClick={() => {}} />
        </div>

        <div className="pt-4">
          <div className="glass rounded-2xl overflow-hidden">
            <MenuItem icon={LogOut} label="Sign out" danger onClick={handleLogout} />
          </div>
        </div>

        <p className="text-center text-xs text-[--text-muted] pt-6">kaargar v1.0 · Pune</p>
      </div>
    </div>
  )
}
