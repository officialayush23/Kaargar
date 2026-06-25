/**
 * AdminConfig — view and update platform configuration key-value pairs.
 */
import { useState } from 'react'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { Settings, Edit2, Check, X } from 'lucide-react'
import { api } from '@/lib/api'
import { toast } from 'sonner'

export default function AdminConfig() {
  const qc = useQueryClient()
  const [editKey, setEditKey] = useState(null)
  const [editValue, setEditValue] = useState('')

  const { data: config = [], isLoading } = useQuery({
    queryKey: ['admin', 'config'],
    queryFn: async () => {
      const { data } = await api.get('/admin/config')
      return Array.isArray(data) ? data : Object.entries(data).map(([key, value]) => ({ key, value }))
    },
  })

  const update = useMutation({
    mutationFn: ({ key, value }) => api.patch('/admin/config', { key, value }),
    onSuccess: () => {
      toast.success('Config updated')
      setEditKey(null)
      qc.invalidateQueries({ queryKey: ['admin', 'config'] })
    },
    onError: () => toast.error('Failed to update'),
  })

  function startEdit(key, value) {
    setEditKey(key)
    setEditValue(value)
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold font-syne" style={{ color: '#F1F5F9' }}>Platform Config</h1>
        <p className="text-sm mt-1" style={{ color: '#475569' }}>
          Edit platform-wide settings. Changes take effect immediately.
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-12" style={{ color: '#475569' }}>Loading…</div>
      ) : config.length === 0 ? (
        <div className="text-center py-12" style={{ color: '#475569' }}>
          <Settings className="h-8 w-8 mx-auto mb-2 opacity-30" />
          <p>No config keys found</p>
        </div>
      ) : (
        <div
          className="rounded-2xl overflow-hidden"
          style={{ border: '1px solid rgba(255,255,255,0.07)' }}
        >
          {config.map((item, i) => (
            <div
              key={item.key}
              className="flex items-center gap-4 px-5 py-4"
              style={{
                background: i % 2 === 0 ? 'rgba(13,17,23,0.8)' : 'rgba(13,17,23,0.5)',
                borderBottom: i < config.length - 1 ? '1px solid rgba(255,255,255,0.05)' : 'none',
              }}
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-mono font-medium" style={{ color: '#94A3B8' }}>
                  {item.key}
                </p>
                {item.description && (
                  <p className="text-xs mt-0.5" style={{ color: '#475569' }}>{item.description}</p>
                )}
              </div>

              <div className="flex items-center gap-2">
                {editKey === item.key ? (
                  <>
                    <input
                      value={editValue}
                      onChange={(e) => setEditValue(e.target.value)}
                      className="rounded-lg px-3 py-1.5 text-sm font-mono outline-none"
                      style={{
                        background: 'rgba(255,255,255,0.08)',
                        border: '1px solid #B45309',
                        color: '#F1F5F9',
                        width: 180,
                      }}
                      autoFocus
                    />
                    <button
                      onClick={() => update.mutate({ key: item.key, value: editValue })}
                      disabled={update.isPending}
                      className="p-1.5 rounded-lg transition-all"
                      style={{ background: 'rgba(34,197,94,0.15)', color: '#4ade80' }}
                    >
                      <Check className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => setEditKey(null)}
                      className="p-1.5 rounded-lg transition-all"
                      style={{ background: 'rgba(239,68,68,0.12)', color: '#f87171' }}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </>
                ) : (
                  <>
                    <span
                      className="text-sm font-mono px-3 py-1.5 rounded-lg"
                      style={{ background: 'rgba(255,255,255,0.06)', color: '#F1F5F9' }}
                    >
                      {item.value}
                    </span>
                    <button
                      onClick={() => startEdit(item.key, item.value)}
                      className="p-1.5 rounded-lg transition-all"
                      style={{ color: '#475569' }}
                      onMouseEnter={(e) => e.currentTarget.style.color = '#f59e0b'}
                      onMouseLeave={(e) => e.currentTarget.style.color = '#475569'}
                    >
                      <Edit2 className="h-3.5 w-3.5" />
                    </button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
