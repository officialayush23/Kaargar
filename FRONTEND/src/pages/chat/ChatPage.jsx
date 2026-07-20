import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Send, Phone, MessageCircle } from 'lucide-react'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Background } from '@/components/glass/Background'
import { formatRelativeTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

// Job-completion-flow system events get a distinct icon/tone on the pill.
const SYSTEM_EVENT_META = {
  bill_submitted: { icon: '🧾', tone: 'var(--text-secondary)' },
  bill_approved:  { icon: '✅', tone: 'var(--emerald)' },
  bill_disputed:  { icon: '⚠️', tone: '#f87171' },
  job_completed:  { icon: '🎉', tone: 'var(--accent)' },
}

function SystemMessage({ msg }) {
  const meta = SYSTEM_EVENT_META[msg.system_event] || { icon: 'ℹ️', tone: 'var(--text-muted)' }
  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      className="flex justify-center py-1"
    >
      <div
        className="flex items-center gap-2 px-3.5 py-1.5 rounded-full text-xs font-medium max-w-[90%] text-center"
        style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: meta.tone }}
      >
        <span>{meta.icon}</span>
        <span>{msg.content}</span>
      </div>
    </motion.div>
  )
}

function Message({ msg, isOwn }) {
  if (msg.type === 'system' || msg.system_event) {
    return <SystemMessage msg={msg} />
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}
    >
      <div
        className={cn(
          'max-w-[78%] px-4 py-2.5 rounded-2xl',
          isOwn ? 'rounded-br-sm' : 'glass rounded-bl-sm'
        )}
        style={isOwn ? { background: 'var(--accent)' } : undefined}
      >
        <p className="text-sm leading-relaxed" style={{ color: isOwn ? '#000' : 'var(--text-primary)' }}>
          {msg.content}
        </p>
        <p className="text-[12px] mt-1" style={{ color: isOwn ? 'rgba(0,0,0,0.5)' : 'var(--text-muted)' }}>
          {formatRelativeTime(msg.created_at)}
        </p>
      </div>
    </motion.div>
  )
}

export default function ChatPage() {
  const { jobId } = useParams()
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const qc = useQueryClient()
  const bottomRef = useRef()
  const textRef = useRef()
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)

  const { data: job } = useQuery({
    queryKey: ['job', jobId],
    queryFn: () => jobId ? api.get(`/jobs/${jobId}`).then(r => r.data) : null,
    enabled: !!jobId,
  })

  const { data: messages = [], isLoading } = useQuery({
    queryKey: ['chat-messages', jobId],
    queryFn: () => api.get(`/chat/${jobId}/messages`).then(r => r.data),
    enabled: !!jobId,
  })

  const chatId = job?.chat_id
  const otherParty = user?.role === 'worker' ? job?.client : job?.worker

  useEffect(() => {
    if (!chatId) return
    api.patch(`/chat/${jobId}/read`).catch(() => {})

    const channel = supabase
      .channel(`chat:${chatId}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'messages',
        filter: `chat_id=eq.${chatId}`,
      }, (payload) => {
        qc.setQueryData(['chat-messages', jobId], (prev = []) => [...prev, payload.new])
      })
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [chatId, jobId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  async function sendMessage(e) {
    e?.preventDefault()
    if (!text.trim() || !jobId) return
    setSending(true)
    const content = text.trim()
    setText('')
    try {
      await api.post(`/chat/${jobId}/messages`, { content })
    } catch {
      setText(content)
    } finally {
      setSending(false)
    }
  }

  if (!jobId) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 gap-3 text-center">
        <MessageCircle className="h-10 w-10" style={{ color: 'var(--text-muted)' }} />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No active conversations</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen">
      <Background />

      {/* Chat header */}
      <div className="glass-navbar px-4 py-3 flex items-center gap-3 shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl transition-colors"
          style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}
        >
          <ArrowLeft className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
        </button>

        <Avatar className="h-9 w-9" style={{ border: '1px solid var(--g-border)' }}>
          <AvatarImage src={otherParty?.avatar_url} />
          <AvatarFallback className="text-sm font-bold">
            {otherParty?.full_name?.[0] || 'W'}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm truncate" style={{ color: 'var(--text-primary)' }}>
            {otherParty?.full_name || 'Support'}
          </p>
          <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{job?.category?.name || 'Service'}</p>
        </div>

        <button
          className="p-2 rounded-xl transition-colors"
          style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}
        >
          <Phone className="h-4 w-4" style={{ color: 'var(--text-secondary)' }} />
        </button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-2.5">
        {isLoading ? (
          <div className="flex justify-center pt-8">
            <div className="w-6 h-6 rounded-full border-2 border-azure/50 border-t-azure animate-spin" />
          </div>
        ) : messages.length === 0 ? (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center gap-3 pt-12 text-center"
          >
            <div className="w-14 h-14 rounded-2xl glass flex items-center justify-center">
              <MessageCircle className="h-6 w-6" style={{ color: 'var(--text-muted)' }} />
            </div>
            <p className="text-sm" style={{ color: 'var(--text-muted)' }}>No messages yet.</p>
            <p className="text-xs" style={{ color: 'var(--text-muted)' }}>Start the conversation!</p>
          </motion.div>
        ) : (
          messages.map(msg => (
            <Message key={msg.id} msg={msg} isOwn={msg.sender_id === user?.id} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input bar */}
      <form
        onSubmit={sendMessage}
        className="glass-navbar px-4 py-3 flex items-end gap-3 shrink-0"
      >
        <textarea
          ref={textRef}
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() } }}
          placeholder="Type a message..."
          rows={1}
          className="flex-1 glass-input rounded-xl px-4 py-2.5 text-sm resize-none max-h-32 overflow-y-auto"
          style={{ color: 'var(--text-primary)', fieldSizing: 'content' }}
        />
        <motion.button
          type="submit"
          disabled={!text.trim() || sending}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 disabled:opacity-35"
          style={{ background: 'var(--accent)' }}
        >
          {sending
            ? <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
            : <Send className="h-4 w-4 text-white" />
          }
        </motion.button>
      </form>
    </div>
  )
}
