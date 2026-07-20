/**
 * AdminSupport — support ticket queue with resolve action.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { LifeBuoy, Search, AlertTriangle, CheckCircle, Clock, ChevronDown, ChevronUp } from 'lucide-react'
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

      {expanded && (
        <div style={{ padding: '0 16px 16px', borderTop: '1px solid var(--card-border)' }}>
          <p className="text-sm mt-3 leading-relaxed" style={{ color: 'var(--text-secondary)' }}>{ticket.description}</p>
          {isOpen && (
            <div className="flex justify-end mt-4">
              <Button
                onClick={() => onResolve(ticket.id)}
                disabled={resolving}
                style={{ background: '#22c55e', color: '#fff', height: 36, fontSize: 13 }}
              >
                <CheckCircle size={14} />
                {resolving ? 'Resolving…' : 'Mark Resolved'}
              </Button>
            </div>
          )}
        </div>
      )}
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
