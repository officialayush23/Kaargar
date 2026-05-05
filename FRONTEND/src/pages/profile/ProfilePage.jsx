import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { LogOut, ChevronRight, Briefcase, Shield, Bell, User, Pencil, Check, HelpCircle, HardHat, MapPin } from 'lucide-react'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/lib/api'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { ProfilePhotoUpload } from '@/components/kaargar/MediaUpload'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassInput } from '@/components/glass/GlassInput'
import { getInitials } from '@/lib/utils'
import { toast } from 'sonner'
import { AddressBook } from '@/components/kaargar/AddressBook'
import { cn } from '@/lib/utils'

function MenuItem({ icon: Icon, label, sub, onClick, danger, color }) {
  return (
    <motion.button
      onClick={onClick}
      whileHover={{ x: 2 }}
      className="w-full flex items-center gap-3 px-4 py-3.5 transition-colors text-left"
    >
      <div
        className="w-9 h-9 rounded-xl flex items-center justify-center shrink-0"
        style={{ background: danger ? 'rgba(239,68,68,0.12)' : 'var(--g-bg)' }}
      >
        <Icon
          className="h-4 w-4"
          style={{ color: danger ? '#f87171' : 'var(--text-secondary)' }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: danger ? '#f87171' : 'var(--text-primary)' }}>{label}</p>
        {sub && <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{sub}</p>}
      </div>
      {!danger && <ChevronRight className="h-4 w-4" style={{ color: 'var(--text-muted)' }} />}
    </motion.button>
  )
}

export default function ProfilePage() {
  const navigate = useNavigate()
  const { user, updateUser, logout, isWorker } = useAuthStore()
  const [editingName, setEditingName] = useState(false)
  const [name, setName] = useState(user?.full_name || '')
  const [savingName, setSavingName] = useState(false)

  async function handleSaveName() {
    if (!name.trim()) return
    setSavingName(true)
    try {
      if (typeof isWorker === 'function' && isWorker()) {
        await api.patch('/workers/profile', { full_name: name.trim() })
      } else {
        await api.patch('/users/me', { full_name: name.trim() })
      }
      updateUser({ full_name: name.trim() })
      setEditingName(false)
      toast.success('Name updated')
    } catch {
      toast.error('Failed to update name')
    } finally {
      setSavingName(false)
    }
  }

  function handleLogout() {
    logout()
    navigate('/login', { replace: true })
  }

  const initials = getInitials(user?.full_name || '') || user?.email?.[0]?.toUpperCase() || 'K'

  return (
    <div className="px-4 pt-6 pb-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-syne gradient-text-hero">Profile</h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>Manage your account</p>
      </div>

      {/* Avatar + name */}
      <GlassCard className="p-6">
        <div className="flex items-center gap-4">
          <ProfilePhotoUpload currentUrl={user?.avatar_url} onSuccess={url => updateUser({ avatar_url: url })}>
            <div className="relative cursor-pointer">
              <Avatar className="w-16 h-16 border-2" style={{ borderColor: 'var(--g-border)' }}>
                <AvatarImage src={user?.avatar_url} />
                <AvatarFallback className="text-lg font-bold">{initials}</AvatarFallback>
              </Avatar>
              <div className="absolute -bottom-1 -right-1 w-6 h-6 rounded-full bg-azure border-2 border-void flex items-center justify-center">
                <Pencil className="h-2.5 w-2.5 text-white" />
              </div>
            </div>
          </ProfilePhotoUpload>

          <div className="flex-1 min-w-0">
            {editingName ? (
              <div className="flex items-center gap-2">
                <GlassInput
                  value={name}
                  onChange={e => setName(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && handleSaveName()}
                  className="text-sm py-1.5"
                  autoFocus
                />
                <button
                  onClick={handleSaveName}
                  disabled={savingName}
                  className="p-1.5 rounded-lg bg-azure/20 text-azure hover:bg-azure/30 transition-colors"
                >
                  <Check className="h-3.5 w-3.5" />
                </button>
              </div>
            ) : (
              <button onClick={() => setEditingName(true)} className="text-left w-full group">
                <div className="flex items-center gap-2">
                  <p className="text-base font-semibold font-syne" style={{ color: 'var(--text-primary)' }}>
                    {user?.full_name || 'Add your name'}
                  </p>
                  <Pencil className="h-3 w-3 transition-colors" style={{ color: 'var(--text-muted)' }} />
                </div>
                <p className="text-sm" style={{ color: 'var(--text-muted)' }}>{user?.email}</p>
              </button>
            )}
          </div>
        </div>

        {typeof isWorker === 'function' && isWorker() && (
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--g-border)' }}>
            <GlassButton
              variant="brand"
              size="sm"
              className="w-full"
              onClick={() => navigate('/worker')}
            >
              Go to Worker Dashboard
            </GlassButton>
          </div>
        )}

        {typeof isWorker === 'function' && !isWorker() && (
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--g-border)' }}>
            <motion.button
              onClick={() => navigate('/onboard/worker')}
              whileHover={{ scale: 1.01 }}
              whileTap={{ scale: 0.98 }}
              className="w-full text-left"
              style={{
                padding: '12px 14px',
                borderRadius: '14px',
                background: 'rgba(245,158,11,0.06)',
                border: '1px solid rgba(245,158,11,0.18)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.10)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(245,158,11,0.06)'}
            >
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px',
                background: 'rgba(245,158,11,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <HardHat size={18} style={{ color: 'var(--amber)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--amber)' }}>
                  Become a Worker
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Earn by offering your skills on Kaargar
                </p>
              </div>
              <ChevronRight size={15} style={{ color: 'var(--amber)', opacity: 0.6, flexShrink: 0 }} />
            </motion.button>
          </div>
        )}
      </GlassCard>

      {/* Account section */}
      <div>
      {/* Saved Addresses */}
      <div>
        <p className="text-xs uppercase tracking-widest font-medium mb-2 px-1" style={{ color: 'var(--text-muted)' }}>Saved Addresses</p>
        <GlassCard style={{ padding: '14px' }}>
          <AddressBook />
        </GlassCard>
      </div>

              <p className="text-xs uppercase tracking-widest font-medium mb-2 px-1" style={{ color: 'var(--text-muted)' }}>Account</p>
        <GlassCard className="overflow-hidden divide-y" style={{ '--tw-divide-opacity': 1, borderColor: 'var(--g-border)' }}>
          <MenuItem icon={Briefcase} label="My Bookings" sub="View all service requests" onClick={() => navigate('/bookings')} />
          <MenuItem icon={Bell} label="Notifications" sub="Manage alerts" onClick={() => {}} />
          <MenuItem icon={Shield} label="Privacy & Safety" onClick={() => {}} />
          <MenuItem icon={HelpCircle} label="Help & Support" onClick={() => navigate('/support')} />
        </GlassCard>
      </div>

      {/* Sign out */}
      <GlassCard className="overflow-hidden">
        <MenuItem icon={LogOut} label="Sign out" danger onClick={handleLogout} />
      </GlassCard>

      <p className="text-center text-xs pb-2" style={{ color: 'var(--text-muted)' }}>Kaargar v1.0 · Pune, Maharashtra</p>
    </div>
  )
}
