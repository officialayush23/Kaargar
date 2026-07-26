/**
 * AdminServiceRankings — two ranked views:
 *   - System (Instant): the admin catalog, ranked by total_bookings across
 *     ALL workers offering each one.
 *   - Worker (Discover): individual free-text worker services, ranked by
 *     their own total_bookings — "what's quietly performing well that we
 *     haven't made an official Instant service yet." Each row can be
 *     promoted straight into the Instant catalog.
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { TrendingUp, Zap, Compass, Sparkles, Star, AlertCircle } from 'lucide-react'
import { api } from '@/lib/api'

function Tab({ active, onClick, icon: Icon, label }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
      style={{
        background: active ? 'var(--accent)' : 'var(--bg-elevated)',
        color: active ? '#000' : 'var(--text-secondary)',
        border: '1px solid var(--border)',
        cursor: 'pointer',
      }}
    >
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  )
}

function RankBadge({ rank }) {
  const colors = { 1: '#facc15', 2: '#cbd5e1', 3: '#d97706' }
  return (
    <div className="h-7 w-7 rounded-full flex items-center justify-center font-mono text-xs font-bold flex-shrink-0"
      style={{
        background: colors[rank] ? `${colors[rank]}22` : 'var(--bg-elevated)',
        color: colors[rank] || 'var(--text-muted)',
        border: '1px solid var(--border)',
      }}>
      {rank}
    </div>
  )
}

function SystemRankingTable({ services, isLoading }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
            {['#', 'Service', 'Profession', 'Workers Offering', 'Total Bookings', 'Status'].map(h => (
              <th key={h} className="px-4 py-3 text-left font-medium"
                style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading…</td></tr>
          ) : services.length === 0 ? (
            <tr><td colSpan={6} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>No Instant services yet</td></tr>
          ) : services.map((svc, idx) => (
            <tr key={svc.id} style={{ borderBottom: idx < services.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <td className="px-4 py-3"><RankBadge rank={idx + 1} /></td>
              <td className="px-4 py-3 font-medium" style={{ color: 'var(--text-primary)' }}>{svc.name}</td>
              <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{svc.category_name || '—'}</td>
              <td className="px-4 py-3 font-mono" style={{ color: svc.worker_count > 0 ? 'var(--text-secondary)' : '#f87171' }}>
                {svc.worker_count ?? 0}
              </td>
              <td className="px-4 py-3 font-mono font-semibold" style={{ color: 'var(--amber)' }}>{svc.total_bookings}</td>
              <td className="px-4 py-3">
                <span className="px-2 py-1 rounded-full text-xs font-medium"
                  style={{
                    background: svc.is_active ? 'rgba(34,197,94,0.12)' : 'rgba(107,114,128,0.12)',
                    color: svc.is_active ? '#4ade80' : 'var(--text-muted)',
                  }}>
                  {svc.is_active ? 'Active' : 'Inactive'}
                </span>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function WorkerRankingTable({ services, isLoading, onPromote }) {
  return (
    <div className="rounded-xl overflow-hidden" style={{ border: '1px solid var(--border)' }}>
      <table className="w-full text-sm">
        <thead>
          <tr style={{ background: 'var(--bg-elevated)', borderBottom: '1px solid var(--border)' }}>
            {['#', 'Service (as listed)', 'Worker', 'Profession', 'Price', 'Bookings', 'Rating', ''].map(h => (
              <th key={h} className="px-4 py-3 text-left font-medium"
                style={{ color: 'var(--text-muted)', fontSize: 11, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {isLoading ? (
            <tr><td colSpan={8} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>Loading…</td></tr>
          ) : services.length === 0 ? (
            <tr><td colSpan={8} className="px-4 py-8 text-center" style={{ color: 'var(--text-muted)' }}>No worker-added services with bookings yet</td></tr>
          ) : services.map((svc, idx) => (
            <tr key={svc.id} style={{ borderBottom: idx < services.length - 1 ? '1px solid var(--border)' : 'none' }}>
              <td className="px-4 py-3"><RankBadge rank={idx + 1} /></td>
              <td className="px-4 py-3">
                <div className="font-medium" style={{ color: 'var(--text-primary)' }}>{svc.title}</div>
                {svc.description && (
                  <div className="text-xs mt-0.5 max-w-xs truncate" style={{ color: 'var(--text-muted)' }}>{svc.description}</div>
                )}
              </td>
              <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{svc.worker_name}</td>
              <td className="px-4 py-3" style={{ color: 'var(--text-secondary)' }}>{svc.category_name}</td>
              <td className="px-4 py-3 font-mono" style={{ color: 'var(--text-secondary)' }}>
                {svc.price != null ? `₹${svc.price}` : '—'}
              </td>
              <td className="px-4 py-3 font-mono font-semibold" style={{ color: 'var(--amber)' }}>{svc.total_bookings}</td>
              <td className="px-4 py-3">
                {svc.avg_rating ? (
                  <span className="flex items-center gap-1" style={{ color: 'var(--text-secondary)' }}>
                    <Star className="h-3 w-3 fill-current" style={{ color: '#facc15' }} /> {svc.avg_rating.toFixed(1)}
                  </span>
                ) : '—'}
              </td>
              <td className="px-4 py-3">
                <button
                  onClick={() => onPromote(svc)}
                  className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap"
                  style={{ background: 'var(--accent-bg-sm, rgba(245,158,11,0.1))', color: 'var(--amber)', border: '1px solid rgba(245,158,11,0.3)', cursor: 'pointer' }}
                >
                  <Sparkles className="h-3 w-3" /> Promote to Instant
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export default function AdminServiceRankings() {
  const navigate = useNavigate()
  const [tab, setTab] = useState('system') // 'system' | 'worker'
  const [zeroWorkersOnly, setZeroWorkersOnly] = useState(false)

  const { data: systemServices = [], isLoading: systemLoading } = useQuery({
    queryKey: ['admin-service-catalog-ranking', zeroWorkersOnly],
    queryFn: () => api.get('/admin/service-catalog', {
      params: { sort: 'bookings', ...(zeroWorkersOnly ? { zero_workers: true } : {}) },
    }).then(r => r.data),
    enabled: tab === 'system',
  })

  const { data: workerServices = [], isLoading: workerLoading } = useQuery({
    queryKey: ['admin-worker-services-top'],
    queryFn: () => api.get('/admin/worker-services/top').then(r => r.data),
    enabled: tab === 'worker',
  })

  function handlePromote(svc) {
    // Standalone form only — this is just a naming suggestion, never a link
    // back to the worker listing that inspired it.
    navigate('/admin/services', {
      state: {
        category_id: svc.category_id,
        name: svc.title,
        description: svc.description,
      },
    })
  }

  return (
    <div className="p-6 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2" style={{ color: 'var(--text-primary)' }}>
          <TrendingUp className="h-5 w-5" /> Service Rankings
        </h1>
        <p className="text-sm mt-0.5" style={{ color: 'var(--text-muted)' }}>
          See what's actually getting booked — both the official Instant catalog and what workers are quietly doing well with in Discover.
        </p>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Tab active={tab === 'system'} onClick={() => setTab('system')} icon={Zap} label="System (Instant)" />
        <Tab active={tab === 'worker'} onClick={() => setTab('worker')} icon={Compass} label="Worker (Discover)" />
        {tab === 'system' && (
          <button
            onClick={() => setZeroWorkersOnly(v => !v)}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ml-auto"
            style={{
              background: zeroWorkersOnly ? 'rgba(248,113,113,0.12)' : 'var(--bg-elevated)',
              color: zeroWorkersOnly ? '#f87171' : 'var(--text-secondary)',
              border: '1px solid var(--border)',
              cursor: 'pointer',
            }}
          >
            <AlertCircle className="h-3.5 w-3.5" /> Zero workers offering
          </button>
        )}
      </div>

      {tab === 'system' ? (
        <SystemRankingTable services={systemServices} isLoading={systemLoading} />
      ) : (
        <WorkerRankingTable services={workerServices} isLoading={workerLoading} onPromote={handlePromote} />
      )}
    </div>
  )
}
