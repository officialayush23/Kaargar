import { CheckCircle, Circle, Loader2 } from 'lucide-react'
import { JOB_STATUS_LABELS, JOB_STATUS_COLORS } from '@/lib/utils'

const TIMELINE_STEPS = [
  'requested', 'searching', 'assigned', 'en_route', 'arrived', 'started', 'completed'
]

export function JobStatusTimeline({ status }) {
  const currentIdx = TIMELINE_STEPS.indexOf(status)

  return (
    <div className="flex flex-col gap-3">
      {TIMELINE_STEPS.map((step, i) => {
        const isDone    = i < currentIdx
        const isCurrent = i === currentIdx
        const isPending = i > currentIdx

        return (
          <div key={step} className="flex items-center gap-3">
            <div className="flex flex-col items-center">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                style={
                  isDone    ? { background: 'rgba(34,197,94,0.2)',  color: 'var(--instant)' } :
                  isCurrent ? { background: 'rgba(245,158,11,0.15)', color: 'var(--brand)' }   :
                              { background: 'var(--g-bg)',           color: 'var(--text-muted)' }
                }
              >
                {isDone ? (
                  <CheckCircle size={16} />
                ) : isCurrent ? (
                  <Loader2 size={14} className="animate-spin" />
                ) : (
                  <Circle size={14} />
                )}
              </div>
              {i < TIMELINE_STEPS.length - 1 && (
                <div
                  className="w-0.5 h-5 mt-1"
                  style={{ background: isDone ? 'rgba(34,197,94,0.4)' : 'var(--g-border)' }}
                />
              )}
            </div>
            <div>
              <p
                className="text-sm font-medium"
                style={{ color: isDone ? 'var(--text-primary)' : 'var(--text-muted)' }}
              >
                {step.label}
              </p>
              {step.time && (
                <p className="text-xs mt-0.5" style={{ color: 'var(--text-muted)' }}>{step.time}</p>
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}
