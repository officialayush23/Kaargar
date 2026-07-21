import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useMyJobs(status = 'active', { asRole, refetchInterval, enabled } = {}) {
  return useQuery({
    queryKey: ['jobs', status, asRole],
    queryFn: async () => {
      const params = { status }
      if (asRole) params.as_role = asRole
      const { data } = await api.get('/jobs/me', { params })
      return data
    },
    ...(refetchInterval ? { refetchInterval } : {}),
    ...(enabled !== undefined ? { enabled } : {}),
  })
}

// Alias used across pages
export const useJobs = useMyJobs

export function useJob(jobId) {
  return useQuery({
    queryKey: ['job', jobId],
    queryFn: async () => {
      const { data } = await api.get(`/jobs/${jobId}`)
      return data
    },
    enabled: !!jobId,
    refetchInterval: 3000,
  })
}

export function useCreateJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async (payload) => {
      const { data } = await api.post('/jobs', payload)
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  })
}

export function useCancelJob() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async ({ jobId, reason }) => {
      const { data } = await api.post(`/jobs/${jobId}/cancel`, { reason })
      return data
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['jobs'] }),
  })
}
