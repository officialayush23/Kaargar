import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useMyJobs(status = 'active') {
  return useQuery({
    queryKey: ['jobs', status],
    queryFn: async () => {
      const { data } = await api.get('/jobs/me', { params: { status } })
      return data
    },
  })
}

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
