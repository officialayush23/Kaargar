import { clsx } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(amount) {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount)
}

export function formatRelativeTime(dateStr) {
  const date = new Date(dateStr)
  const now = new Date()
  const diffMs = now - date
  const diffMin = Math.floor(diffMs / 60000)
  if (diffMin < 1) return 'just now'
  if (diffMin < 60) return `${diffMin}m ago`
  const diffHr = Math.floor(diffMin / 60)
  if (diffHr < 24) return `${diffHr}h ago`
  return date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
}

export function getInitials(name) {
  if (!name) return '?'
  return name.split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2)
}

// FastAPI's own request-validation errors (422s raised by Pydantic, as
// opposed to our own `raise HTTPException(422, "some string")` calls) put a
// LIST of {type, loc, msg, input, ctx} objects in response.data.detail, not
// a string. Passing that straight to toast.error(...) — a pattern used all
// over the admin pages — renders the raw object as a React child and
// crashes the whole page ("Objects are not valid as a React child"). This
// normalizes either shape into a readable string.
export function getErrorMessage(err, fallback = 'Something went wrong') {
  const detail = err?.response?.data?.detail
  if (!detail) return err?.message || fallback
  if (typeof detail === 'string') return detail
  if (Array.isArray(detail)) {
    return detail
      .map(d => (typeof d === 'string' ? d : d?.msg || JSON.stringify(d)))
      .join('; ') || fallback
  }
  return fallback
}

export const PUNE_AREAS = [
  'Hinjewadi', 'Kothrud', 'Aundh', 'Baner', 'Wakad',
  'Pimpri-Chinchwad', 'Hadapsar', 'Kharadi', 'Viman Nagar',
  'Kalyani Nagar', 'Koregaon Park', 'Camp', 'Shivajinagar',
  'Deccan', 'Katraj', 'Kondhwa', 'Magarpatta', 'Sinhagad Road',
  'Warje', 'Bavdhan',
]

export const JOB_STATUS_LABELS = {
  requested: 'Requested',
  searching: 'Finding Worker',
  scheduled: 'Scheduled',
  confirmed: 'Worker Assigned',
  worker_assigned: 'Worker Assigned',
  assigned: 'Worker Assigned',
  en_route: 'On the Way',
  arrived: 'Arrived',
  started: 'In Progress',
  awaiting_approval: 'Awaiting Approval',
  approved: 'Approved',
  disputed: 'Disputed',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'No Worker Found',
}

export const JOB_STATUS_COLORS = {
  requested: '#94A3B8',
  searching: 'var(--accent)',
  scheduled: '#8B5CF6',
  confirmed: '#F59E0B',
  worker_assigned: '#F59E0B',
  assigned: '#D97706',
  en_route: '#8B5CF6',
  arrived: '#06B6D4',
  started: '#22C55E',
  awaiting_approval: '#F59E0B',
  approved: '#22C55E',
  disputed: '#EF4444',
  completed: '#22C55E',
  cancelled: '#EF4444',
  failed: '#EF4444',
}
