import { useState, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import {
  Mail, ArrowRight, RefreshCw, ShieldCheck, ChevronLeft,
  User, Phone, MapPin, Check, HardHat, ShoppingBag, Loader2,
} from 'lucide-react'
import { Background } from '@/components/glass/Background'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { useAuthStore } from '@/stores/auth'
import { api } from '@/lib/api'
import { PUNE_AREAS } from '@/lib/utils'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

const OTP_LENGTH = 6
const STEP_ORDER = ['intent', 'email', 'otp', 'profile', 'area']

/* ── Label helper ──────────────────────────────────────── */
function Label({ children, htmlFor }) {
  return (
    <label
      htmlFor={htmlFor}
      className="block text-xs font-medium mb-1.5"
      style={{ color: 'var(--text-secondary)' }}
    >
      {children}
    </label>
  )
}

/* ── OTP digit inputs ──────────────────────────────────── */
function OtpBoxes({ value, onChange, length, onComplete, accent }) {
  const inputsRef = useRef([])
  const digits = value.split('').concat(Array(length).fill('')).slice(0, length)

  function handleChange(index, char) {
    const clean = char.replace(/\D/g, '').slice(-1)
    const arr = digits.slice()
    arr[index] = clean
    const next = arr.join('')
    onChange(next)
    if (clean && index < length - 1) inputsRef.current[index + 1]?.focus()
    if (next.replace(/\s/g, '').length === length) onComplete?.()
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace' && !digits[index] && index > 0) {
      inputsRef.current[index - 1]?.focus()
    }
    if (e.key === 'ArrowLeft' && index > 0) inputsRef.current[index - 1]?.focus()
    if (e.key === 'ArrowRight' && index < length - 1) inputsRef.current[index + 1]?.focus()
  }

  function handlePaste(e) {
    const text = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    onChange(text)
    if (text.length === length) onComplete?.()
    inputsRef.current[Math.min(text.length, length - 1)]?.focus()
    e.preventDefault()
  }

  return (
    <div className="flex gap-2 justify-center">
      {digits.map((d, i) => (
        <input
          key={i}
          ref={el => inputsRef.current[i] = el}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={d}
          onChange={e => handleChange(i, e.target.value)}
          onKeyDown={e => handleKeyDown(i, e)}
          onPaste={handlePaste}
          autoFocus={i === 0}
          className="h-14 w-12 rounded-xl text-center text-xl font-bold font-mono transition-all outline-none"
          style={{
            background: 'var(--g-bg)',
            border: d
              ? `2px solid ${accent}`
              : '1.5px solid var(--g-border)',
            color: 'var(--text-primary)',
            boxShadow: d ? `0 0 0 3px ${accent}20` : 'none',
          }}
        />
      ))}
    </div>
  )
}

