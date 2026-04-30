/**
 * AdminSupport — view and resolve support tickets.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { motion, AnimatePresence } from 'framer-motion'
import { MessageSquare, ChevronDown, ChevronUp, Send } from 'lucide-react'
import { api } from '@/lib/api'
import { toast } from 'sonner'

const PRIORITY_COLORS = {
  critical: '#f87171',
  high:     '#fb923c',
  medium:   '#fbbf24',
  low:      '#94A3B8',
}

const STATUS_STYLES = {
  open:        { bg: 'rgba(245,158,11,0.15)', color: '#fbbf24' },
  in_progress: { bg: 'rgba(75,123,255,0.15)', color: '#6B94FF' },
  resolved:    { bg: 'rgba(34,197,94,0.15)',  color: '#4ade80' },
  closed:      { bg: 'rgba(71,85,105,0.3)',   color: '#94A3B8' },
}

function TicketRow({ ticket }) {
  const [expanded, setExpanded] = useState(false)
  const [reply, setReply] = useState('')
  const qc = useQueryClient()

  const resolve = useMutation({
    mutationFn: ({ id, resolution }) =>
      api.patch(`/support/admin/tickets/${id}/resolve`, { resolution }),
    onSuccess: () => {
      toast.success('Ticket resolved')
      qc.invalidateQueries({ queryKey: ['admin', 'tickets'] })
    },
    onError: () => toast.error('Failed to resolve'),
  })

  const status = STATUS_STYLES[ticket.status] || STATUS_STYLES.open
  const priorityColor = PRIORITY_COLORS[ticket.priority] || '#94A3B8'

  return (
    <div
      className="rounded-2xl overflow-hidden"
      style={{ background: 'rgba(13,17,23,0.8)', border: '1px solid rgba(255,255,255,0.07)' }}
    >
      {/* Header row */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-start gap-3 p-4 text-left"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <span className="text-sm font-semibold truncate" style={{ color: '#F1F5F9' }}>
              {ticket.title}
            </span>
            <span
              className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase"
              style={{ color: priorityColor, background: `${priorityColor}15` }}
            >
              {ticket.priority}
            </span>
            <span
              className="text-[10px] font-semibold px-2 py-0.5 rounded-full capitalize"
              style={{ background: status.bg, color: status.color }}
            >
              {ticket.status.replace('_', ' ')}
            </span>
          </div>
          <p className="text-xs truncate" style={{ color: '#475569' }}>
            {ticket.type} · {new Date(ticket.created_at).toLocaleDateString('en-IN')}
          </p>
        </div>
        {expanded
          ? <ChevronUp className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: '#475569' }} />
          : <ChevronDown className="h-4 w-4 flex-shrink-0 mt-0.5" style={{ color: '#475569' }} />
        }
      </button>

      {/* Expanded detail */}
      <AnimatePresence>
        {expanded && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}
          >
            <div className="p-4 space-y-4">
              <div>
                <p className="text-xs font-medium mb-1" style={{ color: '#475569' }}>Description</p>
                <p className="text-sm" style={{ color: '#94A3B8' }}>{ticket.description}</p>
              </div>

              {ticket.resolution && (
                <div className="rounded-xl p-3"
                  style={{ background: 'rgba(34,197,94,0.06)', border: '1px solid rgba(34,197,94,0.15)' }}>
                  <p className="text-xs font-medium mb-1" style={{ color: '#4ade80' }}>Resolution</p>
                  <p className="text-sm" style={{ color: '#94A3B8' }}>{ticket.resolution}</p>
                </div>
              )}

              {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
                <div>
                  <textarea
                    value={reply}
                    onChange={(e) => setReply(e.target.value)}
                    placeholder="Write resolution / reply…"
                    rows={3}
                    className="w-full rounded-xl px-3 py-2 text-sm resize-none outline-none mb-2"
                    style={{
                      background: 'rgba(255,255,255,0.05)',
                      border: '1px solid rgba(255,255,255,0.1)',
                      color: '#F1F5F9',
                    }}
                  />
                  <button
                    onClick={() => resolve.mutate({ id: ticket.id, resolution: reply })}
                    disabled={!reply.trim() || resolve.isPending}
                    className="flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-50"
                    style={{ background: '#f59e0b', color: '#000' }}
                  >
                    <Send className="h-3.5 w-3.5" />
                    Resolve Ticket
                  </button>
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  )
}

export default function AdminSupport() {
  const [statusFilter, setStatusFilter] = useState('open')

  const { data: tickets = [], isLoading } = useQuery({
    queryKey: ['admin', 'tickets', statusFilter],
    queryFn: async () => {
      try {
        const { data } = await api.get(`/support/admin/tickets?status=${statusFilter}`)
        return data
      } catch {
        return []
      }
    },
  })

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-syne" style={{ color: '#F1F5F9' }}>Support Tickets</h1>
        <p className="text-sm mt-1" style={{ color: '#475569' }}>Respond to worker and user support requests</p>
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5">
        {['open', 'in_progress', 'resolved', 'closed'].map((s) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className="px-3 py-1.5 rounded-full text-xs font-medium capitalize transition-all"
            style={{
              background: statusFilter === s ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.05)',
              color: statusFilter === s ? '#f59e0b' : '#94A3B8',
              border: statusFilter === s ? '1px solid rgba(245,158,11,0.3)' : '1px solid rgba(255,255,255,0.07)',
            }}
          >
            {s.replace('_', ' ')}
          </button>
        ))}
      </div>

      {isLoading ? (
        <div className="text-center py-16" style={{ color: '#475569' }}>Loading…</div>
      ) : tickets.length === 0 ? (
        <div className="text-center py-16" style={{ color: '#475569' }}>
          <MessageSquare className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p>No {statusFilter} tickets</p>
        </div>
      ) : (
        <div className="space-y-3">
          {tickets.map((t) => <TicketRow key={t.id} ticket={t} />)}
        </div>
      )}
    </div>
  )
}
