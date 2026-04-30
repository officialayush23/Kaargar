import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { toast } from 'sonner'

export default function AdminLogin() {
  const navigate = useNavigate()
  const { setUser, setToken } = useAuthStore()
  const [step, setStep] = useState('email') // 'email' | 'otp'
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)

  async function sendOtp(e) {
    e.preventDefault()
    setLoading(true)
    try {
      await api.post('/auth/send-otp', { email })
      toast.success('OTP sent to your email')
      setStep('otp')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to send OTP')
    } finally {
      setLoading(false)
    }
  }

  async function verifyOtp(e) {
    e.preventDefault()
    setLoading(true)
    try {
      const { data } = await api.post('/auth/verify-otp', { email, token: otp })
      if (data.user?.role !== 'admin') {
        toast.error('Access denied — admin only')
        return
      }
      setToken(data.access_token)
      setUser(data.user)
      navigate('/admin')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Invalid OTP')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div
      className="min-h-screen flex items-center justify-center px-4"
      style={{ background: '#07090F' }}
    >
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="text-center mb-10">
          <h1
            className="text-4xl font-bold mb-1"
            style={{ fontFamily: '"Playwrite NO", cursive', color: '#F1F5F9' }}
          >
            Kaargar
          </h1>
          <p className="text-sm" style={{ color: '#475569' }}>Admin Console</p>
        </div>

        <div
          className="rounded-3xl p-6"
          style={{
            background: 'rgba(13,17,23,0.9)',
            backdropFilter: 'blur(32px)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
          }}
        >
          {step === 'email' ? (
            <form onSubmit={sendOtp} className="space-y-4">
              <div>
                <label className="text-xs font-medium mb-1.5 block" style={{ color: '#94A3B8' }}>
                  Admin Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  placeholder="admin@kaargar.in"
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none transition-all"
                  style={{
                    background: 'rgba(255,255,255,0.06)',
                    border: '1px solid rgba(255,255,255,0.1)',
                    color: '#F1F5F9',
                  }}
                  onFocus={(e) => e.target.style.borderColor = 'rgba(245,158,11,0.5)'}
                  onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
                />
              </div>
              <button
                type="submit"
                disabled={loading || !email}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                style={{ background: '#f59e0b', color: '#000' }}
              >
                {loading ? 'Sending…' : 'Send OTP'}
              </button>
            </form>
          ) : (
            <form onSubmit={verifyOtp} className="space-y-4">
              <p className="text-sm text-center mb-2" style={{ color: '#94A3B8' }}>
                Enter the 6-digit code sent to<br />
                <span style={{ color: '#F1F5F9' }}>{email}</span>
              </p>
              <input
                type="text"
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                required
                placeholder="000000"
                className="w-full rounded-xl px-4 py-3 text-center text-2xl font-mono tracking-[0.4em] outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#F1F5F9',
                }}
                onFocus={(e) => e.target.style.borderColor = 'rgba(245,158,11,0.5)'}
                onBlur={(e) => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
              <button
                type="submit"
                disabled={loading || otp.length < 6}
                className="w-full py-3 rounded-xl text-sm font-semibold transition-all disabled:opacity-50"
                style={{ background: '#f59e0b', color: '#000' }}
              >
                {loading ? 'Verifying…' : 'Sign In'}
              </button>
              <button
                type="button"
                onClick={() => setStep('email')}
                className="w-full text-xs text-center"
                style={{ color: '#475569' }}
              >
                ← Back
              </button>
            </form>
          )}
        </div>
      </motion.div>
    </div>
  )
}
