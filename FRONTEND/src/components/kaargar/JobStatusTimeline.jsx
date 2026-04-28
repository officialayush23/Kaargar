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
        const isDone = i < currentIdx
        const isCurrent = i === currentIdx
        const isPending = i > currentIdx

        return (
          <div key={step} className="flex items-center gap-3">
            <div className="flex flex-col items-center">
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-all ${
                  isDone ? 'bg-instant/20 text-instant' :
                  isCurrent ? 'bg-brand/20 text-brand' :
                  'bg-white/5 text-[--text-muted]'
                }`}
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
                <div className={`w-0.5 h-5 mt-1 ${isDone ? 'bg-instant/40' : 'bg-white/5'}`} />
              )}
            </div>
            <div>
              <p className={`text-sm font-medium ${
                isCurrent ? 'text-[--text-primary]' :
                isDone ? 'text-[--text-secondary]' : 'text-[--text-muted]'
              }`}>
                {JOB_STATUS_LABELS[step] || step}
              </p>
            </div>
          </div>
        )
      })}
    </div>
  )
}