/* ── Main page ──────────────────────────────────────────── */
export default function LoginPage() {
  const navigate = useNavigate()
  const { setAuth, updateUser } = useAuthStore()

  const [step, setStep] = useState('intent')
  const [prevStep, setPrevStep] = useState(null)
  const [intent, setIntent] = useState(null)
  const [email, setEmail] = useState('')
  const [otp, setOtp] = useState('')
  const [resendTimer, setResendTimer] = useState(0)
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [selectedArea, setSelectedArea] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const isWorker = intent === 'worker'
  const accent = isWorker ? '#f59e0b' : '#4B7BFF'

  function goTo(next) { setPrevStep(step); setStep(next); setError('') }
  function goBack() {
    const idx = STEP_ORDER.indexOf(step)
    if (idx > 0) { setPrevStep(step); setStep(STEP_ORDER[idx - 1]); setError('') }
  }
  const direction = prevStep
    ? STEP_ORDER.indexOf(step) > STEP_ORDER.indexOf(prevStep) ? 1 : -1
    : 1

  async function sendOtp() {
    if (!email.trim()) return
    setError(''); setLoading(true)
    try {
      await api.post('/auth/send-otp', { email: email.trim().toLowerCase() })
      goTo('otp'); startResendTimer()
      toast.success('OTP sent — check your inbox')
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to send OTP. Try again.')
    } finally { setLoading(false) }
  }

  async function verifyOtp() {
    const cleanOtp = otp.replace(/\D/g, '').slice(0, OTP_LENGTH)
    if (cleanOtp.length !== OTP_LENGTH) return
    setError(''); setLoading(true)
    try {
      const { data } = await api.post('/auth/verify-otp', {
        email: email.trim().toLowerCase(), token: cleanOtp,
      })
      setAuth(data)
      const isNewUser = !data.user?.full_name
      if (isNewUser) {
        toast.success("Let's set up your profile")
        goTo('profile')
      } else {
        toast.success('Welcome back!')
        if (data.user?.role === 'admin') navigate('/admin')
        else if (data.user?.role === 'worker') navigate('/worker')
        else if (intent === 'worker') {
          try { await api.get('/workers/me/profile'); updateUser({ role: 'worker' }); navigate('/worker') }
          catch { navigate('/onboard/worker') }
        } else navigate('/')
      }
    } catch (e) {
      setError(e.response?.data?.detail || 'Incorrect OTP. Try again.')
    } finally { setLoading(false) }
  }

  async function submitProfile() {
    if (!fullName.trim()) { setError('Please enter your name'); return }
    setError(''); setLoading(true)
    try {
      const payload = { full_name: fullName.trim() }
      if (phone.trim()) payload.phone = phone.trim()
      const { data } = await api.patch('/users/me', payload)
      updateUser(data); goTo('area')
    } catch (e) {
      setError(e.response?.data?.detail || 'Failed to save profile.')
    } finally { setLoading(false) }
  }

  async function submitArea() {
    if (!selectedArea) { setError('Please select your area'); return }
    setLoading(true)
    try { await api.put('/users/me/preferences', { pune_area: selectedArea, preferred_mode: 'instant' }) }
    catch { /* non-fatal */ }
    finally { setLoading(false) }
    if (isWorker) { toast.success("Let's get you set up as a worker"); navigate('/onboard/worker') }
    else { toast.success('Welcome to Kaargar!'); navigate('/') }
  }

  function startResendTimer() {
    setResendTimer(60)
    const id = setInterval(() => setResendTimer(t => { if (t <= 1) { clearInterval(id); return 0 } return t - 1 }), 1000)
  }

  const slide = {
    enter: dir => ({ opacity: 0, x: dir > 0 ? 32 : -32 }),
    center: { opacity: 1, x: 0 },
    exit: dir => ({ opacity: 0, x: dir > 0 ? -32 : 32 }),
  }
  const trans = { type: 'spring', stiffness: 340, damping: 30 }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative">
      <Background />
      {/* Ambient glow */}
      <div
        className="fixed inset-0 pointer-events-none transition-all duration-700"
        style={{ background: `radial-gradient(ellipse 55% 45% at 50% 38%, ${isWorker ? 'rgba(245,158,11,0.07)' : 'rgba(75,123,255,0.08)'} 0%, transparent 70%)` }}
      />

      <motion.div
        className="w-full max-w-sm"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      >
        {/* Logo */}
        <div className="text-center mb-7">
          <h1
            className="text-5xl font-bold"
            style={{ fontFamily: "'Playwrite NO', cursive", color: 'var(--text-primary)' }}
          >
            Kaargar
          </h1>
          <p className="text-sm mt-1.5" style={{ color: 'var(--text-muted)' }}>
            Kaam Ho Jayega
          </p>
        </div>

        {/* Step progress dots (profile + area only) */}
        <AnimatePresence>
          {(step === 'profile' || step === 'area') && (
            <motion.div
              initial={{ opacity: 0, y: -6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center justify-center gap-2 mb-4"
            >
              {['profile', 'area'].map(s => (
                <motion.div
                  key={s}
                  animate={{ width: step === s ? 24 : 8 }}
                  style={{
                    height: 8, borderRadius: 4,
                    background: step === s ? accent : 'var(--g-border)',
                    transition: 'width 0.3s ease, background 0.3s ease',
                  }}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Card */}
        <Card className={step === 'intent' ? 'overflow-hidden p-0' : 'overflow-hidden'}>
          <AnimatePresence mode="wait" custom={direction}>

            {/* ── Intent step ── */}
            {step === 'intent' && (
              <motion.div key="intent" custom={direction} variants={slide} initial="enter" animate="center" exit="exit" transition={trans}>
                <CardHeader className="pb-3">
                  <CardTitle>How can we help?</CardTitle>
                  <CardDescription>Choose how you'd like to use Kaargar</CardDescription>
                </CardHeader>

                {/* Book a service */}
                <button
                  onClick={() => { setIntent('user'); goTo('email') }}
                  className="w-full text-left transition-colors"
                  style={{ padding: '16px 20px', borderTop: '1px solid var(--g-border)', borderBottom: '1px solid var(--g-border)' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(75,123,255,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                      style={{ background: 'rgba(75,123,255,0.1)', border: '1px solid rgba(75,123,255,0.2)' }}>
                      <ShoppingBag size={20} style={{ color: '#4B7BFF' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Book a Service</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Find verified workers near you</p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {['Instant', 'Nearby', 'Verified'].map(t => (
                          <span key={t} className="text-[10px] px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(75,123,255,0.1)', color: '#4B7BFF' }}>
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <ArrowRight size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  </div>
                </button>

                {/* Become a worker */}
                <button
                  onClick={() => { setIntent('worker'); goTo('email') }}
                  className="w-full text-left transition-colors"
                  style={{ padding: '16px 20px' }}
                  onMouseEnter={e => e.currentTarget.style.background = 'rgba(245,158,11,0.04)'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl flex items-center justify-center shrink-0"
                      style={{ background: 'rgba(245,158,11,0.1)', border: '1px solid rgba(245,158,11,0.2)' }}>
                      <HardHat size={20} style={{ color: '#f59e0b' }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>Become a Worker</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>Earn by offering your skills</p>
                      <div className="flex gap-2 mt-2 flex-wrap">
                        {['Earn', 'Flexible', 'Grow'].map(t => (
                          <span key={t} className="text-[10px] px-2 py-0.5 rounded-full"
                            style={{ background: 'rgba(245,158,11,0.1)', color: '#f59e0b' }}>
                            {t}
                          </span>
                        ))}
                      </div>
                    </div>
                    <ArrowRight size={15} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />
                  </div>
                </button>

                <p className="text-center text-[11px] py-4" style={{ color: 'var(--text-muted)', opacity: 0.5 }}>
                  Pune, Maharashtra &middot; India
                </p>
              </motion.div>
            )}

            {/* ── Email step ── */}
            {step === 'email' && (
              <motion.div key="email" custom={direction} variants={slide} initial="enter" animate="center" exit="exit" transition={trans}>
                <CardHeader>
                  <button onClick={goBack} className="flex items-center gap-1 text-xs mb-1 w-fit" style={{ color: 'var(--text-muted)' }}>
                    <ChevronLeft size={14} /> Back
                  </button>
                  {/* Intent badge */}
                  <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-full w-fit mb-1"
                    style={{ background: isWorker ? 'rgba(245,158,11,0.1)' : 'rgba(75,123,255,0.1)', color: accent, border: `1px solid ${accent}30` }}>
                    {isWorker ? <HardHat size={11} /> : <ShoppingBag size={11} />}
                    {isWorker ? 'Worker sign-up' : 'Customer sign-up'}
                  </span>
                  <CardTitle>Sign in or create account</CardTitle>
                  <CardDescription>Enter your email to continue</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="email-input">Email address</Label>
                    <div className="relative">
                      <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                      <Input
                        id="email-input"
                        type="email"
                        placeholder="you@example.com"
                        value={email}
                        onChange={e => { setEmail(e.target.value); setError('') }}
                        onKeyDown={e => e.key === 'Enter' && sendOtp()}
                        className="pl-9"
                        autoFocus
                      />
                    </div>
                    {error && <p className="text-xs text-red-400 mt-1.5">{error}</p>}
                  </div>
                  <Button
                    className="w-full font-semibold"
                    style={{ background: accent, color: '#fff' }}
                    disabled={!email.trim() || loading}
                    onClick={sendOtp}
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <><span>Continue</span><ArrowRight size={15} /></>}
                  </Button>
                  <p className="text-center text-[11px]" style={{ color: 'var(--text-muted)' }}>
                    By continuing you agree to our Terms &amp; Privacy Policy
                  </p>
                </CardContent>
              </motion.div>
            )}

            {/* ── OTP step ── */}
            {step === 'otp' && (
              <motion.div key="otp" custom={direction} variants={slide} initial="enter" animate="center" exit="exit" transition={trans}>
                <CardHeader>
                  <button onClick={goBack} className="flex items-center gap-1 text-xs mb-1 w-fit" style={{ color: 'var(--text-muted)' }}>
                    <ChevronLeft size={14} /> Back
                  </button>
                  <CardTitle>Check your email</CardTitle>
                  <CardDescription>
                    We sent a 6-digit code to{' '}
                    <span style={{ color: 'var(--text-secondary)' }}>{email}</span>
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-5">
                  <OtpBoxes value={otp} onChange={setOtp} length={OTP_LENGTH} onComplete={verifyOtp} accent={accent} />

                  {error && (
                    <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-xs text-red-400 text-center">
                      {error}
                    </motion.p>
                  )}

                  <Button
                    className="w-full font-semibold"
                    style={{ background: accent, color: '#fff' }}
                    disabled={otp.replace(/\D/g,'').length !== OTP_LENGTH || loading}
                    onClick={verifyOtp}
                  >
                    {loading
                      ? <Loader2 size={16} className="animate-spin" />
                      : <><ShieldCheck size={16} /><span>Verify Code</span></>}
                  </Button>

                  <div className="text-center">
                    {resendTimer > 0 ? (
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                        Resend in <span className="font-mono" style={{ color: 'var(--text-secondary)' }}>{resendTimer}s</span>
                      </p>
                    ) : (
                      <button
                        onClick={() => { sendOtp(); setOtp('') }}
                        className="inline-flex items-center gap-1.5 text-xs"
                        style={{ color: accent }}
                      >
                        <RefreshCw size={12} /> Resend OTP
                      </button>
                    )}
                  </div>
                </CardContent>
              </motion.div>
            )}

            {/* ── Profile step ── */}
            {step === 'profile' && (
              <motion.div key="profile" custom={direction} variants={slide} initial="enter" animate="center" exit="exit" transition={trans}>
                <CardHeader>
                  <CardTitle>{isWorker ? 'Your worker profile' : 'Your profile'}</CardTitle>
                  <CardDescription>
                    {isWorker ? 'Clients will see this on your profile' : 'Tell us a bit about yourself'}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="name-input">Full name</Label>
                    <div className="relative">
                      <User size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                      <Input
                        id="name-input"
                        placeholder="e.g. Rahul Sharma"
                        value={fullName}
                        onChange={e => { setFullName(e.target.value); setError('') }}
                        onKeyDown={e => e.key === 'Enter' && submitProfile()}
                        className="pl-9"
                        autoFocus
                      />
                    </div>
                  </div>
                  <div>
                    <Label htmlFor="phone-input">Phone <span style={{ color: 'var(--text-muted)' }}>(optional)</span></Label>
                    <div className="relative">
                      <Phone size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: 'var(--text-muted)' }} />
                      <Input
                        id="phone-input"
                        type="tel"
                        placeholder="+91 98765 43210"
                        value={phone}
                        onChange={e => setPhone(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                  </div>

                  {isWorker && (
                    <div className="flex items-start gap-3 p-3 rounded-xl"
                      style={{ background: 'rgba(245,158,11,0.06)', border: '1px solid rgba(245,158,11,0.18)' }}>
                      <HardHat size={15} style={{ color: '#f59e0b', flexShrink: 0, marginTop: 1 }} />
                      <p className="text-xs leading-relaxed" style={{ color: '#f59e0b' }}>
                        After this, we'll set up your worker profile so you can start earning.
                      </p>
                    </div>
                  )}

                  {error && <p className="text-xs text-red-400">{error}</p>}

                  <Button
                    className="w-full font-semibold"
                    style={{ background: accent, color: '#fff' }}
                    disabled={!fullName.trim() || loading}
                    onClick={submitProfile}
                  >
                    {loading ? <Loader2 size={16} className="animate-spin" /> : <><span>Continue</span><ArrowRight size={15} /></>}
                  </Button>
                </CardContent>
              </motion.div>
            )}

            {/* ── Area step ── */}
            {step === 'area' && (
              <motion.div key="area" custom={direction} variants={slide} initial="enter" animate="center" exit="exit" transition={trans}>
                <CardHeader>
                  <button onClick={goBack} className="flex items-center gap-1 text-xs mb-1 w-fit" style={{ color: 'var(--text-muted)' }}>
                    <ChevronLeft size={14} /> Back
                  </button>
                  <CardTitle>Your area in Pune</CardTitle>
                  <CardDescription>
                    {isWorker ? 'Where will you mostly offer services?' : "We'll show you services nearby"}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-2 gap-2" style={{ maxHeight: '240px', overflowY: 'auto' }}>
                    {PUNE_AREAS.map(area => {
                      const sel = selectedArea === area
                      return (
                        <button
                          key={area}
                          onClick={() => { setSelectedArea(area); setError('') }}
                          className="flex items-center gap-2 px-3 py-2.5 rounded-xl text-left transition-all text-xs font-medium"
                          style={{
                            background: sel ? `${accent}15` : 'var(--g-bg)',
                            border: sel ? `1.5px solid ${accent}` : '1px solid var(--g-border)',
                            color: sel ? 'var(--text-primary)' : 'var(--text-secondary)',
                          }}
                        >
                          <MapPin size={12} style={{ color: sel ? accent : 'var(--text-muted)', flexShrink: 0 }} />
                          <span className="truncate">{area}</span>
                          {sel && (
                            <span className="ml-auto shrink-0 flex items-center justify-center w-4 h-4 rounded-full" style={{ background: accent }}>
                              <Check size={9} color="#000" strokeWidth={3} />
                            </span>
                          )}
                        </button>
                      )
                    })}
                  </div>

                  {error && <p className="text-xs text-red-400">{error}</p>}

                  <Button
                    className="w-full font-semibold"
                    style={{ background: accent, color: '#fff' }}
                    disabled={!selectedArea || loading}
                    onClick={submitArea}
                  >
                    {loading
                      ? <Loader2 size={16} className="animate-spin" />
                      : <><span>{isWorker ? 'Set Up Worker Profile' : 'Get Started'}</span>{isWorker ? <HardHat size={15} /> : <ArrowRight size={15} />}</>}
                  </Button>
                </CardContent>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </motion.div>
    </div>
  )
}
