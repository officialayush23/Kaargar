import { motion, AnimatePresence } from 'framer-motion'
import { Bell, X, CheckCheck } from 'lucide-react'
import { formatRelativeTime } from '@/lib/utils'
import { useNotifications } from '@/hooks/useNotifications'
import { Button } from '@/components/ui/button'

export function NotificationDrawer({ open, onClose }) {
  const { notifications: notifs = [], isLoading, markAllRead, markRead } = useNotifications()

  const handleMarkAll = () => {
    markAllRead()
  }

  return (
    <AnimatePresence>
      {open && (
        <>
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="fixed inset-0 bg-black/60 z-40"
          />
          <motion.div
            initial={{ x: '100%' }}
            animate={{ x: 0 }}
            exit={{ x: '100%' }}
            transition={{ type: 'spring', damping: 25, stiffness: 300 }}
            className="fixed right-0 top-0 bottom-0 w-full max-w-sm z-50 flex flex-col"
            style={{
              background: 'var(--elevated)',
              borderLeft: '1px solid var(--g-border)',
              boxShadow: '-12px 0 40px rgba(0,0,0,0.25)',
            }}
          >
            <div className="flex items-center justify-between p-5" style={{ borderBottom: '1px solid var(--g-border)' }}>
              <h2 className="font-syne font-bold text-lg">Notifications</h2>
              <div className="flex items-center gap-2">
                <Button variant="ghost" size="icon" onClick={handleMarkAll}>
                  <CheckCheck size={16} />
                </Button>
                <Button variant="ghost" size="icon" onClick={onClose}>
                  <X size={16} />
                </Button>
              </div>
            </div>

            <div className="flex-1 overflow-y-auto p-4 space-y-3">
              {isLoading ? (
                <p className="text-[--text-muted] text-sm text-center mt-8">Loading…</p>
              ) : notifs.length === 0 ? (
                <div className="flex flex-col items-center gap-3 mt-16">
                  <Bell size={32} className="text-[--text-muted]" />
                  <p className="text-[--text-muted] text-sm">No notifications yet</p>
                </div>
              ) : (
                notifs.map((n) => (
                  <div
                    key={n.id}
                    onClick={() => !n.is_read && markRead(n.id)}
                    className={`rounded-xl p-4 cursor-pointer transition-opacity ${!n.is_read ? 'border-l-2 border-brand' : 'opacity-70'}`}
                    style={{ background: 'var(--card)', border: '1px solid var(--card-border)' }}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-[--text-primary]">{n.title}</p>
                        <p className="text-xs text-[--text-secondary] mt-0.5">{n.body}</p>
                      </div>
                      {!n.is_read && (
                        <div className="w-2 h-2 rounded-full bg-brand shrink-0 mt-1" />
                      )}
                    </div>
                    <p className="text-[12px] text-[--text-muted] mt-2">
                      {formatRelativeTime(n.created_at)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
