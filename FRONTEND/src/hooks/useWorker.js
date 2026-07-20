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
      return data
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
