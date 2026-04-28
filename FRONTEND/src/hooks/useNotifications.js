import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'
import { useAppStore } from '@/stores/app'

export function useNotifications() {
  const { user } = useAuthStore()
  const { incrementNotif } = useAppStore()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await api.get('/notifications')
      return data
    },
    enabled: !!user,
  })

  // Supabase Realtime subscription
  useEffect(() => {
    if (!user?.id) return
    const channel = supabase
      .channel(`notif:${user.id}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['notifications'] })
        incrementNotif()
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [user?.id])

  return query
}

export function useMarkAllRead() {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: async () => api.patch('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
  })
}
