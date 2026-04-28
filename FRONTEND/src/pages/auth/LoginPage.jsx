import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, ArrowRight, RefreshCw, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { toast } from 'sonner'

const OTP_LENGTH = 6

export default function LoginPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()

  const [step, setStep] = useState('email') // 'email' | 'otp'
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)

  const sendOtp = async (e) => {
    e.preventDefault()
    if (!email.trim()) return
    setLoading(true)
    try {
      await api.post('/auth/send-otp', { email: email.trim().toLowerCase() })
      setStep('otp')
      toast.success('OTP sent to your email')
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Failed to send OTP')
    } finally {
      setLoading(false)
    }
  }

  const verifyOtp = async (e) => {
    e.preventDefault()
    if (otp.length !== OTP_LENGTH) return
    setLoading(true)
    try {
      const { data } = await api.post('/auth/verify-otp', {
        email: email.trim().toLowerCase(),
        token: otp,
      })
      setAuth(data.access_token, data.user)
      navigate(data.user.role === 'worker' ? '/worker' : '/', { replace: true })
    } catch (err) {
      toast.error(err?.response?.data?.detail || 'Invalid OTP')
      setOtp('')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-[--bg-base] flex flex-col items-center justify-center px-6 relative overflow-hidden">
      {/* Ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 w-72 h-72 rounded-full bg-brand/10 blur-[80px]" />
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="w-full max-w-sm"
      >
        {/* Logo */}
        <div className="text-center mb-10">
          <h1 className="font-syne font-bold text-4xl text-[--text-primary] tracking-tight">kaargar</h1>
          <p className="text-[--text-muted] text-sm mt-2">Hyperlocal services, Pune</p>
        </div>

        <AnimatePresence mode="wait">
          {step === 'email' ? (
            <motion.form
              key="email"
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: 20 }}
              onSubmit={sendOtp}
              className="space-y-4"
            >
              <div className="glass rounded-2xl p-6 space-y-4">
                <div>
                  <label className="text-xs font-medium text-[--text-muted] uppercase tracking-wider block mb-2">
                    Email address
                  </label>
                  <div className="relative">
                    <Mail size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-[--text-muted]" />
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      required
                      autoFocus
                      className="w-full bg-white/5 border border-white/10 rounded-xl pl-10 pr-4 py-3 text-[--text-primary] placeholder:text-[--text-muted] focus:outline-none focus:border-brand/50 focus:bg-white/8 transition-all text-sm"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading || !email.trim()}
                  className="btn-brand w-full py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      Continue <ArrowRight size={16} />
                    </>
                  )}
                </button>
              </div>

              <p className="text-center text-xs text-[--text-muted]">
                We'll send a one-time code to your inbox
              </p>
            </motion.form>
          ) : (
            <motion.form
              key="otp"
              initial={{ opacity: 0, x: 20 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -20 }}
              onSubmit={verifyOtp}
              className="space-y-4"
            >
              <div className="glass rounded-2xl p-6 space-y-4">
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <label className="text-xs font-medium text-[--text-muted] uppercase tracking-wider">
                      Enter OTP
                    </label>
                    <span className="text-xs text-[--text-secondary]">{email}</span>
                  </div>
                  <input
                    type="text"
                    inputMode="numeric"
                    pattern="[0-9]*"
                    maxLength={OTP_LENGTH}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, OTP_LENGTH))}
                    placeholder="000000"
                    autoFocus
                    className="w-full bg-white/5 border border-white/10 rounded-xl px-4 py-4 text-[--text-primary] placeholder:text-[--text-muted] focus:outline-none focus:border-brand/50 transition-all text-2xl font-mono tracking-[0.5em] text-center"
                  />
                </div>

                <button
                  type="submit"
                  disabled={loading || otp.length !== OTP_LENGTH}
                  className="btn-brand w-full py-3 rounded-xl font-medium text-sm flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {loading ? (
                    <Loader2 size={16} className="animate-spin" />
                  ) : (
                    <>
                      Verify & Sign in <ArrowRight size={16} />
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={() => { setStep('email'); setOtp('') }}
                  className="w-full flex items-center justify-center gap-1.5 text-xs text-[--text-muted] hover:text-[--text-secondary] transition-colors py-1"
                >
                  <RefreshCw size={12} /> Change email or resend
                </button>
              </div>
            </motion.form>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  )
}
