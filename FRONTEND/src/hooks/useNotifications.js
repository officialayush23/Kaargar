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

    const channelName = `notif:${user.id}`

    // If a channel with this name already exists (React StrictMode double-invoke),
    // remove it before creating a fresh one. removeChannel is async but this
    // ensures we never call .on() on an already-subscribed channel.
    const existing = supabase.getChannels().find(c => c.topic === `realtime:${channelName}`)
    if (existing) supabase.removeChannel(existing)

    const channel = supabase.channel(channelName)

    channel
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'notifications',
        filter: `user_id=eq.${user.id}`,
      }, () => {
        qc.invalidateQueries({ queryKey: ['notifications'] })
      })
      .subscribe((status) => {
        if (status === 'SUBSCRIBED') {
          console.log('[Realtime] notifications channel ready')
        }
        if (status === 'CHANNEL_ERROR') {
          console.error('[Realtime] notifications channel error — check RLS + replication')
        }
      })

    return () => { supabase.removeChannel(channel) }
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
