import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { supabase } from '@/lib/supabase'
import { motion } from 'framer-motion'
import { LogOut, ChevronRight, Briefcase, Shield, Bell, User, Pencil, Check, HelpCircle, HardHat, Phone, X } from 'lucide-react'
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
          style={{ color: danger ? '#e99f2f' : 'var(--text-secondary)' }}
        />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium" style={{ color: danger ? '#e99f2f' : 'var(--text-primary)' }}>{label}</p>
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
  const [editingPhone, setEditingPhone] = useState(false)
  const [phone, setPhone] = useState((user?.phone || '').replace(/^\+91/, ''))
  const [savingPhone, setSavingPhone] = useState(false)

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

  async function handleSavePhone() {
    const digits = phone.replace(/\D/g, '')
    if (digits.length !== 10) { toast.error('Enter a valid 10-digit number'); return }
    setSavingPhone(true)
    try {
      await api.patch('/users/me', { phone: `+91${digits}` })
      updateUser({ phone: `+91${digits}` })
      setEditingPhone(false)
      toast.success('Phone updated')
    } catch {
      toast.error('Failed to update phone')
    } finally {
      setSavingPhone(false)
    }
  }

  async function handleLogout() {
    await supabase.auth.signOut()
    logout()
    navigate('/login', { replace: true })
  }

  const initials = getInitials(user?.full_name || '') || user?.email?.[0]?.toUpperCase() || 'K'

  return (
    <div className="px-4 pt-6 pb-8 space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-mono gradient-text-hero">Profile</h1>
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

        {/* Phone number row */}
        <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--g-border)' }}>
          {editingPhone ? (
            <div className="flex items-center gap-2">
              <div
                className="flex items-center flex-1 rounded-xl overflow-hidden"
                style={{ border: '1.5px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.05)' }}
              >
                <span className="px-3 py-2.5 text-xs font-medium border-r shrink-0"
                  style={{ color: 'var(--text-muted)', borderColor: 'rgba(255,255,255,0.10)' }}>+91</span>
                <input
                  type="tel"
                  inputMode="numeric"
                  maxLength={10}
                  value={phone}
                  onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                  className="flex-1 px-3 py-2.5 text-sm bg-transparent outline-none"
                  style={{ color: 'var(--text-primary)' }}
                  autoFocus
                />
              </div>
              <button onClick={handleSavePhone} disabled={savingPhone}
                className="p-2 rounded-xl transition-colors"
                style={{ background: 'rgba(255,255,255,0.1)', color: 'var(--text-primary)', border: 'none', cursor: 'pointer' }}>
                {savingPhone ? <Phone size={14} className="animate-pulse" /> : <Check size={14} />}
              </button>
              <button onClick={() => { setEditingPhone(false); setPhone((user?.phone || '').replace(/^\+91/, '')) }}
                className="p-2 rounded-xl transition-colors"
                style={{ background: 'rgba(239,68,68,0.1)', color: '#f87171', border: 'none', cursor: 'pointer' }}>
                <X size={14} />
              </button>
            </div>
          ) : (
            <button onClick={() => setEditingPhone(true)}
              className="w-full flex items-center gap-3 text-left group"
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <Phone size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
              <div className="flex-1 min-w-0">
                {user?.phone ? (
                  <p className="text-sm" style={{ color: 'var(--text-secondary)' }}>{user.phone}</p>
                ) : (
                  <p className="text-sm" style={{ color: 'var(--text-muted)' }}>Add phone number</p>
                )}
              </div>
              <Pencil size={12} style={{ color: 'var(--text-muted)', opacity: 0.6 }} />
            </button>
          )}
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
                background: 'rgba(255,255,255,0.05)',
                border: '1px solid rgba(255,255,255,0.10)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                transition: 'all 0.15s ease',
              }}
              onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.08)'}
              onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.05)'}
            >
              <div style={{
                width: '36px', height: '36px', borderRadius: '10px',
                background: 'rgba(255,255,255,0.08)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <HardHat size={18} style={{ color: 'var(--text-secondary)' }} />
              </div>
              <div style={{ flex: 1 }}>
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
                  Become a Worker
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Earn by offering your skills on Kaargar
                </p>
              </div>
              <ChevronRight size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
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
        <button
          onClick={async () => { await supabase.auth.signOut(); logout(); navigate('/login') }}
          className="w-full flex items-center gap-3 px-5 py-4 text-left"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#f87171' }}
        >
          <LogOut className="h-4 w-4 flex-shrink-0" />
          <span className="text-sm font-medium">Sign Out</span>
        </button>
      </GlassCard>
    </div>
  )
}
