import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { Eye, EyeOff, ArrowLeft, Zap, Search } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { Background } from '@/components/glass/Background'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { toast } from 'sonner'

const slide = {
  enter:  (d) => ({ x: d > 0 ? 40 : -40, opacity: 0 }),
  center: { x: 0, opacity: 1 },
  exit:   (d) => ({ x: d < 0 ? 40 : -40, opacity: 0 }),
}
const trans = { type: 'spring', stiffness: 380, damping: 30 }

function PasswordInput({ value, onChange, placeholder = 'Password', ...rest }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        className="pr-10"
        autoComplete="current-password"
        {...rest}
      />
      <button
        type="button"
        onClick={() => setShow(s => !s)}
        className="absolute right-3 top-1/2 -translate-y-1/2"
        style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer' }}
      >
        {show ? <EyeOff size={16} /> : <Eye size={16} />}
      </button>
    </div>
  )
}

export default function LoginPage() {
  const navigate  = useNavigate()
  const { setSession, setUser } = useAuthStore()

  const [step,      setStep]      = useState('intent')   // intent | email | credentials | check-email
  const [direction, setDirection] = useState(1)
  const [intent,    setIntent]    = useState('user')     // 'user' | 'worker'
  const [mode,      setMode]      = useState('signin')   // signin | signup
  const [loading,   setLoading]   = useState(false)

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [fullName, setFullName] = useState('')

  const accentColor = 'var(--accent)'

  function go(nextStep, dir = 1) {
    setDirection(dir)
    setStep(nextStep)
  }

  async function handleCredentials(e) {
    e.preventDefault()
    setLoading(true)
    try {
      if (mode === 'signin') {
        const { data, error } = await supabase.auth.signInWithPassword({ email, password })
        if (error) { toast.error(error.message); return }

        setSession(data.session)

        try {
          const { data: user } = await api.post('/auth/provision', {
            role: intent === 'worker' ? 'worker' : 'user',
          })
          setUser(user)
          const role = user?.role
          if (role === 'admin')         navigate('/admin',          { replace: true })
          else if (role === 'worker')   navigate('/worker',         { replace: true })
          else if (intent === 'worker') navigate('/onboard/worker', { replace: true })
          else                          navigate('/',               { replace: true })
        } catch {
          toast.error('Could not load account. Please try again.')
        }

      } else {
        if (!fullName.trim()) { toast.error('Enter your name'); return }

        // Persist intent + name so SupabaseAuthSync can use them after email
        // verification (the /auth/provision call that actually creates the
        // DB user row happens later, on the SIGNED_IN event fired once the
        // confirmation link is clicked — not here).
        if (intent === 'worker') localStorage.setItem('kaargar_signup_intent', 'worker')
        else localStorage.removeItem('kaargar_signup_intent')
        localStorage.setItem('kaargar_signup_full_name', fullName.trim())

        const { error } = await supabase.auth.signUp({ email, password })
        if (error) {
          // Account already exists — silently switch to sign-in
          if (
            error.status === 422 ||
            error.message?.toLowerCase().includes('already') ||
            error.message?.toLowerCase().includes('registered')
          ) {
            setMode('signin')
            localStorage.removeItem('kaargar_signup_intent')
            localStorage.removeItem('kaargar_signup_full_name')
            toast.info('Account already exists — please sign in.')
          } else {
            toast.error(error.message)
          }
          return
        }
        go('check-email')
      }
    } finally {
      setLoading(false)
    }
  }

  async function handleForgotPassword() {
    if (!email) { toast.error('Enter your email first'); return }
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: `${window.location.origin}/login`,
    })
    if (error) toast.error(error.message)
    else toast.success('Password reset email sent!')
  }

  return (
    <div
      className="min-h-screen flex flex-col items-center justify-center px-4 py-12"
      style={{ background: 'var(--page-bg)' }}
    >
      <Background />

      {/* Logo */}
      <motion.div
        className="mb-8 text-center"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
      >
        <span style={{
          fontFamily: '"Playwrite NO", cursive',
          fontSize: '36px', fontWeight: 700,
          color: 'var(--text-primary)', letterSpacing: '-0.02em',
        }}>
          Kaargar
        </span>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>
          Hyperlocal services, Pune
        </p>
      </motion.div>

      <div className="w-full max-w-sm relative" style={{ minHeight: '380px' }}>
        <AnimatePresence mode="wait" custom={direction}>

          {/* ── Intent ─────────────────────────────────────────────── */}
          {step === 'intent' && (
            <motion.div key="intent" custom={direction} variants={slide}
              initial="enter" animate="center" exit="exit" transition={trans}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-center text-xl">Welcome back</CardTitle>
                  <CardDescription className="text-center">How do you use Kaargar?</CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  <button
                    onClick={() => { setIntent('user'); go('email') }}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all"
                    style={{ background: 'var(--g-bg)', border: '1.5px solid var(--accent-border)' }}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--accent-bg)' }}>
                      <Search size={18} style={{ color: 'var(--accent)' }} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>I need services</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Book workers instantly</p>
                    </div>
                  </button>

                  <button
                    onClick={() => { setIntent('worker'); go('email') }}
                    className="w-full flex items-center gap-4 p-4 rounded-2xl text-left transition-all"
                    style={{ background: 'var(--g-bg)', border: '1.5px solid var(--accent-dim)' }}
                  >
                    <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
                      style={{ background: 'var(--accent-deep)' }}>
                      <Zap size={18} style={{ color: 'var(--accent)' }} />
                    </div>
                    <div>
                      <p className="font-semibold text-sm" style={{ color: 'var(--text-primary)' }}>I am a worker</p>
                      <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Manage jobs &amp; earnings</p>
                    </div>
                  </button>

                  <p className="text-center text-xs pt-1" style={{ color: 'var(--text-muted)' }}>
                    Same account — role assigned automatically
                  </p>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ── Email ──────────────────────────────────────────────── */}
          {step === 'email' && (
            <motion.div key="email" custom={direction} variants={slide}
              initial="enter" animate="center" exit="exit" transition={trans}>
              <Card>
                <CardHeader>
                  <button onClick={() => go('intent', -1)}
                    className="flex items-center gap-1 mb-2 text-sm"
                    style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <ArrowLeft size={14} /> Back
                  </button>
                  {/* Intent badge */}
                  <div className="mb-1">
                    <span className="text-xs font-semibold px-2 py-0.5 rounded-full" style={{
                      background: 'var(--accent-deep)',
                      color: 'var(--accent)',
                    }}>
                      {intent === 'worker' ? '⚡ Worker' : '🔍 Customer'}
                    </span>
                  </div>
                  <CardTitle>Your email</CardTitle>
                  <CardDescription>We'll sign you in or create your account</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={(e) => { e.preventDefault(); if (email) go('credentials') }} className="space-y-4">
                    <Input
                      type="email"
                      placeholder="you@example.com"
                      value={email}
                      onChange={e => setEmail(e.target.value)}
                      autoFocus
                      required
                      autoComplete="email"
                    />
                    <Button type="submit" className="w-full" disabled={!email}
                      style={{ background: accentColor }}>
                      Continue
                    </Button>
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ── Credentials ────────────────────────────────────────── */}
          {step === 'credentials' && (
            <motion.div key="credentials" custom={direction} variants={slide}
              initial="enter" animate="center" exit="exit" transition={trans}>
              <Card>
                <CardHeader>
                  <button onClick={() => go('email', -1)}
                    className="flex items-center gap-1 mb-2 text-sm"
                    style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                    <ArrowLeft size={14} /> Back
                  </button>

                  {/* Sign in / Sign up toggle */}
                  <div className="flex rounded-xl p-1 mb-3" style={{ background: 'var(--g-bg)' }}>
                    {['signin', 'signup'].map(m => (
                      <button
                        key={m}
                        onClick={() => setMode(m)}
                        className="flex-1 py-2 rounded-lg text-sm font-medium transition-all"
                        style={{
                          background: mode === m ? accentColor : 'transparent',
                          color: mode === m ? '#fff' : 'var(--text-muted)',
                          border: 'none', cursor: 'pointer',
                        }}
                      >
                        {m === 'signin' ? 'Sign In' : 'Sign Up'}
                      </button>
                    ))}
                  </div>

                  <CardTitle>{mode === 'signin' ? 'Welcome back' : 'Create account'}</CardTitle>
                  <CardDescription style={{ wordBreak: 'break-all' }}>{email}</CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleCredentials} className="space-y-3">
                    {mode === 'signup' && (
                      <Input
                        type="text"
                        placeholder="Your full name"
                        value={fullName}
                        onChange={e => setFullName(e.target.value)}
                        autoComplete="name"
                        required
                      />
                    )}
                    <PasswordInput
                      value={password}
                      onChange={e => setPassword(e.target.value)}
                      placeholder={mode === 'signup' ? 'Create a password (min 6 chars)' : 'Password'}
                      required
                    />
                    <Button type="submit" className="w-full"
                      disabled={loading || !password || (mode === 'signup' && !fullName.trim())}
                      style={{ background: accentColor }}>
                      {loading ? 'Please wait…' : mode === 'signin' ? 'Sign In' : 'Create Account'}
                    </Button>
                    {mode === 'signin' && (
                      <div className="text-center">
                        <button type="button" onClick={handleForgotPassword}
                          className="text-xs"
                          style={{ color: accentColor, background: 'none', border: 'none', cursor: 'pointer' }}>
                          Forgot password?
                        </button>
                      </div>
                    )}
                  </form>
                </CardContent>
              </Card>
            </motion.div>
          )}

          {/* ── Check Email (after sign up) ────────────────────────── */}
          {step === 'check-email' && (
            <motion.div key="check-email" custom={direction} variants={slide}
              initial="enter" animate="center" exit="exit" transition={trans}>
              <Card>
                <CardHeader>
                  <CardTitle className="text-center">Check your inbox</CardTitle>
                  <CardDescription className="text-center">
                    We sent a confirmation link to{' '}
                    <strong style={{ color: 'var(--text-primary)', wordBreak: 'break-all' }}>
                      {email}
                    </strong>.
                    Click it to activate your account, then sign in.
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3 text-center">
                  <p className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    Check spam if you don't see it within a minute.
                  </p>
                  <Button variant="outline" className="w-full" onClick={() => { setMode('signin'); go('credentials', -1) }}>
                    Back to Sign In
                  </Button>
                </CardContent>
              </Card>
            </motion.div>
          )}

        </AnimatePresence>
      </div>
    </div>
  )
}
