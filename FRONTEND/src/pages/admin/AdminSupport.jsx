/**
 * AdminSupport — support ticket queue with resolve action.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LifeBuoy, Search, AlertTriangle, CheckCircle, Clock, ChevronDown, ChevronUp, Send } from 'lucide-react'
import { api } from '@/lib/api'
import { formatRelativeTime } from '@/lib/utils'
import { toast } from 'sonner'
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Skeleton } from '@/components/ui/skeleton'

const TYPE_LABELS = { general: 'General', job: 'Job Issue', payment: 'Payment', account: 'Account', other: 'Other' }

function TicketCard({ ticket, onResolve, resolving }) {
  const [expanded, setExpanded] = useState(false)
  const isOpen = ticket.status === 'open'

  return (
    <div style={{ background: 'var(--card-bg)', border: '1px solid var(--card-border)', borderRadius: 14, overflow: 'hidden' }}>
      <button className="w-full text-left p-4" onClick={() => setExpanded(e => !e)}>
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[10px] font-medium px-1.5 py-0.5 rounded"
                style={{ background: 'var(--card-bg)', color: 'var(--text-secondary)' }}>
                {TYPE_LABELS[ticket.type] || 'General'}
              </span>
              <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full`}
                style={{
                  background: isOpen ? 'var(--accent-deep)' : 'var(--card-bg)',
                  color: isOpen ? 'var(--accent)' : 'var(--text-secondary)',
                }}>
                {isOpen ? 'Open' : 'Resolved'}
              </span>
            </div>
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>{ticket.title}</p>
            <p className="text-[11px] mt-0.5" style={{ color: 'var(--text-muted)' }}>
              {ticket.user?.full_name || ticket.user?.email || 'Unknown user'} · {formatRelativeTime(ticket.created_at)}
            </p>
          </div>
          {expanded ? <ChevronUp size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} /> : <ChevronDown size={16} style={{ color: 'var(--text-muted)', flexShrink: 0 }} />}
        </div>
      </button>

      {expanded && <TicketThread ticket={ticket} isOpen={isOpen} onResolve={onResolve} resolving={resolving} />}
    </div>
  )
}


/**
 * The conversation itself — the thing that was missing.
 *
 * Before this, the ONLY admin action on a ticket was "Mark Resolved". A
 * customer could open a ticket, write a message, and there was no way for
 * anyone to answer them: the support "chat" only had one side. Resolving was
 * the sole write path, so any reply also closed the ticket.
 *
 * Loads on expand (not with the list) so opening the queue doesn't fetch a
 * thread for every ticket.
 */
function TicketThread({ ticket, isOpen, onResolve, resolving }) {
  const qc = useQueryClient()
  const [draft, setDraft] = useState('')

  const { data, isLoading } = useQuery({
    queryKey: ['admin', 'support', 'thread', ticket.id],
    queryFn: () => api.get(`/support/admin/tickets/${ticket.id}`).then(r => r.data),
    refetchInterval: 15_000,
  })

  const replyMut = useMutation({
    mutationFn: (content) => api.post(`/support/admin/tickets/${ticket.id}/messages`, { content }),
    onSuccess: () => {
      setDraft('')
      qc.invalidateQueries(['admin', 'support', 'thread', ticket.id])
      qc.invalidateQueries(['admin', 'support'])
      toast.success('Reply sent')
    },
    onError: () => toast.error('Could not send reply'),
  })

  const messages = data?.messages || []
  const requester = data?.requester

  function send(e) {
    e?.preventDefault()
    const content = draft.trim()
    if (!content || replyMut.isPending) return
    replyMut.mutate(content)
  }

  return (
    <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--card-border)' }}>
      {requester && (
        <p className="text-[11px] mt-3" style={{ color: 'var(--text-muted)' }}>
          {requester.full_name || '—'} · {requester.email}{requester.phone ? ` · ${requester.phone}` : ''}
        </p>
      )}

      {/* The opening message. Rendered as the first bubble rather than as a
          separate description block — it IS the first thing they said. */}
      <div className="mt-3 space-y-2" style={{ maxHeight: 320, overflowY: 'auto' }}>
        <Bubble fromAdmin={false} text={ticket.description} at={ticket.created_at} />
        {isLoading ? (
          <Skeleton className="h-10 rounded-xl" style={{ background: 'var(--card-bg)' }} />
        ) : (
          messages.map(m => (
            <Bubble key={m.id} fromAdmin={m.sender_role === 'admin'} text={m.content} at={m.created_at} />
          ))
        )}
      </div>

      <form onSubmit={send} className="flex items-end gap-2 mt-3">
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) send(e) }}
          placeholder="Reply to the customer…"
          rows={2}
          className="flex-1 text-sm rounded-xl px-3 py-2 resize-none"
          style={{
            background: 'var(--bg-surface)',
            border: '1px solid var(--card-border)',
            color: 'var(--text-primary)',
            outline: 'none',
          }}
        />
        <Button type="submit" disabled={!draft.trim() || replyMut.isPending}
          style={{ height: 38, fontSize: 13 }}>
          <Send size={14} />
          {replyMut.isPending ? 'Sending…' : 'Send'}
        </Button>
      </form>

      {isOpen && (
        <div className="flex justify-end mt-3">
          <Button
            onClick={() => onResolve(ticket.id)}
            disabled={resolving}
            style={{ background: '#22c55e', color: '#fff', height: 34, fontSize: 12.5 }}
          >
            <CheckCircle size={14} />
            {resolving ? 'Resolving…' : 'Mark Resolved'}
          </Button>
        </div>
      )}
    </div>
  )
}

