import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LifeBuoy, Plus, ArrowLeft, ChevronRight, Search } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { api } from '@/lib/api'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassModal } from '@/components/glass/GlassModal'
import { GlassInput, GlassTextarea } from '@/components/glass/GlassInput'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRelativeTime, formatCurrency, cn } from '@/lib/utils'
import { toast } from 'sonner'

const REASONS = [
  { key: 'no_show',   label: "Worker didn't show up" },
  { key: 'quality',   label: 'Poor service quality' },
  { key: 'billing',   label: 'Overcharged / billing issue' },
  { key: 'behavior',  label: 'Rude or unprofessional behavior' },
  { key: 'payment',   label: 'Payment or refund issue' },
  { key: 'safety',    label: 'Safety concern' },
  { key: 'other',     label: 'Something else' },
]

/**
 * New-ticket wizard: pick an order → pick what went wrong → submit.
 * Also supports a "not order-related" general-issue path.
 */
function NewTicketWizard({ open, onClose, onSubmit, submitting, initialJobId }) {
  const [step, setStep] = useState(initialJobId ? 'reason' : 'order')
  const [selectedJob, setSelectedJob] = useState(null)
  const [reason, setReason] = useState(null)
  const [detail, setDetail] = useState('')
  const [search, setSearch] = useState('')

  const { data: activeJobs = [] } = useQuery({
    queryKey: ['support-jobs', 'active'],
    queryFn: async () => (await api.get('/jobs/me', { params: { status: 'active' } })).data,
    enabled: open,
  })
  const { data: pastJobs = [] } = useQuery({
    queryKey: ['support-jobs', 'past'],
    queryFn: async () => (await api.get('/jobs/me', { params: { status: 'past' } })).data,
    enabled: open,
  })

  const orders = useMemo(() => [...activeJobs, ...pastJobs], [activeJobs, pastJobs])
  const filteredOrders = useMemo(() => {
    if (!search.trim()) return orders
    const q = search.toLowerCase()
    return orders.filter(j => (j.category_name || '').toLowerCase().includes(q) || (j.worker_name || '').toLowerCase().includes(q))
  }, [orders, search])

  useEffect(() => {
    if (!open) {
      setStep(initialJobId ? 'reason' : 'order')
      setSelectedJob(null)
      setReason(null)
      setDetail('')
      setSearch('')
    }
  }, [open, initialJobId])

  useEffect(() => {
    if (initialJobId && orders.length) {
      const match = orders.find(j => j.id === initialJobId)
      if (match) setSelectedJob(match)
    }
  }, [initialJobId, orders])

  function pickOrder(job) {
    setSelectedJob(job)
    setStep('reason')
  }

  function skipOrder() {
    setSelectedJob(null)
    setStep('reason')
  }

  function submit() {
    const reasonLabel = REASONS.find(r => r.key === reason)?.label || 'General issue'
    const title = selectedJob ? `${reasonLabel} — ${selectedJob.category_name || 'Order'}` : reasonLabel
    const descriptionParts = []
    if (selectedJob) descriptionParts.push(`Order: ${selectedJob.category_name || 'Service'} (${selectedJob.id})`)
    descriptionParts.push(`Issue: ${reasonLabel}`)
    if (detail.trim()) descriptionParts.push(`\nDetails:\n${detail.trim()}`)

    onSubmit({
      title,
      description: descriptionParts.join('\n'),
      type: selectedJob ? 'job' : 'general',
      job_id: selectedJob?.id || null,
    })
  }

  return (
    <GlassModal open={open} onClose={onClose} title={step === 'order' ? 'Select an order' : 'What went wrong?'} size="md">
      <AnimatePresence mode="wait">
        {step === 'order' && (
          <motion.div key="order" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-3">
            <GlassInput
              placeholder="Search your orders..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              icon={Search}
            />
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {filteredOrders.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>No orders found</p>
              ) : (
                filteredOrders.map(job => (
                  <GlassCard key={job.id} hover onClick={() => pickOrder(job)} className="p-3.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {job.category_name || 'Service'}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {job.worker_name ? `with ${job.worker_name} · ` : ''}{formatRelativeTime(job.created_at)}
                        {job.final_price ? ` · ${formatCurrency(job.final_price)}` : ''}
                      </p>
                    </div>
                    <span
                      className="text-[11px] px-2 py-0.5 rounded-full capitalize shrink-0"
                      style={{ background: 'var(--g-bg)', color: 'var(--text-secondary)', border: '1px solid var(--g-border)' }}
                    >
                      {job.status?.replace('_', ' ')}
                    </span>
                    <ChevronRight className="h-4 w-4 shrink-0" style={{ color: 'var(--text-muted)' }} />
                  </GlassCard>
                ))
              )}
            </div>
            <button
              onClick={skipOrder}
              className="w-full text-center text-sm py-3 rounded-xl transition-colors"
              style={{ color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}
            >
              Not about a specific order →
            </button>
          </motion.div>
        )}

        {step === 'reason' && (
          <motion.div key="reason" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-4">
            {!initialJobId && (
              <button
                onClick={() => setStep('order')}
                className="flex items-center gap-1 text-sm"
                style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                <ArrowLeft size={14} /> Back
              </button>
            )}

            {selectedJob && (
              <div className="p-3 rounded-xl flex items-center gap-2" style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Re: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{selectedJob.category_name || 'Order'}</span>
                </p>
              </div>
            )}

            <div className="grid grid-cols-1 gap-2">
              {REASONS.map(r => (
                <button
                  key={r.key}
                  onClick={() => setReason(r.key)}
                  className="text-left px-4 py-3 rounded-xl text-sm font-medium transition-all"
                  style={{
                    background: reason === r.key ? 'var(--accent-bg)' : 'var(--g-bg)',
                    border: `1.5px solid ${reason === r.key ? 'var(--accent)' : 'var(--g-border)'}`,
                    color: reason === r.key ? 'var(--accent)' : 'var(--text-secondary)',
                  }}
                >
                  {r.label}
                </button>
              ))}
            </div>

            <GlassTextarea
              label="Tell us what happened"
              placeholder="Add any extra detail that will help us resolve this..."
              value={detail}
              onChange={e => setDetail(e.target.value)}
              rows={3}
            />

            <GlassButton
              className="w-full"
              disabled={!reason}
              loading={submitting}
              onClick={submit}
            >
              Submit ticket
            </GlassButton>
          </motion.div>
        )}
      </AnimatePresence>
    </GlassModal>
  )
}

