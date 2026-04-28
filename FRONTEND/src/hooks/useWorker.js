import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useWorkerProfile() {
  return useQuery({
    queryKey: ['worker', 'me'],
    queryFn: async () => {
      const { data } = await api.get('/workers/profile')
      return data
    },
  })
}

export function useWorkerAnalytics(period = 'today') {
  return useQuery({
    queryKey: ['worker', 'analytics', period],
    queryFn: async () => {
      const { data } = await api.get('/workers/me/analytics', { params: { period } })
      return data
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
