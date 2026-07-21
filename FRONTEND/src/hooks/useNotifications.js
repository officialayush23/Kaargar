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

  // Mark a single notification read (called when the user opens/clicks it).
  // Optimistically flips is_read locally so the badge count and the item's
  // unread dot update immediately, without waiting on a refetch.
  const markReadMutation = useMutation({
    mutationFn: (id) => api.patch(`/notifications/${id}/read`),
    onMutate: async (id) => {
      await qc.cancelQueries({ queryKey: ['notifications'] })
      const previous = qc.getQueryData(['notifications'])
      qc.setQueryData(['notifications'], (old = []) =>
        old.map((n) => (n.id === id ? { ...n, is_read: true } : n))
      )
      return { previous }
    },
    onError: (_err, _id, context) => {
      if (context?.previous) qc.setQueryData(['notifications'], context.previous)
    },
    onSettled: () => qc.invalidateQueries({ queryKey: ['notifications'] }),
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
    markRead: markReadMutation.mutate,
  }
}
