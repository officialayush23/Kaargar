import { useEffect, useRef, useState } from 'react'
import { useParams, useNavigate } from 'react-router-dom'
import { motion } from 'framer-motion'
import { ArrowLeft, Send, Loader2 } from 'lucide-react'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { formatRelativeTime } from '@/lib/utils'

function Message({ msg, isOwn }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}
    >
      <div className={`max-w-[75%] px-4 py-2.5 rounded-2xl ${
        isOwn
          ? 'bg-brand text-white rounded-br-sm'
          : 'glass-light text-[--text-primary] rounded-bl-sm'
      }`}>
        <p className="text-sm leading-relaxed">{msg.content}</p>
        <p className={`text-[10px] mt-1 ${isOwn ? 'text-white/60' : 'text-[--text-muted]'}`}>
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
  const queryClient = useQueryClient()
  const bottomRef = useRef()
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
    refetchInterval: false,
  })

  const chatId = job?.chat_id

  useEffect(() => {
    if (!chatId) return
    api.patch(`/chat/${jobId}/read`).catch(() => {})

    const channel = supabase
      .channel(`chat:${chatId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `chat_id=eq.${chatId}` },
        (payload) => {
          queryClient.setQueryData(['chat-messages', jobId], (prev = []) => [
            ...prev,
            payload.new,
          ])
        }
      )
      .subscribe()
    return () => supabase.removeChannel(channel)
  }, [chatId, jobId])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages.length])

  const sendMessage = async (e) => {
    e.preventDefault()
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

  const otherParty = job?.worker || job?.client

  if (!jobId) {
    return (
      <div className="flex flex-col items-center justify-center h-full py-20 gap-3">
        <p className="text-[--text-muted] text-sm">Select a conversation to start chatting</p>
      </div>
    )
  }

  return (
    <div className="flex flex-col h-screen bg-[--bg-base]">
      {/* Header */}
      <div className="sticky top-0 z-20 glass border-b border-white/5 flex items-center gap-3 px-4 py-3.5">
        <button onClick={() => navigate(-1)} className="p-1.5 rounded-xl hover:bg-white/5">
          <ArrowLeft size={20} className="text-[--text-secondary]" />
        </button>
        <div className="flex-1">
          <p className="font-semibold text-sm text-[--text-primary]">{otherParty?.full_name || 'Chat'}</p>
          <p className="text-xs text-[--text-muted]">{job?.category?.name || 'Service'}</p>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-3">
        {isLoading ? (
          <div className="flex justify-center pt-8"><Loader2 size={20} className="animate-spin text-brand" /></div>
        ) : messages.length === 0 ? (
          <p className="text-center text-xs text-[--text-muted] pt-8">No messages yet. Say hello!</p>
        ) : (
          messages.map((msg) => (
            <Message key={msg.id} msg={msg} isOwn={msg.sender_id === user?.id} />
          ))
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <form
        onSubmit={sendMessage}
        className="glass border-t border-white/5 px-4 py-3 flex items-end gap-3"
      >
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(e) } }}
          placeholder="Type a message…"
          rows={1}
          className="flex-1 bg-white/5 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-[--text-primary] placeholder:text-[--text-muted] focus:outline-none resize-none max-h-28 overflow-y-auto"
          style={{ fieldSizing: 'content' }}
        />
        <button
          type="submit"
          disabled={!text.trim() || sending}
          className="w-10 h-10 rounded-xl bg-brand flex items-center justify-center shrink-0 disabled:opacity-40 active:scale-90 transition-transform"
        >
          {sending ? <Loader2 size={16} className="animate-spin text-white" /> : <Send size={16} className="text-white" />}
        </button>
      </form>
    </div>
  )
}
