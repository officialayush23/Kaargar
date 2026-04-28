import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useEffect } from 'react'
import { api } from '@/lib/api'
import { supabase } from '@/lib/supabase'
import { useAuthStore } from '@/stores/auth'

export function useNotifications() {
  const { user } = useAuthStore()
  const qc = useQueryClient()

  const query = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const { data } = await api.get('/notifications')
      return Array.isArray(data) ? data : []
    },
    enabled: !!user,
    staleTime: 30_000,
  })

  const markAllMutation = useMutation({
    mutationFn: () => api.patch('/notifications/read-all'),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
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
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [user?.id])

  const notifications = query.data ?? []
  const unreadCount = notifications.filter(n => !n.is_read).length

  return {
    ...query,
    notifications,
    unreadCount,
    markAllRead: markAllMutation.mutate,
  }
}
