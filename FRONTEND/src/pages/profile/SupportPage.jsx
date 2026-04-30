import { useState } from 'react'
import { motion } from 'framer-motion'
import { LifeBuoy, Plus } from 'lucide-react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { GlassCard } from '@/components/glass/GlassCard'
import { GlassButton } from '@/components/glass/GlassButton'
import { GlassModal } from '@/components/glass/GlassModal'
import { GlassInput, GlassTextarea } from '@/components/glass/GlassInput'
import { Skeleton } from '@/components/ui/skeleton'
import { formatRelativeTime } from '@/lib/utils'
import { toast } from 'sonner'

export default function SupportPage() {
  const qc = useQueryClient()
  const [openNew, setOpenNew] = useState(false)
  const [form, setForm] = useState({ title: '', description: '', type: 'general' })

  const { data: tickets, isLoading } = useQuery({
    queryKey: ['tickets'],
    queryFn: async () => (await api.get('/support/tickets')).data
  })

  const createMut = useMutation({
    mutationFn: async (payload) => (await api.post('/support/tickets', payload)).data,
    onSuccess: () => {
      qc.invalidateQueries(['tickets'])
      setOpenNew(false)
      setForm({ title: '', description: '', type: 'general' })
      toast.success('Ticket submitted successfully')
    }
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
                  className="text-[10px] px-2 py-0.5 rounded-full capitalize"
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

      <GlassModal open={openNew} onClose={() => setOpenNew(false)} title="New Ticket">
        <div className="p-6 space-y-4">
          <GlassInput
            label="Subject"
            placeholder="What do you need help with?"
            value={form.title}
            onChange={e => setForm({...form, title: e.target.value})}
          />
          <GlassTextarea
            label="Details"
            placeholder="Please provide as much information as possible..."
            value={form.description}
            onChange={e => setForm({...form, description: e.target.value})}
          />
          <GlassButton
            className="w-full mt-2"
            loading={createMut.isPending}
            onClick={() => createMut.mutate(form)}
          >
            Submit Ticket
          </GlassButton>
        </div>
      </GlassModal>
    </div>
  )
}
