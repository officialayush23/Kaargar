import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useWorkerProfile() {
  return useQuery({
    queryKey: ['worker', 'me'],
    queryFn: async () => {
      try {
        const { data } = await api.get('/workers/profile')
        return data
      } catch (e) {
        if (e?.response?.status === 404) return null
        throw e
      }
    },
  })
}

export function useWorkerAnalytics(period = 'today') {
  return useQuery({
    queryKey: ['worker', 'analytics', period],
    queryFn: async () => {
      try {
        const { data } = await api.get('/workers/me/analytics', { params: { period } })
        return data
      } catch {
        return null
      }
    },
    refetchInterval: 30_000,
  })
}

export function useUpdateStatus() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (status) => {
      const { data } = await api.patch('/workers/status', { status })
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['worker'] }),
  })
}

export function useWorkerStatus() {
  return useQuery({
    queryKey: ['worker', 'status'],
    queryFn: async () => {
      try {
        const { data } = await api.get('/workers/me/status')
        return data
      } catch {
        return { status: 'offline' }
      }
    },
    refetchInterval: 15_000,
  })
}

export function useWorkerSchedule() {
  return useQuery({
    queryKey: ['worker', 'schedule'],
    queryFn: async () => {
      const { data } = await api.get('/jobs/me', { params: { status: 'active', as_role: 'worker' } })
      const jobs = data || []

      // GET /jobs/me only ever returns the PARENT row of a multi-day booking
      // (by design — see admin's list_jobs, which does the same to avoid
      // showing 39 separate rows in a flat job list). That's fine for a flat
      // list, but this calendar groups jobs by date to answer "what do I have
      // on day X" — and every child day of a multi-day booking has its OWN
      // date, entirely different from the parent's day-1 date. Showing only
      // the parent meant a worker booked for 39 subsequent days would see
      // that booking on day 1 and then "no jobs scheduled" on every day
      // after, despite being booked solid — actively misleading. Expand any
      // multi-day parent into its full set of day-jobs (each with its own
      // real date) via GET /jobs/{id}/bundle before grouping by date.
      const expanded = await Promise.all(jobs.map(async (job) => {
        if ((job.total_days ?? 1) <= 1) return [job]
        try {
          const { data: bundle } = await api.get(`/jobs/${job.id}/bundle`)
          return bundle?.days?.length ? bundle.days : [job]
        } catch {
          return [job]  // fall back to the parent row rather than dropping it
        }
      }))

      return expanded.flat()
    },
    refetchInterval: 30_000,
  })
}

export function useWorkerMedia(workerId) {
  return useQuery({
    queryKey: ['worker', workerId, 'media'],
    queryFn: async () => {
      const { data } = await api.get(`/workers/${workerId}/media`)
      return data
    },
    enabled: !!workerId,
  })
}
