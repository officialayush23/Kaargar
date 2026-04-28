import { useQuery } from '@tanstack/react-query'
import { api } from '@/lib/api'

export function useCategories(mode) {
  return useQuery({
    queryKey: ['categories', mode],
    queryFn: async () => {
      const params = mode ? { mode } : {}
      const { data } = await api.get('/categories', { params })
      return data
    },
    staleTime: 5 * 60 * 1000,
  })
}

export function useAreas() {
  return useQuery({
    queryKey: ['areas'],
    queryFn: async () => {
      const { data } = await api.get('/categories/areas')
      return data
    },
    staleTime: 10 * 60 * 1000,
  })
}