export default function SupportPage() {
  const qc = useQueryClient()
  const [searchParams] = useSearchParams()
  const jobIdParam = searchParams.get('job_id')

  const [openNew, setOpenNew] = useState(false)

  useEffect(() => {
    if (jobIdParam) setOpenNew(true)
  }, [jobIdParam])

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => (await api.get('/support/tickets')).data
  })

  const createMut = useMutation({
    mutationFn: async (payload) => (await api.post('/support/tickets', payload)).data,
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      setOpenNew(false)
      toast.success('Ticket submitted successfully')
    },
    onError: () => toast.error('Could not submit ticket — try again'),
  })

  return (
    <div className="p-4 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-syne" style={{ color: 'var(--text-primary)' }}>Support</h1>
          <p className="text-sm" style={{ color: 'var(--text-muted)' }}>We are here to help you</p>
        </div>
        <GlassButton variant="outline" size="icon" onClick={() => setOpenNew(true)}>
          <Plus size={18} />
        </GlassButton>
      </div>

      <div className="space-y-3">
        {isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : tickets?.length === 0 ? (
          <GlassCard className="p-8 flex flex-col items-center justify-center text-center">
            <LifeBuoy className="h-10 w-10 mb-3" style={{ color: 'var(--text-muted)' }} />
            <p className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>No active tickets</p>
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Need help with a job? Create a ticket.</p>
          </GlassCard>
        ) : (
          tickets?.map(t => (
            <GlassCard key={t.id} className="p-4">
              <div className="flex justify-between items-start mb-2">
                <p className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>{t.title}</p>
                <span
                  className="text-[12px] px-2 py-0.5 rounded-full capitalize"
                  style={{ background: 'var(--g-bg)', color: 'var(--text-secondary)', border: '1px solid var(--g-border)' }}
                >
                  {t.status.replace('_', ' ')}
                </span>
              </div>
              <p className="text-xs" style={{ color: 'var(--text-muted)' }}>{formatRelativeTime(t.created_at)}</p>
            </GlassCard>
          ))
        )}
      </div>

      <NewTicketWizard
        open={openNew}
        onClose={() => setOpenNew(false)}
        onSubmit={(payload) => createMut.mutate(payload)}
        submitting={createMut.isPending}
        initialJobId={jobIdParam}
      />
    </div>
  )
}
