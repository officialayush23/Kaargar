import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Mail, ArrowRight, RefreshCw, ShieldCheck, ChevronLeft } from 'lucide-react'
import { Background } from '@/components/glass/Background'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassInput } from '@/components/glass/GlassInput'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/lib/api'
import { toast } from 'sonner'

const OTP_LENGTH = 6

export default function LoginPage() {
  const navigate = useNavigate()
  const { setAuth } = useAuthStore()

  const [step, setStep] = useState('email')
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [resendTimer, setResendTimer] = useState(0)

  async function sendOtp() {
    if (!email.trim()) return
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/send-otp', { email: email.trim().toLowerCase() })
      setStep('otp')
      startResendTimer()
      toast.success('OTP sent to your email')
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to send OTP. Try again.')
    } finally {
      setLoading(false)
    }
  }

  async function verifyOtp() {
    if (otp.length !== OTP_LENGTH) return
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/verify-otp', {
        email: email.trim().toLowerCase(),
        token: otp,
      })
      setAuth(data.access_token, data.user)
      toast.success('Welcome to Kaargar!')
      navigate(data.user.role === 'worker' ? '/worker' : '/', { replace: true })
    } catch (e) {
      setError(e.response?.data?.detail || 'Invalid OTP. Please try again.')
      setOtp('')
    } finally {
      setLoading(false)
    }
  }

  function startResendTimer() {
    setResendTimer(60)
    const id = setInterval(() => {
      setResendTimer(t => {
        if (t <= 1) { clearInterval(id); return 0 }
        return t - 1
      })
    }, 1000)
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <Background />

      <div
        className="fixed inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(59,130,246,0.10) 0%, transparent 70%)' }}
      />

      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
      >
        <div className="flex flex-col items-center mb-8">
          <motion.div
            className="w-14 h-14 rounded-2xl bg-gradient-to-br from-azure to-azure-dim flex items-center justify-center mb-4"
            style={{ boxShadow: '0 0 32px rgba(59,130,246,0.4)' }}
            animate={{ boxShadow: ['0 0 32px rgba(59,130,246,0.4)', '0 0 48px rgba(59,130,246,0.6)', '0 0 32px rgba(59,130,246,0.4)'] }}
            transition={{ repeat: Infinity, duration: 3 }}
          >
            <span className="text-white font-bold text-2xl font-syne">K</span>
          </motion.div>
          <h1 className="text-2xl font-bold font-syne gradient-text-hero">Kaargar</h1>
          <p className="text-sm text-white/40 mt-1">Hyperlocal services, Pune</p>
        </div>

        <GlassCard className="p-6">
          <AnimatePresence mode="wait">
            {step === 'email' ? (
              <motion.div
                key="email-step"
                initial={{ opacity: 0, x: -20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: 20 }}
                transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                className="space-y-5"
              >
                <div>
                  <h2 className="text-lg font-semibold font-syne text-white/90">Sign in</h2>
                  <p className="text-sm text-white/40 mt-0.5">Enter your email to continue</p>
                </div>

                <GlassInput
                  type="email"
                  label="Email address"
                  placeholder="you@example.com"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && sendOtp()}
                  icon={Mail}
                  error={error}
                  autoFocus
                />

                <GlassButton
                  variant="brand"
                  size="lg"
                  className="w-full"
                  loading={loading}
                  onClick={sendOtp}
                  icon={ArrowRight}
                  iconPosition="right"
                  disabled={!email.trim()}
                >
                  Send OTP
                </GlassButton>

                <p className="text-center text-xs text-white/25">
                  By continuing you agree to our Terms &amp; Privacy Policy
                </p>
              </motion.div>
            ) : (
              <motion.div
                key="otp-step"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                transition={{ type: 'spring', stiffness: 300, damping: 28 }}
                className="space-y-5"
              >
                <div>
                  <button
                    onClick={() => { setStep('email'); setOtp(''); setError('') }}
                    className="flex items-center gap-1 text-xs text-white/40 hover:text-white/70 transition-colors mb-3"
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Back
                  </button>
                  <h2 className="text-lg font-semibold font-syne text-white/90">Check your email</h2>
                  <p className="text-sm text-white/40 mt-0.5">
                    Sent to <span className="text-white/70">{email}</span>
                  </p>
                </div>

                <OtpBoxes value={otp} onChange={setOtp} length={OTP_LENGTH} onComplete={verifyOtp} />

                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs text-red-400 text-center"
                  >
                    {error}
                  </motion.p>
                )}

                <GlassButton
                  variant="brand"
                  size="lg"
                  className="w-full"
                  loading={loading}
                  onClick={verifyOtp}
                  icon={ShieldCheck}
                  iconPosition="left"
                  disabled={otp.length !== OTP_LENGTH}
                >
                  Verify Code
                </GlassButton>

                <div className="text-center">
                  {resendTimer > 0 ? (
                    <p className="text-xs text-white/30">
                      Resend in <span className="text-white/50 font-mono">{resendTimer}s</span>
                    </p>
                  ) : (
                    <button
                      onClick={() => { sendOtp(); setOtp('') }}
                      className="flex items-center gap-1.5 text-xs text-azure hover:text-azure-light transition-colors mx-auto"
                    >
                      <RefreshCw className="h-3 w-3" />
                      Resend OTP
                    </button>
                  )}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </GlassCard>
      </motion.div>
    </div>
  )
}

function OtpBoxes({ value, onChange, length, onComplete }) {
  const digits = value.split('').concat(Array(length).fill('')).slice(0, length)

  function handleChange(index, char) {
    const clean = char.replace(/\D/g, '').slice(-1)
    const arr = digits.slice()
    arr[index] = clean
    const next = arr.join('')
    onChange(next)
    if (clean && index < length - 1) {
      document.getElementById('otp-' + (index + 1))?.focus()
    }
    if (next.length === length) onComplete?.()
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      document.getElementById('otp-' + (index - 1))?.focus()
    }
  }

  function handlePaste(e) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    onChange(text)
    if (text.length === length) onComplete?.()
    document.getElementById('otp-' + Math.min(text.length, length - 1))?.focus()
    e.preventDefault()
  }

  return (
    <div className="flex gap-2.5 justify-center">
      {digits.map((d, i) => (
        <motion.input
          key={i}
          id={'otp-' + i}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={handlePaste}
          whileFocus={{ scale: 1.05 }}
          className="w-11 text-center text-lg font-bold font-mono glass-input rounded-xl text-white"
          style={{ height: '52px' }}
          autoFocus={i === 0}
        />
      ))}
    </div>
  )
}
