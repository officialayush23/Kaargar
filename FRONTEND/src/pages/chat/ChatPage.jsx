import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { ArrowLeft, Send, Phone, MessageCircle, MoreVertical } from 'lucide-react'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'
import { Background } from '@/components/glass/Background'
import { formatRelativeTime } from '@/lib/utils'
import { cn } from '@/lib/utils'

function Message({ msg, isOwn }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 6, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ type: 'spring', stiffness: 400, damping: 28 }}
      className={cn('flex', isOwn ? 'justify-end' : 'justify-start')}
    >
      <div className={cn(
        'max-w-[78%] px-4 py-2.5 rounded-2xl',
        isOwn
          ? 'bg-gradient-to-br from-azure to-azure-dim text-white rounded-br-sm shadow-[0_4px_16px_rgba(59,130,246,0.3)]'
          : 'glass text-white/85 rounded-bl-sm'
      )}>
        <p className="text-sm leading-relaxed">{msg.content}</p>
        <p className={cn('text-[10px] mt-1', isOwn ? 'text-white/55' : 'text-white/30')}>
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
        <MessageCircle className="h-10 w-10 text-white/15" />
        <p className="text-sm text-white/40">No active conversations</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen">
      <Background />

      {/* Chat header — full-width at top */}
      <div className="glass-navbar px-4 py-3 flex items-center gap-3 shrink-0">
        <button
          onClick={() => navigate(-1)}
          className="p-2 rounded-xl bg-white/8 hover:bg-white/15 transition-colors"
        >
          <ArrowLeft className="h-4 w-4 text-white/70" />
        </button>

        <Avatar className="h-9 w-9 border border-white/20">
          <AvatarImage src={otherParty?.avatar_url} />
          <AvatarFallback className="text-sm font-bold">
            {otherParty?.full_name?.[0] || 'W'}
          </AvatarFallback>
        </Avatar>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-sm text-white/90 truncate">
            {otherParty?.full_name || 'Support'}
          </p>
          <p className="text-xs text-white/40">{job?.category?.name || 'Service'}</p>
        </div>

        <button className="p-2 rounded-xl bg-white/8 hover:bg-white/15 transition-colors">
          <Phone className="h-4 w-4 text-white/60" />
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
              <MessageCircle className="h-6 w-6 text-white/25" />
            </div>
            <p className="text-sm text-white/40">No messages yet.</p>
            <p className="text-xs text-white/25">Start the conversation!</p>
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
          placeholder="Type a message…"
          rows={1}
          className="flex-1 glass-input rounded-xl px-4 py-2.5 text-sm text-white resize-none max-h-32 overflow-y-auto"
          style={{ fieldSizing: 'content' }}
        />
        <motion.button
          type="submit"
          disabled={!text.trim() || sending}
          whileHover={{ scale: 1.05 }}
          whileTap={{ scale: 0.92 }}
          className="w-10 h-10 rounded-xl bg-gradient-to-br from-azure to-azure-dim flex items-center justify-center shrink-0 disabled:opacity-35 shadow-[0_4px_16px_rgba(59,130,246,0.4)]"
        >
          {sending
            ? <div className="w-4 h-4 border-2 border-white/50 border-t-white rounded-full animate-spin" />
            : <Send className="h-4 w-4 text-white" />
          }
        </motion.button>
      </form>
    </div>
  )
}
