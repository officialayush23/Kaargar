import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mail, ArrowRight, RefreshCw, ShieldCheck, ChevronLeft,
  User, Phone, Briefcase, MapPin, Check, Zap, Star,
  HardHat, ShoppingBag,
} from 'lucide-react'
import { Background } from '@/components/glass/Background'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassInput } from '@/components/glass/GlassInput'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/lib/api'
import { PUNE_AREAS } from '@/lib/utils'
import { toast } from 'sonner'

const OTP_LENGTH = 6

// intent → email → otp → profile → area
const STEP_ORDER = ['intent', 'email', 'otp', 'profile', 'area']

export default function LoginPage() {
  const navigate = useNavigate()
  const { setAuth, updateUser } = useAuthStore()

  const [step, setStep] = useState('intent')
  const [prevStep, setPrevStep] = useState(null)

  // Intent: 'user' | 'worker'
  const [intent, setIntent] = useState(null)

  // Step 2+3
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [resendTimer, setResendTimer] = useState(0)

  // Step 4 — Profile
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')

  // Step 5 — Area
  const [selectedArea, setSelectedArea] = useState('')

  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  function goTo(next) {
    setPrevStep(step)
    setStep(next)
    setError('')
  }

  function goBack() {
    const idx = STEP_ORDER.indexOf(step)
    if (idx > 0) {
      setPrevStep(step)
      setStep(STEP_ORDER[idx - 1])
      setError('')
    }
  }

  const direction = prevStep
    ? STEP_ORDER.indexOf(step) > STEP_ORDER.indexOf(prevStep) ? 1 : -1
    : 1

  function pickIntent(val) {
    setIntent(val)
    goTo('email')
  }

  // ── Step 2: Send OTP ────────────────────────────────────────
  async function sendOtp() {
    if (!email.trim()) return
    setError('')
    setLoading(true)
    try {
      await api.post('/auth/send-otp', { email: email.trim().toLowerCase() })
      goTo('otp')
      startResendTimer()
      toast.success('OTP sent to your email')
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to send OTP. Try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 3: Verify OTP ──────────────────────────────────────
  async function verifyOtp() {
    const cleanOtp = otp.replace(/\D/g, '').slice(0, OTP_LENGTH)
    if (cleanOtp.length !== OTP_LENGTH) return
    setError('')
    setLoading(true)
    try {
      const { data } = await api.post('/auth/verify-otp', {
        email: email.trim().toLowerCase(),
        token: cleanOtp,
      })
      setAuth(data)

      const isNewUser = !data.user?.full_name

      if (isNewUser) {
        toast.success('Account created! Let\'s set up your profile.')
        goTo('profile')
      } else {
        toast.success('Welcome back!')
        // Existing user — role-first routing
        if (data.user?.role === 'admin') {
          navigate('/admin')
        } else if (data.user?.role === 'worker') {
          navigate('/worker')
        } else if (intent === 'worker') {
          let hasWorkerProfile = false
          try {
            await api.get('/workers/me/profile')
            hasWorkerProfile = true
          } catch (e) {
            if (e?.response?.status !== 404) throw e
          }
          if (hasWorkerProfile) {
            updateUser({ role: 'worker' })
            navigate('/worker')
          } else {
            navigate('/onboard/worker')
          }
        } else {
          navigate('/')
        }
      }
    } catch (e) {
      setError(e.response?.data?.detail || 'Invalid OTP')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 4: Save Profile ────────────────────────────────────
  async function submitProfile() {
    if (!fullName.trim()) {
      setError('Please enter your name')
      return
    }
    setError('')
    setLoading(true)
    try {
      const payload = { full_name: fullName.trim() }
      if (phone.trim()) payload.phone = phone.trim()
      const { data } = await api.patch('/users/me', payload)
      updateUser(data)
      goTo('area')
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to save profile. Try again.')
    } finally {
      setLoading(false)
    }
  }

  // ── Step 5: Save Area + Navigate ───────────────────────────
  async function submitArea() {
    if (!selectedArea) {
      setError('Please select your area')
      return
    }
    setError('')
    setLoading(true)
    try {
      await api.put('/users/me/preferences', {
        pune_area: selectedArea,
        preferred_mode: 'instant',
      })
    } catch (_) {
      // Non-fatal
    } finally {
      setLoading(false)
    }

    if (intent === 'worker') {
      toast.success('Profile saved! Let\'s get you set up as a worker.')
      navigate('/onboard/worker')
    } else {
      toast.success('Welcome to Kaargar!')
      navigate('/')
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

  const slideVariants = {
    enter: (dir) => ({ opacity: 0, x: dir > 0 ? 40 : -40 }),
    center: { opacity: 1, x: 0 },
    exit: (dir) => ({ opacity: 0, x: dir > 0 ? -40 : 40 }),
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <Background />

      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: intent === 'worker'
            ? 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(245,158,11,0.08) 0%, transparent 70%)'
            : 'radial-gradient(ellipse 60% 50% at 50% 40%, rgba(59,130,246,0.10) 0%, transparent 70%)',
          transition: 'background 0.6s ease',
        }}
      />

      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 24 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 280, damping: 26 }}
      >
        {/* Logo */}
        <div className="flex flex-col items-center mb-8">
          <h1 className="text-6xl font-bold gradient-text-hero" style={{ fontFamily: "'Playwrite NO', cursive" }}>
            Kaargar
          </h1>
          <p className="text-xl mt-1" style={{ color: 'var(--text-muted)' }}>Kaam Ho Jayega</p>
        </div>

        {/* Step dots for profile/area steps */}
        {(step === 'profile' || step === 'area') && (
          <motion.div
            initial={{ opacity: 0, y: -8 }}
            animate={{ opacity: 1, y: 0 }}
            className="flex items-center justify-center gap-2 mb-5"
          >
            {['profile', 'area'].map((s, i) => (
              <div
                key={s}
                style={{
                  width: step === s ? '28px' : '8px',
                  height: '8px',
                  borderRadius: '4px',
                  background: step === s
                    ? (intent === 'worker' ? 'var(--amber)' : 'var(--azure)')
                    : 'var(--card-border)',
                  transition: 'all 0.3s ease',
                }}
              />
            ))}
          </motion.div>
        )}

        <GlassCard className={step === 'intent' ? 'p-0 overflow-hidden' : 'p-6 overflow-hidden'}>
          <AnimatePresence mode="wait" custom={direction}>

            {/* ── STEP 1: Intent ── */}
            {step === 'intent' && (
              <motion.div
                key="intent-step"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
              >
                <div className="p-6 pb-5">
                  <h2 className="text-xl font-bold font-syne text-center" style={{ color: 'var(--text-primary)' }}>
                    How can we help?
                  </h2>
                  <p className="text-sm mt-1 text-center" style={{ color: 'var(--text-muted)' }}>
                    Choose how you'd like to use Kaargar
                  </p>
                </div>

                {/* User card */}
                <motion.button
                  onClick={() => pickIntent('user')}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full text-left"
                  style={{
                    padding: '20px 24px',
                    borderTop: '1px solid var(--card-border)',
                    borderBottom: '1px solid var(--card-border)',
                    background: 'transparent',
                    transition: 'background 0.15s ease',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(59,130,246,0.05)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{
                      width: '52px', height: '52px', borderRadius: '16px',
                      background: 'rgba(59,130,246,0.12)',
                      border: '1px solid rgba(59,130,246,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <ShoppingBag size={22} style={{ color: 'var(--azure)' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p className="text-base font-semibold font-syne" style={{ color: 'var(--text-primary)' }}>
                        Book a Service
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        Find verified workers near you
                      </p>
                      <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                        {['⚡ Instant', '📍 Nearby', '⭐ Verified'].map(tag => (
                          <span key={tag} style={{
                            fontSize: '10px',
                            padding: '2px 8px',
                            borderRadius: '100px',
                            background: 'rgba(59,130,246,0.10)',
                            color: 'var(--azure)',
                          }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <ArrowRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  </div>
                </motion.button>

                {/* Worker card */}
                <motion.button
                  onClick={() => pickIntent('worker')}
                  whileHover={{ scale: 1.01 }}
                  whileTap={{ scale: 0.98 }}
                  className="w-full text-left"
                  style={{
                    padding: '20px 24px',
                    background: 'transparent',
                    transition: 'background 0.15s ease',
                    cursor: 'pointer',
                  }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.05)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                    <div style={{
                      width: '52px', height: '52px', borderRadius: '16px',
                      background: 'rgba(245,158,11,0.12)',
                      border: '1px solid rgba(245,158,11,0.2)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <HardHat size={22} style={{ color: 'var(--amber)' }} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p className="text-base font-semibold font-syne" style={{ color: 'var(--text-primary)' }}>
                        Become a Worker
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        Earn by offering your skills
                      </p>
                      <div style={{ display: 'flex', gap: '10px', marginTop: '8px' }}>
                        {['💰 Earn', '🕐 Flexible', '🚀 Grow'].map(tag => (
                          <span key={tag} style={{
                            fontSize: '10px',
                            padding: '2px 8px',
                            borderRadius: '100px',
                            background: 'rgba(245,158,11,0.10)',
                            color: 'var(--amber)',
                          }}>
                            {tag}
                          </span>
                        ))}
                      </div>
                    </div>
                    <ArrowRight size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  </div>
                </motion.button>

                <p className="text-center text-xs pb-5 pt-2" style={{ color: 'var(--text-muted)', opacity: 0.6 }}>
                  Pune, Maharashtra · India
                </p>
              </motion.div>
            )}

            {/* ── STEP 2: Email ── */}
            {step === 'email' && (
              <motion.div
                key="email-step"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                className="space-y-5"
              >
                <div>
                  <button
                    onClick={goBack}
                    className="flex items-center gap-1 text-xs mb-3 transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Back
                  </button>

                  {/* Intent badge */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '12px' }}>
                    <div style={{
                      padding: '4px 10px',
                      borderRadius: '100px',
                      background: intent === 'worker' ? 'rgba(245,158,11,0.12)' : 'rgba(59,130,246,0.12)',
                      border: `1px solid ${intent === 'worker' ? 'rgba(245,158,11,0.25)' : 'rgba(59,130,246,0.25)'}`,
                      display: 'flex', alignItems: 'center', gap: '6px',
                    }}>
                      {intent === 'worker'
                        ? <HardHat size={12} style={{ color: 'var(--amber)' }} />
                        : <ShoppingBag size={12} style={{ color: 'var(--azure)' }} />
                      }
                      <span style={{
                        fontSize: '11px',
                        fontWeight: 600,
                        color: intent === 'worker' ? 'var(--amber)' : 'var(--azure)',
                      }}>
                        {intent === 'worker' ? 'Worker sign-up' : 'Customer sign-up'}
                      </span>
                    </div>
                  </div>

                  <h2 className="text-lg font-semibold font-syne" style={{ color: 'var(--text-primary)' }}>
                    Sign in or create account
                  </h2>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Enter your email to continue
                  </p>
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
                  variant={intent === 'worker' ? 'discovery' : 'brand'}
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

                <p className="text-center text-xs" style={{ color: 'var(--text-muted)' }}>
                  By continuing you agree to our Terms &amp; Privacy Policy
                </p>
              </motion.div>
            )}

            {/* ── STEP 3: OTP ── */}
            {step === 'otp' && (
              <motion.div
                key="otp-step"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                className="space-y-5"
              >
                <div>
                  <button
                    onClick={goBack}
                    className="flex items-center gap-1 text-xs mb-3 transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Back
                  </button>
                  <h2 className="text-lg font-semibold font-syne" style={{ color: 'var(--text-primary)' }}>
                    Check your email
                  </h2>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    Sent to <span style={{ color: 'var(--text-secondary)' }}>{email}</span>
                  </p>
                </div>

                <OtpBoxes value={otp} onChange={setOtp} length={OTP_LENGTH} onComplete={verifyOtp} accentColor={intent === 'worker' ? 'var(--amber)' : 'var(--azure)'} />

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
                  variant={intent === 'worker' ? 'discovery' : 'brand'}
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
                    <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                      Resend in{' '}
                      <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>
                        {resendTimer}s
                      </span>
                    </p>
                  ) : (
                    <button
                      onClick={() => { sendOtp(); setOtp('') }}
                      className="flex items-center gap-1.5 text-xs mx-auto transition-colors"
                      style={{ color: 'var(--azure)' }}
                    >
                      <RefreshCw className="h-3 w-3" />
                      Resend OTP
                    </button>
                  )}
                </div>
              </motion.div>
            )}

            {/* ── STEP 4: Profile ── */}
            {step === 'profile' && (
              <motion.div
                key="profile-step"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                className="space-y-5"
              >
                <div>
                  <h2 className="text-lg font-semibold font-syne" style={{ color: 'var(--text-primary)' }}>
                    {intent === 'worker' ? 'Your worker profile' : 'Your profile'}
                  </h2>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {intent === 'worker'
                      ? 'Clients will see this name on your profile'
                      : 'Tell us a bit about yourself'
                    }
                  </p>
                </div>

                <GlassInput
                  label="Full name"
                  placeholder="e.g. Rahul Sharma"
                  value={fullName}
                  onChange={e => { setFullName(e.target.value); setError('') }}
                  onKeyDown={e => e.key === 'Enter' && submitProfile()}
                  icon={User}
                  error={error && error.includes('name') ? error : ''}
                  autoFocus
                />

                <GlassInput
                  type="tel"
                  label="Phone number (optional)"
                  placeholder="+91 9876543210"
                  value={phone}
                  onChange={e => setPhone(e.target.value)}
                  icon={Phone}
                />

                {/* Worker intent reminder */}
                {intent === 'worker' && (
                  <div style={{
                    display: 'flex', alignItems: 'center', gap: '10px',
                    padding: '12px 14px', borderRadius: '12px',
                    background: 'rgba(245,158,11,0.06)',
                    border: '1px solid rgba(245,158,11,0.18)',
                  }}>
                    <HardHat size={16} style={{ color: 'var(--amber)', flexShrink: 0 }} />
                    <p className="text-xs" style={{ color: 'var(--amber)', lineHeight: '1.5' }}>
                      After this, we'll set up your worker profile so you can start earning.
                    </p>
                  </div>
                )}

                {error && !error.includes('name') && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs text-red-400"
                  >
                    {error}
                  </motion.p>
                )}

                <GlassButton
                  variant={intent === 'worker' ? 'discovery' : 'brand'}
                  size="lg"
                  className="w-full"
                  loading={loading}
                  onClick={submitProfile}
                  icon={ArrowRight}
                  iconPosition="right"
                  disabled={!fullName.trim()}
                >
                  Continue
                </GlassButton>
              </motion.div>
            )}

            {/* ── STEP 5: Area ── */}
            {step === 'area' && (
              <motion.div
                key="area-step"
                custom={direction}
                variants={slideVariants}
                initial="enter"
                animate="center"
                exit="exit"
                transition={{ type: 'spring', stiffness: 320, damping: 30 }}
                className="space-y-5"
              >
                <div>
                  <button
                    onClick={goBack}
                    className="flex items-center gap-1 text-xs mb-3 transition-colors"
                    style={{ color: 'var(--text-muted)' }}
                    onMouseEnter={e => e.currentTarget.style.color = 'var(--text-secondary)'}
                    onMouseLeave={e => e.currentTarget.style.color = 'var(--text-muted)'}
                  >
                    <ChevronLeft className="h-3.5 w-3.5" />
                    Back
                  </button>
                  <h2 className="text-lg font-semibold font-syne" style={{ color: 'var(--text-primary)' }}>
                    Your area in Pune
                  </h2>
                  <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
                    {intent === 'worker'
                      ? 'Where will you mostly offer your services?'
                      : 'We\'ll show you services nearby'
                    }
                  </p>
                </div>

                {/* Area grid */}
                <div style={{
                  display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)',
                  gap: '8px', maxHeight: '260px', overflowY: 'auto', paddingRight: '2px',
                }}>
                  {PUNE_AREAS.map(area => {
                    const selected = selectedArea === area
                    return (
                      <motion.button
                        key={area}
                        onClick={() => { setSelectedArea(area); setError('') }}
                        whileTap={{ scale: 0.96 }}
                        style={{
                          padding: '10px 12px', borderRadius: '10px',
                          border: selected
                            ? `1.5px solid ${intent === 'worker' ? 'var(--amber)' : 'var(--azure)'}`
                            : '1px solid var(--card-border)',
                          background: selected
                            ? (intent === 'worker' ? 'rgba(245,158,11,0.12)' : 'rgba(59,130,246,0.10)')
                            : 'var(--card-bg)',
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                          gap: '8px', cursor: 'pointer', transition: 'all 0.15s ease', textAlign: 'left',
                        }}
                      >
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', minWidth: 0 }}>
                          <MapPin size={13} style={{
                            color: selected
                              ? (intent === 'worker' ? 'var(--amber)' : 'var(--azure)')
                              : 'var(--text-muted)',
                            flexShrink: 0,
                          }} />
                          <span style={{
                            fontSize: '12px', fontWeight: selected ? 600 : 400,
                            color: selected ? 'var(--text-primary)' : 'var(--text-secondary)',
                            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          }}>
                            {area}
                          </span>
                        </div>
                        {selected && (
                          <div style={{
                            width: '16px', height: '16px', borderRadius: '50%',
                            background: intent === 'worker' ? 'var(--amber)' : 'var(--azure)',
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            flexShrink: 0,
                          }}>
                            <Check size={10} color="#000" strokeWidth={3} />
                          </div>
                        )}
                      </motion.button>
                    )
                  })}
                </div>

                {error && (
                  <motion.p
                    initial={{ opacity: 0, y: -4 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="text-xs text-red-400"
                  >
                    {error}
                  </motion.p>
                )}

                <GlassButton
                  variant={intent === 'worker' ? 'discovery' : 'brand'}
                  size="lg"
                  className="w-full"
                  loading={loading}
                  onClick={submitArea}
                  icon={intent === 'worker' ? HardHat : ArrowRight}
                  iconPosition="right"
                  disabled={!selectedArea}
                >
                  {intent === 'worker' ? 'Set Up Worker Profile' : 'Get Started'}
                </GlassButton>
              </motion.div>
            )}
          </AnimatePresence>
        </GlassCard>
      </motion.div>
    </div>
  )
}

// ── OTP Box component ──────────────────────────────────────────
function OtpBoxes({ value, onChange, length, onComplete, accentColor }) {
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
    if (next.replace(/\s/g, '').length === length) onComplete?.()
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
          className="glass-input rounded-xl text-center text-lg font-bold font-mono"
          style={{
            width: '48px',
            height: '52px',
            color: 'var(--text-primary)',
            outline: d ? `2px solid ${accentColor || 'var(--azure)'}` : 'none',
            outlineOffset: '0px',
            transition: 'outline 0.15s ease',
          }}
          autoFocus={i === 0}
        />
      ))}
    </div>
  )
}
