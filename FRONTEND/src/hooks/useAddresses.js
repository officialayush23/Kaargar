/**
 * useAddresses — CRUD hook for user saved addresses.
 * Backed by GET/POST/PATCH/DELETE /v1/addresses
 */
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { api } from '@/lib/api'
import { toast } from 'sonner'

export function useAddresses() {
  return useQuery({
    queryKey: ['addresses'],
    queryFn: async () => {
      const { data } = await api.get('/addresses')
      return data
    },
  })
}

export function useCreateAddress() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (body) => api.post('/addresses', body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['addresses'] })
      toast.success('Address saved')
    },
    onError: () => toast.error('Failed to save address'),
  })
}

export function useUpdateAddress() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: ({ id, ...body }) => api.patch(`/addresses/${id}`, body).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['addresses'] })
      toast.success('Address updated')
    },
    onError: () => toast.error('Failed to update address'),
  })
}

export function useDeleteAddress() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.delete(`/addresses/${id}`).then(r => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['addresses'] })
      toast.success('Address removed')
    },
    onError: () => toast.error('Failed to remove address'),
  })
}

export function useSetDefaultAddress() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: (id) => api.post(`/addresses/${id}/default`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['addresses'] }),
    onError: () => toast.error('Failed to set default'),
  })
}
