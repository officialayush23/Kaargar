import { CheckCircle, Circle, Loader2 } from 'lucide-react'

/**
 * Each step is a bucket of one or more raw `job.status` values from the
 * backend (jobs.py / matching.py) — not a 1:1 mapping — since:
 *   - discovery bookings start at "confirmed" (a worker is picked directly,
 *     never dispatched/matched), while instant jobs start at "requested"
 *     then "searching" before a worker is even assigned.
 *   - "en_route" is accepted by several backend status checks but nothing
 *     currently transitions a job into it (there's no separate "start
 *     driving" action — the worker goes straight from assigned to arrived),
 *     so it's folded into the "arrived" bucket rather than shown as its own
 *     dead step that would never actually become current.
 *   - awaiting_approval/approved are still "the worker is doing the job /
 *     wrapping up" from a timeline point of view, so they fold into
 *     "started" rather than adding two more rows most users won't parse.
 */
const CUSTOMER_INSTANT_STEPS = [
  { key: 'requested', label: 'Requested',        statuses: ['requested'] },
  { key: 'searching', label: 'Finding a worker',  statuses: ['searching'] },
  { key: 'assigned',  label: 'Worker assigned',   statuses: ['assigned', 'confirmed', 'worker_assigned', 'scheduled'] },
  { key: 'arrived',   label: 'Worker arrived',    statuses: ['en_route', 'arrived'] },
  { key: 'started',   label: 'Work in progress',  statuses: ['started', 'awaiting_approval', 'approved'] },
  { key: 'completed', label: 'Completed',         statuses: ['completed'] },
]

// Discovery bookings assign a specific worker up front — there's no
// dispatch/matching phase, so those two steps never apply.
const CUSTOMER_DISCOVERY_STEPS = CUSTOMER_INSTANT_STEPS.filter(
  s => s.key !== 'requested' && s.key !== 'searching'
)

// The worker already knows they've been assigned (they accepted the job to
// get here) — showing them "Requested → Finding worker → Assigned" is just
// noise about a process they already lived through. Their timeline starts
// at what they still need to do.
const WORKER_STEPS = [
  { key: 'arrived',   label: 'Arrived',      statuses: ['assigned', 'confirmed', 'worker_assigned', 'scheduled', 'en_route', 'arrived'] },
  { key: 'started',   label: 'In progress',  statuses: ['started', 'awaiting_approval', 'approved'] },
  { key: 'completed', label: 'Payment',      statuses: ['completed'] },
]

export function JobStatusTimeline({ status, source = 'instant', isWorkerViewer = false }) {
  const steps = isWorkerViewer
    ? WORKER_STEPS
    : source === 'discovery' ? CUSTOMER_DISCOVERY_STEPS : CUSTOMER_INSTANT_STEPS

  const currentIdx = steps.findIndex(s => s.statuses.includes(status))

  return (
    <div className="flex flex-col gap-3">
      {steps.map((step, i) => {
        const isDone    = currentIdx >= 0 && i < currentIdx
        const isCurrent = i === currentIdx
        const isLast    = i === steps.length - 1

        return (
          <div key={step.key} className="flex items-center gap-3">
            <div className="flex flex-col items-center">
              <div
                className="w-8 h-8 rounded-full flex items-center justify-center transition-all"
                style={
                  isDone    ? { background: 'rgba(34,197,94,0.2)',  color: 'var(--instant)' } :
                  isCurrent ? { background: 'var(--accent-bg-md)', color: 'var(--brand)' }   :
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
              {!isLast && (
                <div
                  className="w-0.5 h-5 mt-1"
                  style={{ background: isDone ? 'rgba(34,197,94,0.4)' : 'var(--g-border)' }}
                />
              )}
            </div>
            <p
              className="text-sm font-medium"
              style={{ color: (isDone || isCurrent) ? 'var(--text-primary)' : 'var(--text-muted)' }}
            >
              {step.label}
            </p>
          </div>
        )
      })}
    </div>
  )
}
