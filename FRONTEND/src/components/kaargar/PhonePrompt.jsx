/**
 * PhonePrompt — modal that appears once after first login if phone is missing.
 * Dismissed by adding a phone number or clicking "Skip for now".
 * Shown by AppLayout / WorkerLayout when user.phone is empty.
 */
import { useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { Phone, X, Check, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { toast } from 'sonner'

export function PhonePrompt({ onClose }) {
  const { updateUser } = useAuthStore()
  const [phone, setPhone] = useState('')
  const [saving, setSaving] = useState(false)

  async function handleSave(e) {
    e.preventDefault()
    const digits = phone.replace(/\D/g, '')
    if (digits.length < 10) {
      toast.error('Enter a valid 10-digit mobile number')
      return
    }
    const formatted = `+91${digits.slice(-10)}`
    setSaving(true)
    try {
      await api.patch('/users/me', { phone: formatted })
      updateUser({ phone: formatted })
      toast.success('Phone number saved')
      onClose()
    } catch {
      toast.error('Could not save phone number')
    } finally {
      setSaving(false)
    }
  }

  return (
    <AnimatePresence>
      <div
        className="fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4"
        style={{ background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(4px)' }}
        onClick={e => e.target === e.currentTarget && onClose()}
      >
        <motion.div
          initial={{ opacity: 0, y: 40, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 20, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 340, damping: 28 }}
          className="w-full max-w-sm rounded-3xl p-6 space-y-5"
          style={{
            background: 'var(--bg-elevated, #141B26)',
            border: '1px solid rgba(255,255,255,0.10)',
            boxShadow: '0 24px 64px rgba(0,0,0,0.5)',
          }}
        >
          {/* Header */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div
                className="w-11 h-11 rounded-2xl flex items-center justify-center shrink-0"
                style={{ background: 'rgba(255,255,255,0.07)' }}
              >
                <Phone size={20} style={{ color: 'var(--text-secondary)' }} />
              </div>
              <div>
                <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>
                  Add your phone number
                </p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                  Workers can reach you about your bookings
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-1.5 rounded-xl hover:bg-white/5 transition-colors shrink-0"
              style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              <X size={16} />
            </button>
          </div>

          {/* Form */}
          <form onSubmit={handleSave} className="space-y-3">
            <div
              className="flex items-center rounded-2xl overflow-hidden"
              style={{ border: '1.5px solid rgba(255,255,255,0.12)', background: 'rgba(255,255,255,0.05)' }}
            >
              <span
                className="px-4 py-3 text-sm font-medium shrink-0 border-r"
                style={{ color: 'var(--text-secondary)', borderColor: 'rgba(255,255,255,0.10)' }}
              >
                +91
              </span>
              <input
                type="tel"
                inputMode="numeric"
                maxLength={10}
                value={phone}
                onChange={e => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                placeholder="98765 43210"
                autoFocus
                className="flex-1 px-4 py-3 text-sm outline-none bg-transparent"
                style={{ color: 'var(--text-primary)' }}
              />
            </div>

            <button
              type="submit"
              disabled={saving || phone.replace(/\D/g, '').length < 10}
              className="w-full py-3 rounded-2xl text-sm font-semibold flex items-center justify-center gap-2 transition-all"
              style={{
                background: phone.replace(/\D/g, '').length === 10 ? 'var(--text-primary)' : 'rgba(255,255,255,0.07)',
                color: phone.replace(/\D/g, '').length === 10 ? '#000' : 'var(--text-muted)',
                cursor: saving ? 'default' : 'pointer',
                border: 'none',
              }}
            >
              {saving ? <Loader2 size={15} className="animate-spin" /> : <Check size={15} />}
              {saving ? 'Saving…' : 'Save number'}
            </button>
          </form>

          <button
            onClick={onClose}
            className="w-full text-center text-xs"
            style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
          >
            Skip for now
          </button>
        </motion.div>
      </div>
    </AnimatePresence>
  )
}
