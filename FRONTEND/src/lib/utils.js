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
  assigned: 'Worker Assigned',
  en_route: 'On the Way',
  arrived: 'Arrived',
  started: 'In Progress',
  completed: 'Completed',
  cancelled: 'Cancelled',
  failed: 'No Worker Found',
}

export const JOB_STATUS_COLORS = {
  requested: '#94A3B8',
  searching: 'var(--accent)',
  assigned: '#4B7BFF',
  en_route: '#8B5CF6',
  arrived: '#06B6D4',
  started: '#22C55E',
  completed: '#22C55E',
  cancelled: '#EF4444',
  failed: '#EF4444',
}