function Bubble({ fromAdmin, text, at }) {
  return (
    <div className={`flex ${fromAdmin ? 'justify-end' : 'justify-start'}`}>
      <div
        className="max-w-[80%] rounded-xl px-3 py-2"
        style={{
          background: fromAdmin ? 'var(--accent)' : 'var(--bg-surface)',
          color: fromAdmin ? '#000' : 'var(--text-secondary)',
          border: fromAdmin ? 'none' : '1px solid var(--card-border)',
        }}
      >
        {fromAdmin && (
          <p className="text-[9.5px] font-bold uppercase tracking-wide mb-0.5" style={{ opacity: 0.65 }}>Support</p>
        )}
        <p className="text-[13px] leading-relaxed whitespace-pre-wrap">{text}</p>
        <p className="text-[10px] mt-1" style={{ opacity: 0.6 }}>{formatRelativeTime(at)}</p>
      </div>
    </div>
  )
}

export default function AdminSupport() {
  const qc = useQueryClient()
  const [status, setStatus] = useState('open')
  const [search, setSearch] = useState('')
  const [resolvingId, setResolvingId] = useState(null)

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['admin', 'support', status],
    queryFn: () => api.get('/support/admin/tickets', { params: { status } }).then(r => r.data?.tickets || r.data || []),
    refetchInterval: 30_000,
  })

  const resolveMut = useMutation({
    mutationFn: async (id) => {
      setResolvingId(id)
      return api.patch(`/support/admin/tickets/${id}/resolve`)
    },
    onSuccess: () => { qc.invalidateQueries(['admin', 'support']); toast.success('Ticket resolved') },
    onError: () => toast.error('Failed to resolve ticket'),
    onSettled: () => setResolvingId(null),
  })

  const filtered = tickets.filter(t => {
    if (!search) return true
    const q = search.toLowerCase()
    return (t.title || '').toLowerCase().includes(q) || (t.user?.email || '').toLowerCase().includes(q)
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-syne" style={{ color: 'var(--text-primary)' }}>Support</h1>
        <p className="text-sm mt-1" style={{ color: 'var(--text-muted)' }}>Manage user and worker support tickets</p>
      </div>

      <div className="flex items-center justify-between gap-4 mb-5 flex-wrap">
        <Tabs value={status} onValueChange={setStatus}>
          <TabsList>
            <TabsTrigger value="open"><Clock size={13} className="mr-1" /> Open</TabsTrigger>
            <TabsTrigger value="resolved"><CheckCircle size={13} className="mr-1" /> Resolved</TabsTrigger>
          </TabsList>
        </Tabs>
        <div className="relative">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2" style={{ color: 'var(--text-muted)' }} />
          <Input placeholder="Search tickets…" value={search} onChange={e => setSearch(e.target.value)}
            className="pl-8 w-52 h-9 text-xs" style={{ background: 'var(--card-bg)' }} />
        </div>
      </div>

      {isLoading ? (
        <div className="space-y-3">
          {[1,2,3].map(i => <Skeleton key={i} className="h-20 rounded-2xl" style={{ background: 'var(--card-bg)' }} />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-20">
          <LifeBuoy size={36} style={{ color: 'var(--text-secondary)', margin: '0 auto 12px' }} />
          <p style={{ color: 'var(--text-muted)' }}>No {status} tickets</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(ticket => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onResolve={(id) => resolveMut.mutate(id)}
              resolving={resolvingId === ticket.id}
            />
          ))}
        </div>
      )}
    </div>
  )
}
