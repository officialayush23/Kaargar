/**
 * AdminLogin — Supabase email + password, admin-only.
 * Uses the same Supabase auth flow as LoginPage.
 * SupabaseAuthSync in App.jsx handles the session/provision.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { Eye, EyeOff, Loader2, Lock, Mail, ShieldCheck } from 'lucide-react'
import { supabase } from '@/lib/supabase'
import { api } from '@/lib/api'
import { useAuthStore } from '@/stores/auth'
import { toast } from 'sonner'

function PasswordInput({ value, onChange, onKeyDown }) {
  const [show, setShow] = useState(false)
  return (
    <div className="relative">
      <Lock size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
        style={{ color: '#475569' }} />
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={onChange}
        onKeyDown={onKeyDown}
        placeholder="Your password"
        className="w-full rounded-xl pl-9 pr-10 py-3 text-sm outline-none transition-all"
        style={{
          background: 'rgba(255,255,255,0.06)',
          border: '1px solid rgba(255,255,255,0.1)',
          color: '#F1F5F9',
        }}
        onFocus={e  => e.target.style.borderColor = 'rgba(245,158,11,0.5)'}
        onBlur={e   => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
      />
      <button
        type="button"
        tabIndex={-1}
        onClick={() => setShow(v => !v)}
        className="absolute right-3 top-1/2 -translate-y-1/2"
        style={{ color: '#475569' }}
      >
        {show ? <EyeOff size={15} /> : <Eye size={15} />}
      </button>
    </div>
  )
}

export default function AdminLogin() {
  const navigate    = useNavigate()
  const { setSession, setUser } = useAuthStore()
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [loading,  setLoading]  = useState(false)
  const [error,    setError]    = useState('')

  async function handleSignIn(e) {
    e?.preventDefault()
    if (!email.trim() || !password) return
    setError(''); setLoading(true)
    try {
      const { data, error: sbErr } = await supabase.auth.signInWithPassword({
        email: email.trim().toLowerCase(),
        password,
      })
      if (sbErr) throw sbErr

      // Provision to get our DB user record
      const token = data.session.access_token
      localStorage.setItem('kaargar_token', token)
      const { data: userRecord } = await api.post('/auth/provision', {})

      if (userRecord.role !== 'admin') {
        await supabase.auth.signOut()
        localStorage.removeItem('kaargar_token')
        throw new Error('Access denied — admin accounts only.')
      }

      setSession(data.session)
      setUser(userRecord)
      toast.success('Welcome, Admin')
      navigate('/admin', { replace: true })
    } catch (e) {
      const msg = e.message || ''
      if (msg.includes('Invalid login credentials') || msg.includes('invalid_credentials')) {
        setError('Incorrect email or password.')
      } else {
        setError(msg || 'Sign in failed. Try again.')
      }
    } finally { setLoading(false) }
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

        <form
          onSubmit={handleSignIn}
          className="rounded-3xl p-6 space-y-4"
          style={{
            background: 'rgba(13,17,23,0.9)',
            backdropFilter: 'blur(32px)',
            border: '1px solid rgba(255,255,255,0.08)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.5)',
          }}
        >
          {/* Admin badge */}
          <div className="flex items-center gap-2 mb-2">
            <ShieldCheck size={16} style={{ color: '#f59e0b' }} />
            <span className="text-xs font-semibold" style={{ color: '#f59e0b' }}>Admin Access Only</span>
          </div>

          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: '#94A3B8' }}>
              Email address
            </label>
            <div className="relative">
              <Mail size={15} className="absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none"
                style={{ color: '#475569' }} />
              <input
                type="email"
                value={email}
                onChange={e => { setEmail(e.target.value); setError('') }}
                onKeyDown={e => e.key === 'Enter' && handleSignIn()}
                required
                placeholder="admin@kaargar.in"
                autoFocus
                className="w-full rounded-xl pl-9 py-3 text-sm outline-none transition-all"
                style={{
                  background: 'rgba(255,255,255,0.06)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  color: '#F1F5F9',
                }}
                onFocus={e => e.target.style.borderColor = 'rgba(245,158,11,0.5)'}
                onBlur={e  => e.target.style.borderColor = 'rgba(255,255,255,0.1)'}
              />
            </div>
          </div>

          <div>
            <label className="text-xs font-medium mb-1.5 block" style={{ color: '#94A3B8' }}>
              Password
            </label>
            <PasswordInput
              value={password}
              onChange={e => { setPassword(e.target.value) }}
              placeholder="Admin password"
              required
            />
          </div>

          {error && (
            <p className="text-sm text-center" style={{ color: '#f87171' }}>{error}</p>
          )}

          <GlassButton type="submit" variant="brand" size="lg" className="w-full" loading={loading}>
            Sign In to Admin
          </GlassButton>

          <div className="text-center">
            <button
              type="button"
              onClick={handleForgotPassword}
              className="text-xs"
              style={{ color: 'var(--brand)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Forgot password?
            </button>
          </div>
        </form>
      </motion.div>
    </div>
  )
}
