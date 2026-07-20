import { useState, useEffect, useMemo } from 'react'
import { motion, AnimatePresence } from 'framer-motion'
import { LifeBuoy, Plus, ArrowLeft, ChevronRight, Search } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassModal } from '@/components/glass/GlassModal'
import { GlassInput, GlassTextarea } from '@/components/glass/GlassInput'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRelativeTime, formatCurrency } from '@/lib/utils'
import { toast } from 'sonner'

const REASONS = [
  { key: 'customer_issue', label: 'Issue with a customer' },
  { key: 'payout',         label: 'Payout / earnings issue' },
  { key: 'app_bug',        label: 'App not working correctly' },
  { key: 'account',        label: 'Account or verification issue' },
  { key: 'safety',         label: 'Safety concern' },
  { key: 'other',          label: 'Something else' },
]

/**
 * New-ticket wizard: pick a job → pick what went wrong → submit.
 */
function NewTicketWizard({ open, onClose, onSubmit, submitting }) {
  const [step, setStep] = useState('order')
  const [selectedJob, setSelectedJob] = useState(null)
  const [reason, setReason] = useState(null)
  const [detail, setDetail] = useState('')
  const [search, setSearch] = useState('')

  const { data: activeJobs = [] } = useQuery({
    queryKey: ['worker-support-jobs', 'active'],
    queryFn: async () => (await api.get('/jobs/me', { params: { status: 'active', as_role: 'worker' } })).data,
    enabled: open,
  })
  const { data: pastJobs = [] } = useQuery({
    queryKey: ['worker-support-jobs', 'past'],
    queryFn: async () => (await api.get('/jobs/me', { params: { status: 'past', as_role: 'worker' } })).data,
    enabled: open,
  })

  const orders = useMemo(() => [...activeJobs, ...pastJobs], [activeJobs, pastJobs])
  const filteredOrders = useMemo(() => {
    if (!search.trim()) return orders
    const q = search.toLowerCase()
    return orders.filter(j => (j.category_name || '').toLowerCase().includes(q) || (j.client_name || '').toLowerCase().includes(q))
  }, [orders, search])

  useEffect(() => {
    if (!open) {
      setStep('order')
      setSelectedJob(null)
      setReason(null)
      setDetail('')
      setSearch('')
    }
  }, [open])

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
    const title = selectedJob ? `${reasonLabel} — ${selectedJob.category_name || 'Job'}` : reasonLabel
    const descriptionParts = []
    if (selectedJob) descriptionParts.push(`Job: ${selectedJob.category_name || 'Service'} (${selectedJob.id})`)
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
    <GlassModal open={open} onClose={onClose} title={step === 'order' ? 'Select a job' : 'What went wrong?'} size="md">
      <AnimatePresence mode="wait">
        {step === 'order' && (
          <motion.div key="order" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-3">
            <GlassInput
              placeholder="Search your jobs..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              icon={Search}
            />
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {filteredOrders.length === 0 ? (
                <p className="text-sm text-center py-6" style={{ color: 'var(--text-muted)' }}>No jobs found</p>
              ) : (
                filteredOrders.map(job => (
                  <GlassCard key={job.id} hover onClick={() => pickOrder(job)} className="p-3.5 flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold truncate" style={{ color: 'var(--text-primary)' }}>
                        {job.category_name || 'Service'}
                      </p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>
                        {job.client_name ? `with ${job.client_name} · ` : ''}{formatRelativeTime(job.created_at)}
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
              Not about a specific job →
            </button>
          </motion.div>
        )}

        {step === 'reason' && (
          <motion.div key="reason" initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} className="space-y-4">
            <button
              onClick={() => setStep('order')}
              className="flex items-center gap-1 text-sm"
              style={{ color: 'var(--text-muted)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
            >
              <ArrowLeft size={14} /> Back
            </button>

            {selectedJob && (
              <div className="p-3 rounded-xl flex items-center gap-2" style={{ background: 'var(--g-bg)', border: '1px solid var(--g-border)' }}>
                <p className="text-xs" style={{ color: 'var(--text-secondary)' }}>
                  Re: <span className="font-medium" style={{ color: 'var(--text-primary)' }}>{selectedJob.category_name || 'Job'}</span>
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

export default function WorkerSupport() {
  const qc = useQueryClient()
  const [openNew, setOpenNew] = useState(false)

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => {
      const { data } = await api.get('/support/tickets')
      return data
    }
  })

  const createMut = useMutation({
    mutationFn: async (payload) => {
      const { data } = await api.post('/support/tickets', payload)
      return data
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['tickets'] })
      setOpenNew(false)
      toast.success('Ticket submitted successfully')
    },
    onError: () => toast.error('Could not submit ticket — try again'),
  })

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-syne text-[--text-primary]">Support</h1>
          <p className="text-sm text-[--text-muted]">Manage your help tickets</p>
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
            <p className="text-xs mt-1" style={{ color: 'var(--text-muted)' }}>Need help with a job or payout? Create a ticket.</p>
          </GlassCard>
        ) : (
          tickets?.map(t => (
            <GlassCard key={t.id} className="p-4 cursor-pointer transition-colors">
              <div className="flex justify-between items-start mb-2">
                <p className="text-sm font-semibold text-[--text-primary]">{t.title}</p>
                <span className="text-[12px] px-2 py-0.5 rounded-full capitalize"
                  style={{ background: 'var(--g-bg)', color: 'var(--text-secondary)', border: '1px solid var(--g-border)' }}>
                  {t.status.replace('_', ' ')}
                </span>
              </div>
              <p className="text-xs text-[--text-muted]">{formatRelativeTime(t.created_at)}</p>
            </GlassCard>
          ))
        )}
      </div>

      <NewTicketWizard
        open={openNew}
        onClose={() => setOpenNew(false)}
        onSubmit={(payload) => createMut.mutate(payload)}
        submitting={createMut.isPending}
      />
    </div>
  )
}
